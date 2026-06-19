import { z } from "zod";
import { apiResult, jsonApiResult } from "@/lib/api/responses";
import { checkRateLimits, createRateLimitResponse, rateLimitSubject } from "@/lib/rate-limit";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { normalizeQuantityUnit } from "@/lib/units";
import { createInventoryBatch } from "@/services/inventory-service";

const quantityUnitSchema = z.preprocess(
  (value) => normalizeQuantityUnit(value),
  z.enum(["g", "ml", "pieces", "portions", "pots", "paquets", "bouteilles"])
);

const optionalUuidSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().uuid().optional()
);
const optionalBarcodeSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().regex(/^\d{6,18}$/).optional()
);
const nullableText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().max(maxLength).nullable().optional()
  );
const nullableUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.string().url().max(500).nullable().optional()
);
const nullableDateSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
);

const createBatchSchema = z.object({
  product: z.object({
    id: optionalUuidSchema,
    barcode: optionalBarcodeSchema,
    name: z.string().trim().min(1).max(200),
    brand: nullableText(120),
    category: nullableText(120),
    imageUrl: nullableUrlSchema,
    source: z.enum(["manual", "scan", "open_food_facts"]).optional(),
    default_storage_area: z.enum(["fresh", "frozen", "dry", "other"]).optional(),
    default_unit: quantityUnitSchema.optional(),
    quantityText: nullableText(80)
  }),
  quantity: z.coerce.number().positive().max(100_000),
  unit: quantityUnitSchema,
  storageArea: z.enum(["fresh", "frozen", "dry", "other"]).default("other"),
  expirationDate: nullableDateSchema,
  notes: nullableText(1_000)
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
  const rateLimit = await checkRateLimits([
    {
      scope: "inventory_batch:user",
      subject: rateLimitSubject(context.appUserId ?? householdId),
      limit: 120,
      windowSeconds: 10 * 60
    },
    {
      scope: "inventory_batch:household",
      subject: rateLimitSubject(householdId),
      limit: 300,
      windowSeconds: 10 * 60
    }
  ]);

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

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
