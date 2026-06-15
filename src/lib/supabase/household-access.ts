import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canUseDemoMode,
  ensureUserHousehold,
  isProductionEnvironment,
  resolveAccountContext,
  userBelongsToHousehold,
  type AccountContext
} from "@/lib/supabase/account-context";
import { ensureDemoHousehold } from "@/lib/supabase/demo-household";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type HouseholdAccessOptions = {
  allowDemo?: boolean;
  allowRequestHouseholdId?: boolean;
  createHousehold?: boolean;
  requestedHouseholdId?: string | null;
  requireAuth?: boolean;
};

type HouseholdAccessSuccess = {
  ok: true;
  supabase: ReturnType<typeof createSupabaseServerClient>;
  context: AccountContext;
  householdId: string;
};

type HouseholdAccessFailure = {
  ok: false;
  response: NextResponse;
};

export type HouseholdAccessResult = HouseholdAccessSuccess | HouseholdAccessFailure;

export async function requireHouseholdAccess(
  request: Request,
  options: HouseholdAccessOptions = {}
): Promise<HouseholdAccessResult> {
  let supabase: ReturnType<typeof createSupabaseServerClient>;

  try {
    supabase = createSupabaseServerClient();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: "Supabase server client not configured" }, { status: 500 })
    };
  }

  const context = await resolveAccountContext(request, supabase);
  const requireAuth = isProductionEnvironment() || options.requireAuth === true;

  if (context.authenticated) {
    const access = await resolveAuthenticatedHouseholdAccess(supabase, context, options);
    return access.ok ? { ok: true, supabase, context, householdId: access.householdId } : access;
  }

  if (requireAuth) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 })
    };
  }

  if (options.allowDemo && canUseDemoMode()) {
    const requestedDemoHouseholdId = options.allowRequestHouseholdId
      ? cleanId(options.requestedHouseholdId) || cleanId(request.headers.get("x-household-id"))
      : undefined;
    const householdId =
      requestedDemoHouseholdId ||
      cleanId(process.env.DEMO_HOUSEHOLD_ID) ||
      cleanId(process.env.NEXT_PUBLIC_DEMO_HOUSEHOLD_ID) ||
      (await ensureDemoHousehold(supabase).catch(() => undefined));

    if (householdId) {
      return { ok: true, supabase, context, householdId };
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ ok: false, message: "Household is required" }, { status: 400 })
  };
}

async function resolveAuthenticatedHouseholdAccess(
  supabase: SupabaseClient,
  context: AccountContext,
  options: HouseholdAccessOptions
) {
  const createHousehold = options.createHousehold ?? true;
  let householdId = cleanId(options.requestedHouseholdId) || context.householdId;

  if (!householdId && createHousehold) {
    try {
      householdId = await ensureUserHousehold(supabase, context);
    } catch (error) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { ok: false, message: "Unable to resolve household", error: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        )
      };
    }
  }

  if (!householdId) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Household is required" }, { status: 400 })
    };
  }

  const belongs = await userBelongsToHousehold(supabase, context.appUserId, householdId);

  if (!belongs) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Forbidden household access" }, { status: 403 })
    };
  }

  return { ok: true as const, householdId };
}

function cleanId(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
