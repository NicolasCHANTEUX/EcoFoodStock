import { NextResponse } from "next/server";
import { z } from "zod";
import { apiResult, jsonApiResult } from "@/lib/api/responses";
import { checkRateLimits, createRateLimitResponse, rateLimitSubject } from "@/lib/rate-limit";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { normalizeQuantityUnit } from "@/lib/units";
import {
  loadShoppingState,
  mutateShoppingState,
  normalizeShoppingCategory,
  type ShoppingActionPayload
} from "@/services/shopping-service";

const categorySchema = z.preprocess(
  (value) => normalizeShoppingCategory(value),
  z.enum(["fresh", "frozen", "dry", "other"])
);
const itemIdSchema = z.string().trim().uuid();
const quantityUnitSchema = z.preprocess(
  (value) => normalizeQuantityUnit(value),
  z.enum(["g", "ml", "pieces", "portions", "pots", "paquets", "bouteilles"])
);

const shoppingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_item"),
    label: z.string().trim().min(1).max(200),
    quantity: z.coerce.number().positive(),
    unit: quantityUnitSchema,
    category: categorySchema
  }),
  z.object({
    action: z.literal("toggle_item"),
    itemId: itemIdSchema,
    checked: z.coerce.boolean()
  }),
  z.object({
    action: z.literal("toggle_all"),
    checked: z.coerce.boolean()
  }),
  z.object({
    action: z.literal("delete_item"),
    itemId: itemIdSchema
  }),
  z.object({
    action: z.literal("complete_list")
  }),
  z.object({
    action: z.literal("archive_list")
  })
]);

export async function GET(req: Request) {
  const access = await requireHouseholdAccess(req, { allowDemo: true, requireAuth: false });

  if (!access.ok) {
    return access.response;
  }

  const state = await loadShoppingState(access.supabase, access.householdId);
  return NextResponse.json({ ok: true, ...state });
}

export async function POST(req: Request) {
  const rawPayload = await req.json().catch(() => null);
  const parsedPayload = shoppingActionSchema.safeParse(rawPayload);

  if (!parsedPayload.success) {
    return jsonApiResult(
      apiResult({ ok: false, message: "Invalid payload", errors: parsedPayload.error.flatten().fieldErrors }, 400)
    );
  }

  const payload = parsedPayload.data as ShoppingActionPayload;
  const access = await requireHouseholdAccess(req, { requireAuth: true });

  if (!access.ok) {
    return access.response;
  }

  const { context, householdId, supabase } = access;

  if (!context.appUserId) {
    return jsonApiResult(apiResult({ ok: false, message: "Authentication required" }, 401));
  }

  const rateLimit = await checkRateLimits([
    {
      scope: "shopping_mutation:user",
      subject: rateLimitSubject(context.appUserId),
      limit: 240,
      windowSeconds: 10 * 60
    },
    {
      scope: "shopping_mutation:household",
      subject: rateLimitSubject(householdId),
      limit: 700,
      windowSeconds: 10 * 60
    },
    {
      scope: `shopping_mutation:${payload.action}:user`,
      subject: rateLimitSubject(context.appUserId),
      limit: 120,
      windowSeconds: 10 * 60
    }
  ]);

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  return jsonApiResult(
    await mutateShoppingState(supabase, {
      householdId,
      userId: context.appUserId,
      action: payload
    })
  );
}
