import { buildActivityEventInsert } from "@/lib/activity-events";
import { apiResult, isMissingRpcError, isRecord, type ApiResult } from "@/lib/api/responses";
import { userBelongsToHousehold } from "@/lib/supabase/account-context";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

type UndoActivityEventRow = {
  id: string;
  household_id: string;
  type: string;
  title: string;
  can_undo: boolean;
  undone_at: string | null;
  metadata: Record<string, unknown> | null;
};

type UndoRpcBody = {
  ok?: boolean;
  status?: number;
  message?: string;
  [key: string]: unknown;
};

type UndoEventResolution =
  | {
      ok: true;
      event: UndoActivityEventRow;
      isSettingsUndo: boolean;
    }
  | {
      ok: false;
      result: ApiResult;
    };

export async function resolveUndoableActivityEvent(
  supabase: SupabaseServerClient,
  eventId: string,
  userId: string
): Promise<UndoEventResolution> {
  const { data: event, error } = await supabase
    .from("activity_events")
    .select("id, household_id, type, title, can_undo, undone_at, metadata")
    .eq("id", eventId)
    .maybeSingle<UndoActivityEventRow>();

  if (error || !event) {
    if (error) {
      console.error("undo event lookup failed", error.message);
    }

    return { ok: false, result: apiResult({ ok: false, message: "Event not found" }, 404) };
  }

  if (!event.can_undo) {
    return { ok: false, result: apiResult({ ok: false, message: "Event cannot be undone" }, 400) };
  }

  const canAccessEvent = await userBelongsToHousehold(supabase, userId, event.household_id);
  if (!canAccessEvent) {
    return { ok: false, result: apiResult({ ok: false, message: "Forbidden household access" }, 403) };
  }

  if (event.undone_at) {
    return { ok: false, result: apiResult({ ok: false, message: "Event already undone" }, 400) };
  }

  const metadata = event.metadata ?? {};

  return {
    ok: true,
    event,
    isSettingsUndo: metadata.section === "settings"
  };
}

export async function undoInventoryEventWithRpc(
  supabase: SupabaseServerClient,
  eventId: string,
  userId: string
): Promise<ApiResult<UndoRpcBody>> {
  const { data, error } = await supabase.rpc("undo_activity_event", {
    p_event_id: eventId,
    p_user_id: userId
  });

  if (error) {
    console.error("undo_activity_event rpc failed", {
      code: error.code,
      message: error.message
    });

    return apiResult(
      {
        ok: false,
        message: isMissingRpcError(error.message, error.code, "undo_activity_event")
          ? "Undo transaction RPC is not installed"
          : "Undo failed in database transaction"
      },
      isMissingRpcError(error.message, error.code, "undo_activity_event") ? 503 : 500
    );
  }

  if (data === null || data === undefined) {
    return apiResult({ ok: true });
  }

  if (!isRecord<UndoRpcBody>(data)) {
    console.error("undo_activity_event rpc returned an unexpected payload", data);
    return apiResult({ ok: false, message: "Undo transaction returned an invalid response" }, 500);
  }

  return apiResult(data);
}

export async function undoSettingsEvent(
  supabase: SupabaseServerClient,
  event: UndoActivityEventRow,
  userId: string
): Promise<ApiResult<UndoRpcBody>> {
  const { data: undoEvent, error: undoEventError } = await supabase
    .from("activity_events")
    .insert(
      buildActivityEventInsert({
        household_id: event.household_id,
        user_id: userId,
        type: "undo",
        title: `Action annulee: ${event.title}`,
        description: `Annulation de l'action ${event.title}`,
        can_undo: false,
        metadata: { undo_of_event_id: event.id }
      })
    )
    .select("id")
    .maybeSingle<{ id: string }>();

  if (undoEventError || !undoEvent?.id) {
    console.error("settings undo event creation failed", undoEventError?.message);
    return apiResult({ ok: false, message: "Unable to undo settings event" }, 500);
  }

  const { error: markUndoneError } = await supabase
    .from("activity_events")
    .update({ undone_at: new Date().toISOString(), can_undo: false })
    .eq("id", event.id);

  if (markUndoneError) {
    console.error("settings undo mark original event failed", markUndoneError.message);
    await supabase.from("activity_events").delete().eq("id", undoEvent.id);
    return apiResult({ ok: false, message: "Unable to undo settings event" }, 500);
  }

  const metadata = event.metadata ?? {};
  const restoredSettingsProfile =
    typeof metadata.previous_profile === "object" && metadata.previous_profile !== null
      ? (metadata.previous_profile as Record<string, unknown>)
      : null;

  return apiResult({
    ok: true,
    undoneEventId: undoEvent.id,
    movements: [],
    restoredSettingsProfile
  });
}
