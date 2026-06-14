import { NextResponse } from "next/server";
import { resolveAccountContext, userBelongsToHousehold } from "@/lib/supabase/account-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildActivityEventInsert } from "@/lib/activity-events";
import { normalizeQuantityUnit } from "@/lib/units";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);

  if (!payload || !payload.eventId) {
    return NextResponse.json({ ok: false, message: "eventId required" }, { status: 400 });
  }

  const eventId = String(payload.eventId);

  let supabase: ReturnType<typeof createSupabaseServerClient>;
  try {
    supabase = createSupabaseServerClient();
  } catch {
    return NextResponse.json({ ok: false, message: "Supabase server client not configured" }, { status: 500 });
  }

  const context = await resolveAccountContext(req, supabase);
  if (!context.authenticated || !context.appUserId) {
    return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
  }

  // fetch the activity event
  const { data: evRow, error: evErr } = await supabase.from("activity_events").select("id, household_id, type, title, can_undo, undone_at, metadata").eq("id", eventId).maybeSingle();

  if (evErr || !evRow) {
    return NextResponse.json({ ok: false, message: "Event not found" }, { status: 404 });
  }

  if (!evRow.can_undo) {
    return NextResponse.json({ ok: false, message: "Event cannot be undone" }, { status: 400 });
  }

  const canAccessEvent = await userBelongsToHousehold(supabase, context.appUserId, evRow.household_id);
  if (!canAccessEvent) {
    return NextResponse.json({ ok: false, message: "Forbidden household access" }, { status: 403 });
  }

  if (evRow.undone_at) {
    return NextResponse.json({ ok: false, message: "Event already undone" }, { status: 400 });
  }

  const metadata = (evRow.metadata ?? {}) as Record<string, unknown>;
  const isSettingsUndo = metadata.section === "settings";

  if (!isSettingsUndo) {
    const rpcUndo = await tryUndoWithRpc(supabase, eventId, context.appUserId);

    if (rpcUndo.handled) {
      return rpcUndo.response;
    }
  }

  // find related inventory movements (not required for settings events)
  const { data: movements, error: mvErr } = await supabase.from("inventory_movements").select("*").eq("activity_event_id", eventId);

  if (!isSettingsUndo && mvErr) {
    return NextResponse.json({ ok: false, message: "Unable to fetch movements", error: mvErr.message }, { status: 500 });
  }

  // create undo activity event
  const { data: undoEvent, error: undoEventErr } = await supabase
    .from("activity_events")
    .insert(
      buildActivityEventInsert({
        household_id: evRow.household_id,
        type: "undo",
        title: `Action annulée: ${evRow.title}`,
        description: `Annulation de l'action ${evRow.title}`,
        can_undo: false,
        metadata: { undo_of_event_id: eventId }
      })
    )
    .select("id")
    .maybeSingle();

  if (undoEventErr || !undoEvent) {
    return NextResponse.json({ ok: false, message: "Unable to create undo event", error: undoEventErr?.message }, { status: 500 });
  }

  const undoEventId = undoEvent.id;

  const createdUndoMovements: Array<{
    ok: boolean;
    movementId?: string;
    originalMovement?: string;
    undoMovement?: string;
    error?: string;
  }> = [];
  const insertedUndoMovementIds: string[] = [];
  const createdBatchIds: string[] = [];
  const updatedBatchStates: Array<{ batchId: string; quantityRemaining: number; status: string | null }> = [];
  async function rollbackUndoChanges() {
    const rollbackErrors: string[] = [];

    if (insertedUndoMovementIds.length > 0) {
      const { error: rollbackMovementsErr } = await supabase.from("inventory_movements").delete().in("id", insertedUndoMovementIds);
      if (rollbackMovementsErr) {
        rollbackErrors.push(`inventory_movements rollback failed: ${rollbackMovementsErr.message}`);
      }
    }

    for (const previousState of updatedBatchStates) {
      const { error: rollbackBatchErr } = await supabase
        .from("inventory_batches")
        .update({
          quantity_remaining: previousState.quantityRemaining,
          status: previousState.status
        })
        .eq("id", previousState.batchId);
      if (rollbackBatchErr) {
        rollbackErrors.push(`inventory_batches rollback failed for ${previousState.batchId}: ${rollbackBatchErr.message}`);
      }
    }

    if (createdBatchIds.length > 0) {
      const { error: rollbackCreatedBatchesErr } = await supabase.from("inventory_batches").delete().in("id", createdBatchIds);
      if (rollbackCreatedBatchesErr) {
        rollbackErrors.push(`created inventory_batches cleanup failed: ${rollbackCreatedBatchesErr.message}`);
      }
    }

    const { error: rollbackUndoEventErr } = await supabase.from("activity_events").delete().eq("id", undoEventId);
    if (rollbackUndoEventErr) {
      rollbackErrors.push(`undo event cleanup failed: ${rollbackUndoEventErr.message}`);
    }

    return rollbackErrors;
  }

  for (const mv of movements ?? []) {
    try {
      // compute inverse
      const inverse = -Number(mv.quantity_delta);

      // try to restore batch quantity if batch known
      const batchId = mv.inventory_batch_id ?? (mv.metadata && mv.metadata.inventory_batch_id ? mv.metadata.inventory_batch_id : null);

      let effectiveBatchId = null;
      if (batchId) {
        // fetch current batch
        const { data: batchRow, error: batchErr } = await supabase.from("inventory_batches").select("id, quantity_remaining, status").eq("id", batchId).maybeSingle();
        if (batchErr) {
          createdUndoMovements.push({ ok: false, movementId: mv.id, error: batchErr.message });
          continue;
        }
        if (batchRow) {
          const currentQty = Number(batchRow.quantity_remaining ?? 0);
          const newQty = Math.max(0, currentQty + inverse);
          const updatePayload: Record<string, unknown> = { quantity_remaining: newQty };
          if (newQty > 0 && batchRow.status !== "active") {
            updatePayload.status = "active";
          } else if (newQty <= 0 && batchRow.status !== "removed") {
            updatePayload.status = "removed";
          }
          const { error: updateErr } = await supabase.from("inventory_batches").update(updatePayload).eq("id", batchId);
          if (updateErr) {
            createdUndoMovements.push({ ok: false, movementId: mv.id, error: updateErr.message });
            continue;
          }
          updatedBatchStates.push({
            batchId: String(batchId),
            quantityRemaining: currentQty,
            status: batchRow.status ?? null
          });
          effectiveBatchId = batchRow.id;
        }
      }

      // if no batch found, attempt to recreate one using movement data
      if (!effectiveBatchId) {
        if (mv.product_id) {
          const createdQty = inverse > 0 ? inverse : Math.abs(inverse);
          const insertPayload: Record<string, unknown> = {
            household_id: mv.household_id || evRow.household_id,
            product_id: mv.product_id,
            quantity_initial: createdQty,
            quantity_remaining: createdQty,
            unit: normalizeQuantityUnit(mv.unit),
            storage_area: (mv.storage_area as string) || "other",
            status: "active",
            source: "undo_recreated",
            added_by: mv.user_id ?? null
          };

          const { data: createdBatch, error: createBatchErr } = await supabase.from("inventory_batches").insert(insertPayload).select("id").maybeSingle();
          if (createBatchErr) {
            // log error but continue
            createdUndoMovements.push({ ok: false, movementId: mv.id, error: createBatchErr.message });
          } else if (createdBatch && createdBatch.id) {
            createdBatchIds.push(createdBatch.id);
            effectiveBatchId = createdBatch.id;
          }
        }
      }

      // insert inverse movement referencing original movement
      const { data: insertedMv, error: insertMvErr } = await supabase.from("inventory_movements").insert({
        household_id: mv.household_id,
        inventory_batch_id: effectiveBatchId ?? mv.inventory_batch_id,
        product_id: mv.product_id,
        user_id: mv.user_id,
        type: "undo",
        quantity_delta: inverse,
        unit: mv.unit,
        reason: `Undo of movement ${mv.id}`,
        activity_event_id: undoEventId,
        undo_of_movement_id: mv.id,
        metadata: { undo_of_activity_event: eventId }
      }).select().maybeSingle();

      if (insertMvErr) {
        // continue but record error
        createdUndoMovements.push({ ok: false, movementId: mv.id, error: insertMvErr.message });
      } else {
        if (insertedMv?.id) {
          insertedUndoMovementIds.push(insertedMv.id);
        }
        createdUndoMovements.push({ ok: true, originalMovement: mv.id, undoMovement: insertedMv?.id });
      }
    } catch (e) {
      createdUndoMovements.push({ ok: false, movementId: mv.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const failedUndoMovements = createdUndoMovements.filter((movement) => !movement.ok);
  if (failedUndoMovements.length > 0) {
    const rollbackErrors = await rollbackUndoChanges();

    return NextResponse.json(
      {
        ok: false,
        message: "Undo failed, no changes were finalized",
        movementErrors: failedUndoMovements,
        rollbackErrors
      },
      { status: 500 }
    );
  }

  // mark original activity as undone
  const { error: markUndoneErr } = await supabase.from("activity_events").update({ undone_at: new Date().toISOString(), can_undo: false }).eq("id", eventId);
  if (markUndoneErr) {
    const rollbackErrors = await rollbackUndoChanges();
    return NextResponse.json(
      {
        ok: false,
        message: "Undo failed, no changes were finalized",
        error: markUndoneErr.message,
        rollbackErrors
      },
      { status: 500 }
    );
  }

  const restoredSettingsProfile = isSettingsUndo && typeof metadata.previous_profile === "object"
    ? (metadata.previous_profile as Record<string, unknown>)
    : null;

  return NextResponse.json({
    ok: true,
    undoneEventId: undoEventId,
    movements: createdUndoMovements,
    restoredSettingsProfile
  });
}

async function tryUndoWithRpc(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  eventId: string,
  userId: string
) {
  const { data, error } = await supabase.rpc("undo_activity_event", {
    p_event_id: eventId,
    p_user_id: userId
  });

  if (error) {
    if (isMissingRpcError(error.message, error.code)) {
      return { handled: false as const };
    }

    return {
      handled: true as const,
      response: NextResponse.json(
        { ok: false, message: "Undo failed in database transaction", error: error.message },
        { status: 500 }
      )
    };
  }

  return {
    handled: true as const,
    response: NextResponse.json(data ?? { ok: true })
  };
}

function isMissingRpcError(message?: string, code?: string) {
  const normalizedMessage = message?.toLowerCase() ?? "";
  return code === "PGRST202" || normalizedMessage.includes("could not find the function");
}
