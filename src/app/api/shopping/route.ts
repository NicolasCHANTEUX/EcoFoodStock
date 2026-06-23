import { NextResponse } from "next/server";
import { z } from "zod";
import { apiResult, jsonApiResult } from "@/lib/api/responses";
import { getRequestLogContext, logInfo } from "@/lib/observability/logger";
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
  const startedAt = performance.now();
  const requestContext = getRequestLogContext(req, "/api/shopping");
  const access = await requireHouseholdAccess(req, { allowDemo: true, requireAuth: false });
  const afterAccess = performance.now();

  if (!access.ok) {
    logInfo("api.shopping_timing", "Shopping state request rejected", {
      ...requestContext,
      status: access.response.status,
      accessMs: elapsedMs(startedAt, afterAccess),
      totalMs: elapsedMs(startedAt, afterAccess)
    });

    return access.response;
  }

  const beforeLoad = performance.now();
  const state = await loadShoppingState(access.supabase, access.householdId);
  const afterLoad = performance.now();

  logInfo("api.shopping_timing", "Shopping state loaded", {
    ...requestContext,
    householdId: access.householdId,
    groupCount: state.groups.length,
    itemCount: state.groups.reduce((count, group) => count + group.items.length, 0),
    accessMs: elapsedMs(startedAt, afterAccess),
    loadMs: elapsedMs(beforeLoad, afterLoad),
    totalMs: elapsedMs(startedAt, afterLoad)
  });

  return NextResponse.json({ ok: true, ...state });
}

export async function POST(req: Request) {
  const startedAt = performance.now();
  const requestContext = getRequestLogContext(req, "/api/shopping");
  const rawPayload = await req.json().catch(() => null);
  const parsedPayload = shoppingActionSchema.safeParse(rawPayload);
  const afterParse = performance.now();

  if (!parsedPayload.success) {
    logInfo("api.shopping_mutation_timing", "Shopping mutation payload rejected", {
      ...requestContext,
      status: 400,
      parseMs: elapsedMs(startedAt, afterParse),
      totalMs: elapsedMs(startedAt, afterParse)
    });

    return jsonApiResult(
      apiResult({ ok: false, message: "Invalid payload", errors: parsedPayload.error.flatten().fieldErrors }, 400)
    );
  }

  const payload = parsedPayload.data as ShoppingActionPayload;
  const access = await requireHouseholdAccess(req, { requireAuth: true });
  const afterAccess = performance.now();

  if (!access.ok) {
    logInfo("api.shopping_mutation_timing", "Shopping mutation request rejected", {
      ...requestContext,
      action: payload.action,
      status: access.response.status,
      parseMs: elapsedMs(startedAt, afterParse),
      accessMs: elapsedMs(afterParse, afterAccess),
      totalMs: elapsedMs(startedAt, afterAccess)
    });

    return access.response;
  }

  const { context, householdId, supabase } = access;

  if (!context.appUserId) {
    logInfo("api.shopping_mutation_timing", "Shopping mutation missing user context", {
      ...requestContext,
      action: payload.action,
      status: 401,
      parseMs: elapsedMs(startedAt, afterParse),
      accessMs: elapsedMs(afterParse, afterAccess),
      totalMs: elapsedMs(startedAt, afterAccess)
    });

    return jsonApiResult(apiResult({ ok: false, message: "Authentication required" }, 401));
  }

  const beforeRateLimit = performance.now();
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
  const afterRateLimit = performance.now();

  if (!rateLimit.allowed) {
    logInfo("api.shopping_mutation_timing", "Shopping mutation rate-limited", {
      ...requestContext,
      householdId,
      action: payload.action,
      status: 429,
      parseMs: elapsedMs(startedAt, afterParse),
      accessMs: elapsedMs(afterParse, afterAccess),
      rateLimitMs: elapsedMs(beforeRateLimit, afterRateLimit),
      totalMs: elapsedMs(startedAt, afterRateLimit)
    });

    return createRateLimitResponse(rateLimit);
  }

  const beforeMutation = performance.now();
  const result = await mutateShoppingState(supabase, {
    householdId,
    userId: context.appUserId,
    action: payload
  });
  const afterMutation = performance.now();

  logInfo("api.shopping_mutation_timing", "Shopping mutation completed", {
    ...requestContext,
    householdId,
    action: payload.action,
    status: result.status ?? (result.body.ok === false ? 500 : 200),
    parseMs: elapsedMs(startedAt, afterParse),
    accessMs: elapsedMs(afterParse, afterAccess),
    rateLimitMs: elapsedMs(beforeRateLimit, afterRateLimit),
    mutationMs: elapsedMs(beforeMutation, afterMutation),
    totalMs: elapsedMs(startedAt, afterMutation)
  });

  return jsonApiResult(result);
}

function elapsedMs(start: number, end = performance.now()) {
  return Math.round(end - start);
}
