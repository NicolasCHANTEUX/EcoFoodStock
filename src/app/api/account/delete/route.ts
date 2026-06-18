import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestLogContext, logError, logWarn } from "@/lib/observability/logger";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";

type HouseholdMembership = {
  household_id: string;
};

export async function DELETE(request: Request) {
  const access = await requireHouseholdAccess(request, { requireAuth: true });

  if (!access.ok) {
    return access.response;
  }

  const { context, supabase } = access;

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
        message: "Impossible de supprimer le compte pour le moment.",
        error: error instanceof Error ? error.message : String(error)
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
