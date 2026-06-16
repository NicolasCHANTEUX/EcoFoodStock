import { apiResult, jsonApiResult } from "@/lib/api/responses";
import { resolveAccountContext } from "@/lib/supabase/account-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { joinHouseholdWithInvitation } from "@/services/household-invitations-service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!token || token.length > 200) {
      return jsonApiResult(apiResult({ error: "Token requis" }, 400));
    }

    const supabase = createSupabaseServerClient();
    const context = await resolveAccountContext(request, supabase);
    const userId = context.appUserId;

    if (!context.authenticated || !userId) {
      return jsonApiResult(apiResult({ error: "Utilisateur non authentifie" }, 401));
    }

    return jsonApiResult(await joinHouseholdWithInvitation(supabase, { token, userId }));
  } catch (err: unknown) {
    console.error("household join error:", err);
    return jsonApiResult(apiResult({ error: "Erreur lors du rattachement au foyer" }, 500));
  }
}
