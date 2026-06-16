import { apiResult, jsonApiResult } from "@/lib/api/responses";
import { requireHouseholdAccess } from "@/lib/supabase/household-access";
import { createHouseholdInvitation } from "@/services/household-invitations-service";

export async function POST(request: Request) {
  try {
    const access = await requireHouseholdAccess(request, { requireAuth: true });

    if (!access.ok) {
      return access.response;
    }

    const { context, householdId, supabase } = access;
    const appUserId = context.appUserId;

    if (!appUserId) {
      return jsonApiResult(apiResult({ error: "Utilisateur non authentifie" }, 401));
    }

    return jsonApiResult(await createHouseholdInvitation(supabase, { householdId, userId: appUserId }));
  } catch (err: unknown) {
    console.error("household invite error:", err);
    return jsonApiResult(apiResult({ error: "Erreur lors de la generation de l'invitation" }, 500));
  }
}
