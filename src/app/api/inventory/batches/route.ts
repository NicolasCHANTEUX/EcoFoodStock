import { z } from "zod";
import { apiResult, jsonApiResult } from "@/lib/api/responses";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { normalizeQuantityUnit } from "@/lib/units";
import { createInventoryBatch } from "@/services/inventory-service";

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

export async function POST(req: Request) {
  const rawPayload = await req.json().catch(() => null);
  const parsedPayload = createBatchSchema.safeParse(rawPayload);

  if (!parsedPayload.success) {
    return jsonApiResult(
      apiResult({ ok: false, message: "Invalid payload", errors: parsedPayload.error.flatten().fieldErrors }, 400)
    );
  }

  const payload = parsedPayload.data;
  const access = await requireHouseholdAccess(req, { requireAuth: true });

  if (!access.ok) {
    return access.response;
  }

  const { context, householdId, supabase } = access;

  return jsonApiResult(
    await createInventoryBatch(supabase, {
      householdId,
      userId: context.appUserId,
      product: payload.product,
      quantity: payload.quantity,
      unit: payload.unit,
      storageArea: payload.storageArea,
      expirationDate: payload.expirationDate || null,
      notes: payload.notes ?? null
    })
  );
}
