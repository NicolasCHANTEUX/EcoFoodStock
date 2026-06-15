import { NextResponse } from "next/server";
import { z } from "zod";
import { buildActivityEventInsert } from "@/lib/activity-events";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeQuantityUnit } from "@/lib/units";

const quantityUnitSchema = z.preprocess(
  (value) => normalizeQuantityUnit(value),
  z.enum(["g", "ml", "pieces", "portions", "pots", "paquets", "bouteilles"])
);

const createBatchSchema = z.object({
  product: z.object({
    id: z.string().trim().optional(),
    barcode: z.string().trim().optional(),
    name: z.string().trim().min(1),
    brand: z.string().trim().nullable().optional(),
    category: z.string().trim().nullable().optional(),
    imageUrl: z.string().trim().nullable().optional(),
    source: z.string().trim().optional(),
    default_storage_area: z.enum(["fresh", "frozen", "dry", "other"]).optional(),
    default_unit: quantityUnitSchema.optional(),
    quantityText: z.string().trim().nullable().optional()
  }),
  quantity: z.coerce.number().positive(),
  unit: quantityUnitSchema,
  storageArea: z.enum(["fresh", "frozen", "dry", "other"]).default("other"),
  expirationDate: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional()
});

type CreateInventoryBatchRpcBody = {
  ok?: boolean;
  status?: number;
  [key: string]: unknown;
};

type CreateInventoryBatchRpcResult =
  | { available: true; body: CreateInventoryBatchRpcBody }
  | { available: false };

export async function POST(req: Request) {
  const rawPayload = await req.json().catch(() => null);
  const parsedPayload = createBatchSchema.safeParse(rawPayload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { ok: false, message: "Invalid payload", errors: parsedPayload.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const payload = parsedPayload.data;
  const access = await requireHouseholdAccess(req, { requireAuth: true });

  if (!access.ok) {
    return access.response;
  }

  const { context, householdId, supabase } = access;
  const productId = await resolveProductId(supabase, payload.product).catch((error) => {
    console.error("product upsert error:", error);
    return undefined;
  });

  if (!productId) {
    return NextResponse.json({ ok: false, message: "Could not determine product id" }, { status: 500 });
  }

  const source = payload.product.barcode ? "scan" : "manual";
  const rpcResult = await tryCreateInventoryBatchWithRpc(supabase, {
    householdId,
    userId: context.appUserId,
    productId,
    productName: payload.product.name,
    quantity: payload.quantity,
    unit: payload.unit,
    storageArea: payload.storageArea,
    expirationDate: payload.expirationDate || null,
    notes: payload.notes ?? null,
    source
  });

  if (rpcResult.available) {
    const status = typeof rpcResult.body.status === "number" ? rpcResult.body.status : rpcResult.body.ok ? 200 : 500;
    return NextResponse.json(rpcResult.body, { status });
  }

  const batchInsert = {
    household_id: householdId,
    product_id: productId,
    quantity_initial: payload.quantity,
    quantity_remaining: payload.quantity,
    unit: payload.unit,
    storage_area: payload.storageArea,
    expiration_date: payload.expirationDate || null,
    added_by: context.appUserId ?? null,
    notes: payload.notes ?? null,
    source
  };

  const { data: batch, error: batchError } = await supabase
    .from("inventory_batches")
    .insert(batchInsert)
    .select()
    .maybeSingle();

  if (batchError || !batch) {
    return NextResponse.json({ ok: false, message: "Unable to create inventory batch", error: batchError?.message }, { status: 500 });
  }

  const { data: activityEvent, error: activityError } = await supabase
    .from("activity_events")
    .insert(
      buildActivityEventInsert({
        household_id: householdId,
        user_id: context.appUserId ?? null,
        type: "product_added",
        title: `+${payload.quantity} ${payload.product.name} ajouté au stock`,
        description: `${payload.quantity} ${payload.unit} - ajout ${source === "scan" ? "via scan" : "manuel"}`,
        product_id: productId,
        can_undo: true,
        metadata: {
          source,
          inventory_batch_id: batch.id
        }
      })
    )
    .select("id")
    .maybeSingle<{ id: string }>();

  if (activityError || !activityEvent?.id) {
    const rollbackErrors = await rollbackCreatedBatch(supabase, batch.id);
    return NextResponse.json(
      { ok: false, message: "Batch created but activity could not be recorded", error: activityError?.message, rollbackErrors },
      { status: 500 }
    );
  }

  const { data: movement, error: movementError } = await supabase
    .from("inventory_movements")
    .insert({
      household_id: householdId,
      inventory_batch_id: batch.id,
      product_id: productId,
      user_id: context.appUserId ?? null,
      type: "add",
      quantity_delta: payload.quantity,
      unit: payload.unit,
      reason: source === "scan" ? "Ajout depuis scan" : "Ajout manuel",
      activity_event_id: activityEvent.id,
      metadata: { source, activity_event_id: activityEvent.id }
    })
    .select()
    .maybeSingle();

  if (movementError || !movement) {
    const rollbackErrors = await rollbackCreatedBatch(supabase, batch.id, activityEvent.id);
    return NextResponse.json(
      { ok: false, message: "Batch created but movement could not be recorded", error: movementError?.message, rollbackErrors },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    batch,
    movement,
    product: { id: productId, name: payload.product.name },
    activityEventId: activityEvent.id
  });
}

async function tryCreateInventoryBatchWithRpc(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  payload: {
    householdId: string;
    userId?: string | null;
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    storageArea: string;
    expirationDate?: string | null;
    notes?: string | null;
    source: string;
  }
): Promise<CreateInventoryBatchRpcResult> {
  const { data, error } = await supabase.rpc("create_inventory_batch_with_activity", {
    p_household_id: payload.householdId,
    p_user_id: payload.userId ?? null,
    p_product_id: payload.productId,
    p_product_name: payload.productName,
    p_quantity: payload.quantity,
    p_unit: payload.unit,
    p_storage_area: payload.storageArea,
    p_expiration_date: payload.expirationDate ?? null,
    p_notes: payload.notes ?? null,
    p_source: payload.source
  });

  if (error) {
    if (!isMissingCreateBatchRpcError(error.message)) {
      console.warn("create_inventory_batch_with_activity rpc failed, falling back to application flow", error.message);
    }

    return { available: false };
  }

  if (!isRecord(data)) {
    console.warn("create_inventory_batch_with_activity rpc returned an unexpected payload, falling back to application flow", data);
    return { available: false };
  }

  return { available: true, body: data };
}

async function resolveProductId(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  product: z.infer<typeof createBatchSchema>["product"]
) {
  if (product.id) {
    return product.id;
  }

  const upsertPayload: Record<string, unknown> = {
    name: product.name,
    brand: product.brand ?? null,
    category: product.category ?? null,
    image_url: product.imageUrl ?? null,
    source: product.source ?? "manual",
    default_storage_area: product.default_storage_area ?? "other",
    default_unit: product.default_unit ?? "pieces"
  };

  if (product.barcode) {
    upsertPayload.barcode = product.barcode;
  }

  const { data: storedProduct, error: upsertError } = await supabase
    .from("products")
    .upsert(upsertPayload, product.barcode ? { onConflict: "barcode" } : undefined)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (upsertError) {
    throw upsertError;
  }

  return storedProduct?.id;
}

async function rollbackCreatedBatch(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  batchId: string,
  activityEventId?: string
) {
  const errors: string[] = [];

  if (activityEventId) {
    const { error } = await supabase.from("activity_events").delete().eq("id", activityEventId);
    if (error) {
      errors.push(`activity_events: ${error.message}`);
    }
  }

  const { error } = await supabase.from("inventory_batches").delete().eq("id", batchId);
  if (error) {
    errors.push(`inventory_batches: ${error.message}`);
  }

  return errors;
}

function isMissingCreateBatchRpcError(message?: string) {
  const normalizedMessage = message?.toLowerCase() ?? "";
  return (
    normalizedMessage.includes("could not find the function") ||
    normalizedMessage.includes("schema cache") ||
    normalizedMessage.includes("create_inventory_batch_with_activity")
  );
}

function isRecord(value: unknown): value is CreateInventoryBatchRpcBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
