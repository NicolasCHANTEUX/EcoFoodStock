import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getRequestLogContext, logError, logWarn } from "@/lib/observability/logger";
import { checkRateLimits, createRateLimitResponse, getClientIp, rateLimitSubject } from "@/lib/rate-limit";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

type HouseholdMembership = {
  household_id: string;
};

type SupabaseAuthUser = {
  id: string;
  email?: string;
  last_sign_in_at?: string;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
  identities?: Array<{
    provider?: string;
  }>;
};

const RECENT_OAUTH_REAUTH_WINDOW_MS = 15 * 60 * 1000;

const deleteAccountSchema = z
  .object({
    confirmation: z.string().trim().transform((value) => value.toLocaleLowerCase("fr-FR")).pipe(z.literal("supprimer")),
    password: z.string().max(1024).optional()
  })
  .strict();

export async function DELETE(request: Request) {
  const parsedPayload = deleteAccountSchema.safeParse(await request.json().catch(() => null));

  if (!parsedPayload.success) {
    return NextResponse.json({ ok: false, message: "Confirmation de suppression invalide." }, { status: 400 });
  }

  const access = await requireHouseholdAccess(request, { requireAuth: true });

  if (!access.ok) {
    return access.response;
  }

  const { context, supabase } = access;
  const rateLimit = await checkRateLimits([
    {
      scope: "account_delete:ip",
      subject: rateLimitSubject(getClientIp(request)),
      limit: 5,
      windowSeconds: 60 * 60
    },
    {
      scope: "account_delete:user",
      subject: rateLimitSubject(context.appUserId ?? context.authUserId),
      limit: 3,
      windowSeconds: 24 * 60 * 60
    }
  ]);

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  let reauthentication;

  try {
    reauthentication = await verifyAccountDeletionReauthentication(
      request,
      supabase,
      context.authUserId!,
      parsedPayload.data.password
    );
  } catch (error) {
    logError("account.delete_reauth_unavailable", error, getRequestLogContext(request, "/api/account/delete"));
    return NextResponse.json(
      {
        ok: false,
        message: "Réauthentification temporairement indisponible. Réessayez plus tard."
      },
      { status: 503 }
    );
  }

  if (!reauthentication.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: reauthentication.message
      },
      { status: reauthentication.status }
    );
  }

  try {
    if (context.appUserId) {
      const rpcDeleted = await tryDeleteApplicationAccountWithRpc(supabase, context.appUserId);

      if (!rpcDeleted) {
        await deleteApplicationAccount(supabase, context.appUserId);
      }
    }

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(context.authUserId!);

    if (authDeleteError) {
      throw authDeleteError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("account.delete_failed", error, getRequestLogContext(request, "/api/account/delete"));
    return NextResponse.json(
      {
        ok: false,
        message: "Impossible de supprimer le compte pour le moment."
      },
      { status: 500 }
    );
  }
}

async function tryDeleteApplicationAccountWithRpc(supabase: SupabaseClient, appUserId: string) {
  const { error } = await supabase.rpc("delete_application_account_data", {
    p_user_id: appUserId
  });

  if (!error) {
    return true;
  }

  if (!isMissingRpcError(error.message)) {
    logWarn("account.delete_rpc_fallback", "Account deletion RPC failed; using application fallback", {
      operation: "delete_application_account_data",
      code: error.code,
      error: error.message
    });
  }

  return false;
}

async function deleteApplicationAccount(supabase: SupabaseClient, appUserId: string) {
  const { data: memberships, error: membershipsError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", appUserId)
    .returns<HouseholdMembership[]>();

  if (membershipsError) {
    throw membershipsError;
  }

  const householdIds = Array.from(new Set((memberships ?? []).map((membership) => membership.household_id)));
  const householdsToDelete: string[] = [];

  for (const householdId of householdIds) {
    const { count, error: countError } = await supabase
      .from("household_members")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) <= 1) {
      householdsToDelete.push(householdId);
    }
  }

  if (householdsToDelete.length > 0) {
    await deleteInvitationTokensIfAvailable(supabase, householdsToDelete);

    const { error: householdError } = await supabase.from("households").delete().in("id", householdsToDelete);

    if (householdError) {
      throw householdError;
    }
  }

  const sharedHouseholdIds = householdIds.filter((householdId) => !householdsToDelete.includes(householdId));

  if (sharedHouseholdIds.length > 0) {
    const { error: membershipError } = await supabase
      .from("household_members")
      .delete()
      .eq("user_id", appUserId)
      .in("household_id", sharedHouseholdIds);

    if (membershipError) {
      throw membershipError;
    }
  }

  const { error: ownershipError } = await supabase.from("households").update({ created_by: null }).eq("created_by", appUserId);

  if (ownershipError) {
    throw ownershipError;
  }

  const { error: userError } = await supabase.from("users").delete().eq("id", appUserId);

  if (userError) {
    throw userError;
  }
}

async function deleteInvitationTokensIfAvailable(supabase: SupabaseClient, householdIds: string[]) {
  const { error } = await supabase.from("invitation_tokens").delete().in("household_id", householdIds);

  if (error && !isMissingRelationError(error.message)) {
    throw error;
  }
}

async function verifyAccountDeletionReauthentication(
  request: Request,
  supabase: SupabaseClient,
  authUserId: string,
  password: string | undefined
) {
  const logContext = getRequestLogContext(request, "/api/account/delete");
  const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(authUserId);
  const authUser = authUserData.user as SupabaseAuthUser | null;

  if (authUserError || !authUser?.id) {
    logError("account.delete_reauth_lookup_failed", authUserError ?? new Error("Auth user not found"), logContext);
    return {
      ok: false as const,
      status: 401,
      message: "Réauthentification requise avant suppression du compte."
    };
  }

  if (requiresPasswordReauthentication(authUser)) {
    return verifyPasswordReauthentication(request, authUser, password);
  }

  if (!hasRecentOAuthSignIn(authUser.last_sign_in_at)) {
    logWarn("account.delete_oauth_reauth_required", "Account deletion blocked until recent OAuth sign-in", {
      ...logContext,
      authProvider: Array.from(getAuthProviders(authUser)).join(",") || "unknown"
    });

    return {
      ok: false as const,
      status: 428,
      message: "Reconnectez-vous avec votre fournisseur d'identité, puis relancez la suppression."
    };
  }

  return { ok: true as const };
}

async function verifyPasswordReauthentication(request: Request, authUser: SupabaseAuthUser, password: string | undefined) {
  const email = authUser.email?.trim();
  const logContext = getRequestLogContext(request, "/api/account/delete");

  if (!email || !password) {
    return {
      ok: false as const,
      status: 400,
      message: "Réauthentification requise : saisissez le mot de passe du compte."
    };
  }

  const publicSupabase = createSupabasePublicServerClient();
  const { data: signInData, error: signInError } = await publicSupabase.auth.signInWithPassword({
    email,
    password
  });

  if (signInError || signInData.user?.id !== authUser.id) {
    logWarn("account.delete_password_reauth_failed", "Account deletion password reauthentication failed", {
      ...logContext,
      authProvider: "email"
    });

    return {
      ok: false as const,
      status: 401,
      message: "Mot de passe invalide ou réauthentification impossible."
    };
  }

  return { ok: true as const };
}

function requiresPasswordReauthentication(user: SupabaseAuthUser) {
  return getAuthProviders(user).has("email");
}

function getAuthProviders(user: SupabaseAuthUser) {
  const providers = new Set<string>();
  const appProviders = Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : [];
  const identityProviders = Array.isArray(user.identities) ? user.identities.map((identity) => identity.provider) : [];

  for (const provider of [user.app_metadata?.provider, ...appProviders, ...identityProviders]) {
    const normalizedProvider = provider?.trim().toLowerCase();

    if (normalizedProvider) {
      providers.add(normalizedProvider);
    }
  }

  return providers;
}

function hasRecentOAuthSignIn(lastSignInAt: string | undefined, now = Date.now()) {
  const lastSignInTimestamp = Date.parse(lastSignInAt ?? "");
  return Number.isFinite(lastSignInTimestamp) && now - lastSignInTimestamp <= RECENT_OAUTH_REAUTH_WINDOW_MS;
}

function isMissingRelationError(message: string) {
  const lowerMessage = message.toLowerCase();
  return lowerMessage.includes("relation") && lowerMessage.includes("does not exist");
}

function isMissingRpcError(message?: string) {
  const normalizedMessage = message?.toLowerCase() ?? "";
  return (
    normalizedMessage.includes("could not find the function") ||
    normalizedMessage.includes("schema cache") ||
    normalizedMessage.includes("delete_application_account_data")
  );
}
