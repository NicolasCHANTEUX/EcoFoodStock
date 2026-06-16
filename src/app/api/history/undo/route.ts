import { apiResult, jsonApiResult } from "@/lib/api/responses";
import { resolveAccountContext } from "@/lib/supabase/account-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveUndoableActivityEvent,
  undoInventoryEventWithRpc,
  undoSettingsEvent
} from "@/services/activity-undo-service";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);

  if (!payload || !payload.eventId) {
    return jsonApiResult(apiResult({ ok: false, message: "eventId required" }, 400));
  }

  let supabase: ReturnType<typeof createSupabaseServerClient>;
  try {
    supabase = createSupabaseServerClient();
  } catch {
    return jsonApiResult(apiResult({ ok: false, message: "Supabase server client not configured" }, 500));
  }

  const context = await resolveAccountContext(req, supabase);
  if (!context.authenticated || !context.appUserId) {
    return jsonApiResult(apiResult({ ok: false, message: "Authentication required" }, 401));
  }

  const eventId = String(payload.eventId);
  const resolvedEvent = await resolveUndoableActivityEvent(supabase, eventId, context.appUserId);

  if (!resolvedEvent.ok) {
    return jsonApiResult(resolvedEvent.result);
  }

  if (resolvedEvent.isSettingsUndo) {
    return jsonApiResult(await undoSettingsEvent(supabase, resolvedEvent.event, context.appUserId));
  }

  return jsonApiResult(await undoInventoryEventWithRpc(supabase, eventId, context.appUserId));
}
