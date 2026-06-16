import { randomUUID } from "node:crypto";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { apiResult, isMissingRpcError, isRecord, type ApiResult } from "@/lib/api/responses";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

type HouseholdInvitationRpcBody = {
  ok?: boolean;
  status?: number;
  error?: string;
  message?: string;
  token?: string;
  expires_at?: string;
  [key: string]: unknown;
};

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createHouseholdInvitation(
  supabase: SupabaseServerClient,
  payload: {
    householdId: string;
    userId: string;
  }
): Promise<ApiResult<HouseholdInvitationRpcBody>> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
  const { data, error } = await supabase.rpc("create_invitation_token", {
    p_household_id: payload.householdId,
    p_user_id: payload.userId,
    p_token: token,
    p_expires_at: expiresAt
  });

  if (error) {
    console.error("create_invitation_token rpc failed", {
      code: error.code,
      message: error.message
    });

    return apiResult(
      {
        error: isMissingRpcError(error.message, error.code, "create_invitation_token")
          ? "Invitation transaction RPC is not installed"
          : "Impossible de generer l'invitation"
      },
      isMissingRpcError(error.message, error.code, "create_invitation_token") ? 503 : 500
    );
  }

  if (!isRecord<HouseholdInvitationRpcBody>(data)) {
    console.error("create_invitation_token rpc returned an unexpected payload", data);
    return apiResult({ error: "Reponse d'invitation invalide" }, 500);
  }

  return apiResult(data);
}

export async function joinHouseholdWithInvitation(
  supabase: SupabaseServerClient,
  payload: {
    token: string;
    userId: string;
  }
): Promise<ApiResult<HouseholdInvitationRpcBody>> {
  const { data, error } = await supabase.rpc("join_household_with_invitation", {
    p_token: payload.token,
    p_user_id: payload.userId
  });

  if (error) {
    console.error("join_household_with_invitation rpc failed", {
      code: error.code,
      message: error.message
    });

    return apiResult(
      {
        error: isMissingRpcError(error.message, error.code, "join_household_with_invitation")
          ? "Join household transaction RPC is not installed"
          : "Impossible de rejoindre le foyer"
      },
      isMissingRpcError(error.message, error.code, "join_household_with_invitation") ? 503 : 500
    );
  }

  if (!isRecord<HouseholdInvitationRpcBody>(data)) {
    console.error("join_household_with_invitation rpc returned an unexpected payload", data);
    return apiResult({ error: "Reponse de rattachement invalide" }, 500);
  }

  return apiResult(data);
}
