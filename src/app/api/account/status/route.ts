import { NextResponse } from "next/server";
import { getRequestLogContext, logInfo } from "@/lib/observability/logger";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const requestContext = getRequestLogContext(request, "/api/account/status");
  const access = await requireHouseholdAccess(request, { requireAuth: true });
  const afterAccess = performance.now();

  if (!access.ok) {
    logInfo("api.account_status_timing", "Account status request rejected", {
      ...requestContext,
      status: access.response.status,
      accessMs: elapsedMs(startedAt, afterAccess),
      totalMs: elapsedMs(startedAt, afterAccess)
    });

    if (access.response.status === 401) {
      return NextResponse.json({ authenticated: false, onboardingCompleted: false }, { status: 401 });
    }

    return access.response;
  }

  const { context, householdId, supabase } = access;
  let householdName: string | null = null;
  const beforeHouseholdQuery = performance.now();

  if (householdId) {
    const { data: household } = await supabase
      .from("households")
      .select("name")
      .eq("id", householdId)
      .maybeSingle<{ name: string | null }>();

    householdName = household?.name ?? null;
  }
  const afterHouseholdQuery = performance.now();

  logInfo("api.account_status_timing", "Account status loaded", {
    ...requestContext,
    householdId: householdId ?? null,
    accessMs: elapsedMs(startedAt, afterAccess),
    householdMs: elapsedMs(beforeHouseholdQuery, afterHouseholdQuery),
    totalMs: elapsedMs(startedAt, afterHouseholdQuery)
  });

  return NextResponse.json({
    authenticated: true,
    onboardingCompleted: Boolean(context.onboardingCompleted),
    householdId: householdId ?? null,
    householdName,
    displayName: context.displayName ?? null,
    email: context.email ?? null
  });
}

function elapsedMs(start: number, end = performance.now()) {
  return Math.round(end - start);
}
