import { NextResponse } from "next/server";
import { createDashboardPayload } from "@/lib/dashboard-data";
import { getRequestLogContext, logInfo } from "@/lib/observability/logger";
import { canUseDemoMode } from "@/lib/supabase/account-context";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const startedAt = performance.now();
  const requestContext = getRequestLogContext(req, "/api/dashboard");
  const access = await requireHouseholdAccess(req, { allowDemo: true, requireAuth: false });
  const afterAccess = performance.now();

  if (!access.ok) {
    if (canUseDemoMode()) {
      const beforePayload = performance.now();
      const payload = await createDashboardPayload(process.env.NEXT_PUBLIC_DEMO_HOUSEHOLD_ID ?? process.env.DEMO_HOUSEHOLD_ID ?? null);
      const afterPayload = performance.now();

      logInfo("api.dashboard_timing", "Dashboard payload loaded", {
        ...requestContext,
        source: payload.source,
        status: 200,
        accessMs: elapsedMs(startedAt, afterAccess),
        payloadMs: elapsedMs(beforePayload, afterPayload),
        totalMs: elapsedMs(startedAt, afterPayload)
      });

      return NextResponse.json(payload);
    }

    logInfo("api.dashboard_timing", "Dashboard request rejected", {
      ...requestContext,
      status: access.response.status,
      accessMs: elapsedMs(startedAt, afterAccess),
      totalMs: elapsedMs(startedAt, afterAccess)
    });

    return access.response;
  }

  const beforePayload = performance.now();
  const payload = await createDashboardPayload(access.householdId);
  const afterPayload = performance.now();

  logInfo("api.dashboard_timing", "Dashboard payload loaded", {
    ...requestContext,
    householdId: access.householdId,
    source: payload.source,
    inventoryCount: payload.summary.inventoryCount,
    accessMs: elapsedMs(startedAt, afterAccess),
    payloadMs: elapsedMs(beforePayload, afterPayload),
    totalMs: elapsedMs(startedAt, afterPayload)
  });

  return NextResponse.json(payload);
}

function elapsedMs(start: number, end = performance.now()) {
  return Math.round(end - start);
}
