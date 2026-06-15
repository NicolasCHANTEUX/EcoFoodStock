import { NextResponse } from "next/server";
import { z } from "zod";
import { buildActivityEventInsert } from "@/lib/activity-events";
import { planInventoryBatchConsumption } from "@/lib/inventory-actions";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeQuantityUnit } from "@/lib/units";

type InventoryAction = "consume" | "waste" | "adjust";

type ActiveBatchRow = {
  id: string;
  household_id: string;
  product_id: string;
  quantity_remaining: number;
  unit: string;
  status: string;
  expiration_date: string | null;
  storage_area: string;
};

type InventoryMovementInsert = {
  household_id: string;
  user_id: string | null;
  inventory_batch_id: string;
  product_id: string;
  type: string;
  quantity_delta: number;
  unit: string;
  reason: string;
  activity_event_id: string;
  metadata: Record<string, unknown>;
};

type RollbackBatchState = {
  id: string;
  quantity_remaining: number;
  status: string;
};

type InventoryActionRpcBody = {
  ok?: boolean;
  status?: number;
  [key: string]: unknown;
};

type InventoryActionRpcResult =
  | { available: true; body: InventoryActionRpcBody }
  | { available: false };

const quantityUnitSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    return normalizeQuantityUnit(value);
  },
  z.enum(["g", "ml", "pieces", "portions", "pots", "paquets", "bouteilles"]).optional()
);

const inventoryActionSchema = z.object({
  productId: z.string().trim().min(1),
  action: z.enum(["consume", "waste", "adjust"]),
  quantity: z.coerce.number().positive(),
  householdId: z.string().trim().optional(),
  storageArea: z.enum(["fresh", "frozen", "dry", "other"]).optional(),
  unit: quantityUnitSchema
});

export async function POST(req: Request) {
  const rawPayload = await req.json().catch(() => null);
  const parsedPayload = inventoryActionSchema.safeParse(rawPayload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { ok: false, message: "Invalid payload", errors: parsedPayload.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const payload = parsedPayload.data;
  const access = await requireHouseholdAccess(req, {
    requireAuth: true,
    requestedHouseholdId: payload.householdId
  });

  if (!access.ok) {
    return access.response;
  }

  const { context, householdId, supabase } = access;
  const productId = extractProductId(payload.productId);
  const rpcResult = await tryApplyInventoryActionWithRpc(supabase, {
    householdId,
    userId: context.appUserId,
    productId,
    action: payload.action,
    quantity: payload.quantity,
    storageArea: payload.storageArea,
    unit: payload.unit
  });

  if (rpcResult.available) {
    const status = typeof rpcResult.body.status === "number" ? rpcResult.body.status : rpcResult.body.ok ? 200 : 500;
    return NextResponse.json(rpcResult.body, { status });
  }

  const batches = await loadMatchingBatches(supabase, {
    householdId,
    productId,
    storageArea: payload.storageArea,
    unit: payload.unit
  });

  if (batches.error || batches.rows.length === 0) {
    return NextResponse.json(
      { ok: false, message: "No active batch found for this product", error: batches.error?.message },
      { status: 404 }
    );
  }

  const consumptionPlan = planInventoryBatchConsumption(batches.rows, payload.quantity);

  if (consumptionPlan.remainingQuantity > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Requested quantity is greater than available stock",
        availableQuantity: consumptionPlan.totalAvailable
      },
      { status: 409 }
    );
  }

  const { data: productRow } = await supabase
    .from("products")
    .select("name")
    .eq("id", productId)
    .maybeSingle<{ name: string }>();

  const movementType = getMovementType(payload.action);
  const productName = productRow?.name ?? productId;
  const firstUnit = payload.unit ?? normalizeQuantityUnit(batches.rows[0]?.unit);
  const eventText = getActionText(payload.action);

  const { data: activityEvent, error: activityError } = await supabase
    .from("activity_events")
    .insert(
      buildActivityEventInsert({
        household_id: householdId,
        user_id: context.appUserId ?? null,
        type:
          movementType === "waste"
            ? "product_wasted"
            : movementType === "adjust"
              ? "product_adjusted"
              : "product_consumed",
        title: `${productName} ${eventText.titleSuffix}`,
        description: `${payload.quantity} ${firstUnit} ${eventText.descriptionSuffix}`,
        product_id: productId,
        can_undo: true,
        metadata: {
          source: "inventory_action",
          action: payload.action,
          requested_quantity: payload.quantity,
          storage_area: payload.storageArea ?? null,
          unit: payload.unit ?? null,
          inventory_movement_pending: true
        }
      })
    )
    .select("id")
    .maybeSingle<{ id: string }>();

  if (activityError || !activityEvent?.id) {
    return NextResponse.json({ ok: false, message: "Unable to record activity", error: activityError?.message }, { status: 500 });
  }

  const rollbackBatchStates: RollbackBatchState[] = [];
  const insertedMovementIds: string[] = [];
  const updatedBatches: ActiveBatchRow[] = [];
  const movements: unknown[] = [];

  for (const step of consumptionPlan.steps) {
    const batch = step.batch;
    const batchQuantity = step.quantityBefore;
    const appliedQuantity = step.appliedQuantity;
    const nextRemaining = step.quantityAfter;
    const updatePayload: Record<string, unknown> = {
      quantity_remaining: nextRemaining
    };

    if (nextRemaining === 0) {
      updatePayload.status =
        payload.action === "waste" ? "wasted" : payload.action === "consume" ? "consumed" : "removed";
    }

    const { data: updatedBatch, error: updateError } = await updateInventoryBatchQuantity(
      supabase,
      batch.id,
      updatePayload
    );

    if (updateError || !updatedBatch) {
      const rollbackErrors = await rollbackInventoryAction(supabase, rollbackBatchStates, insertedMovementIds, activityEvent.id);
      return NextResponse.json(
        { ok: false, message: "Unable to update batch", error: updateError?.message, rollbackErrors },
        { status: 500 }
      );
    }

    rollbackBatchStates.push({
      id: batch.id,
      quantity_remaining: batchQuantity,
      status: batch.status
    });
    updatedBatches.push(updatedBatch);

    const movementPayload: InventoryMovementInsert = {
      household_id: householdId,
      user_id: context.appUserId ?? null,
      inventory_batch_id: batch.id,
      product_id: productId,
      type: movementType,
      quantity_delta: -appliedQuantity,
      unit: batch.unit,
      reason: eventText.reason,
      activity_event_id: activityEvent.id,
      metadata: {
        source: "inventory_action",
        action: payload.action,
        activity_event_id: activityEvent.id
      }
    };

    const { data: movement, error: movementError } = await insertInventoryMovementWithFallback(
      supabase,
      movementPayload,
      payload.action
    );

    if (movementError || !movement) {
      const rollbackErrors = await rollbackInventoryAction(supabase, rollbackBatchStates, insertedMovementIds, activityEvent.id);
      console.error("inventory action movement insert failed", {
        action: payload.action,
        productId,
        batchId: batch.id,
        error: movementError?.message,
        rollbackErrors
      });
      return NextResponse.json(
        {
          ok: false,
          message: "Batch updated but movement not recorded",
          error: movementError?.message,
          rollbackErrors
        },
        { status: 500 }
      );
    }

    insertedMovementIds.push(movement.id);
    movements.push(movement);
  }

  if (consumptionPlan.remainingQuantity > 0) {
    const rollbackErrors = await rollbackInventoryAction(supabase, rollbackBatchStates, insertedMovementIds, activityEvent.id);
    return NextResponse.json(
      { ok: false, message: "Unable to apply the full quantity", remainingQuantity: consumptionPlan.remainingQuantity, rollbackErrors },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    batches: updatedBatches,
    movements,
    appliedQuantity: payload.quantity,
    activityEventId: activityEvent.id
  });
}

async function tryApplyInventoryActionWithRpc(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  payload: {
    householdId: string;
    userId?: string | null;
    productId: string;
    action: InventoryAction;
    quantity: number;
    storageArea?: string;
    unit?: string;
  }
): Promise<InventoryActionRpcResult> {
  const { data, error } = await supabase.rpc("apply_inventory_action", {
    p_household_id: payload.householdId,
    p_user_id: payload.userId ?? null,
    p_product_id: payload.productId,
    p_action: payload.action,
    p_quantity: payload.quantity,
    p_storage_area: payload.storageArea ?? null,
    p_unit: payload.unit ?? null
  });

  if (error) {
    if (!isMissingRpcError(error.message)) {
      console.warn("apply_inventory_action rpc failed, falling back to application flow", error.message);
    }

    return { available: false };
  }

  if (!isRecord(data)) {
    console.warn("apply_inventory_action rpc returned an unexpected payload, falling back to application flow", data);
    return { available: false };
  }

  return { available: true, body: data };
}

async function updateInventoryBatchQuantity(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  batchId: string,
  updatePayload: Record<string, unknown>
) {
  const firstAttempt = await supabase
    .from("inventory_batches")
    .update(updatePayload)
    .eq("id", batchId)
    .select("id, household_id, product_id, quantity_remaining, unit, status, expiration_date, storage_area")
    .maybeSingle<ActiveBatchRow>();

  if (!firstAttempt.error || updatePayload.status === undefined || !isSchemaValueError(firstAttempt.error.message)) {
    return firstAttempt;
  }

  const relaxedPayload = { ...updatePayload };
  delete relaxedPayload.status;

  console.warn("inventory batch status update rejected, retrying quantity-only update", {
    batchId,
    status: updatePayload.status,
    error: firstAttempt.error.message
  });

  return supabase
    .from("inventory_batches")
    .update(relaxedPayload)
    .eq("id", batchId)
    .select("id, household_id, product_id, quantity_remaining, unit, status, expiration_date, storage_area")
    .maybeSingle<ActiveBatchRow>();
}

async function loadMatchingBatches(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  options: {
    householdId: string;
    productId: string;
    storageArea?: string;
    unit?: string;
  }
) {
  let query = supabase
    .from("inventory_batches")
    .select("id, household_id, product_id, quantity_remaining, unit, status, expiration_date, storage_area")
    .eq("product_id", options.productId)
    .eq("household_id", options.householdId)
    .eq("status", "active")
    .gt("quantity_remaining", 0);

  if (options.storageArea) {
    query = query.eq("storage_area", options.storageArea);
  }

  const { data, error } = await query
    .order("expiration_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .returns<ActiveBatchRow[]>();

  const rows = data ?? [];

  if (!options.unit) {
    return { rows, error };
  }

  const normalizedUnit = normalizeQuantityUnit(options.unit);
  return {
    rows: rows.filter((row) => normalizeQuantityUnit(row.unit) === normalizedUnit),
    error
  };
}

async function insertInventoryMovementWithFallback(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  payload: InventoryMovementInsert,
  action: InventoryAction
) {
  const candidates = getMovementTypeCandidates(action, payload.type);
  let lastError: { message?: string } | null = null;

  for (const type of candidates) {
    const { data, error } = await supabase
      .from("inventory_movements")
      .insert({ ...payload, type })
      .select()
      .maybeSingle<{ id: string }>();

    if (!error && data) {
      return { data, error: null };
    }

    lastError = error;

    if (!isSchemaValueError(error?.message)) {
      break;
    }
  }

  return { data: null, error: lastError };
}

function getMovementTypeCandidates(action: InventoryAction, preferredType: string) {
  const legacyByAction: Record<InventoryAction, string[]> = {
    consume: ["consumed"],
    waste: ["wasted"],
    adjust: ["adjusted"]
  };

  return Array.from(new Set([preferredType, ...legacyByAction[action]]));
}

function isSchemaValueError(message?: string) {
  const normalizedMessage = message?.toLowerCase() ?? "";
  return (
    normalizedMessage.includes("enum") ||
    normalizedMessage.includes("invalid input value") ||
    normalizedMessage.includes("batch_status") ||
    normalizedMessage.includes("movement_type")
  );
}

function isMissingRpcError(message?: string) {
  const normalizedMessage = message?.toLowerCase() ?? "";
  return (
    normalizedMessage.includes("could not find the function") ||
    normalizedMessage.includes("schema cache") ||
    normalizedMessage.includes("apply_inventory_action")
  );
}

function isRecord(value: unknown): value is InventoryActionRpcBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function rollbackInventoryAction(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  batchStates: RollbackBatchState[],
  movementIds: string[],
  activityEventId: string
) {
  const errors: string[] = [];

  if (movementIds.length > 0) {
    const { error } = await supabase.from("inventory_movements").delete().in("id", movementIds);
    if (error) {
      errors.push(`inventory_movements: ${error.message}`);
    }
  }

  for (const state of batchStates.reverse()) {
    const { error } = await supabase
      .from("inventory_batches")
      .update({
        quantity_remaining: state.quantity_remaining,
        status: state.status
      })
      .eq("id", state.id);

    if (error) {
      errors.push(`inventory_batches ${state.id}: ${error.message}`);
    }
  }

  const { error } = await supabase.from("activity_events").delete().eq("id", activityEventId);
  if (error) {
    errors.push(`activity_events: ${error.message}`);
  }

  return errors;
}

function extractProductId(value: string) {
  return value.includes(":") ? value.split(":")[0] : value;
}

function getMovementType(action: InventoryAction) {
  if (action === "waste") {
    return "waste";
  }

  if (action === "adjust") {
    return "adjust";
  }

  return "consume";
}

function getActionText(action: InventoryAction) {
  if (action === "waste") {
    return {
      titleSuffix: "jeté",
      descriptionSuffix: "sorti du stock",
      reason: "Sortie du stock (jeté)"
    };
  }

  if (action === "adjust") {
    return {
      titleSuffix: "ajusté",
      descriptionSuffix: "ajusté manuellement",
      reason: "Ajustement manuel"
    };
  }

  return {
    titleSuffix: "consommé",
    descriptionSuffix: "retiré du stock",
    reason: "Sortie du stock (consommé)"
  };
}
