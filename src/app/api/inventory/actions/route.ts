import { z } from "zod";
import { apiResult, jsonApiResult } from "@/lib/api/responses";
import { checkRateLimits, createRateLimitResponse, rateLimitSubject } from "@/lib/rate-limit";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { normalizeQuantityUnit } from "@/lib/units";
import { applyInventoryAction } from "@/services/inventory-service";

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
    return jsonApiResult(
      apiResult({ ok: false, message: "Invalid payload", errors: parsedPayload.error.flatten().fieldErrors }, 400)
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
  const rateLimit = await checkRateLimits([
    {
      scope: "inventory_action:user",
      subject: rateLimitSubject(context.appUserId ?? householdId),
      limit: 180,
      windowSeconds: 10 * 60
    },
    {
      scope: "inventory_action:household",
      subject: rateLimitSubject(householdId),
      limit: 600,
      windowSeconds: 10 * 60
    }
  ]);

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  return jsonApiResult(
    await applyInventoryAction(supabase, {
      householdId,
      userId: context.appUserId,
      productId: payload.productId,
      action: payload.action,
      quantity: payload.quantity,
      storageArea: payload.storageArea,
      unit: payload.unit
    })
  );
}
