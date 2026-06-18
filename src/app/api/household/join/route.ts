import { apiResult, jsonApiResult } from "@/lib/api/responses";
import { getRequestLogContext, logError } from "@/lib/observability/logger";
import { checkRateLimits, createRateLimitResponse, getClientIp, rateLimitSubject } from "@/lib/rate-limit";
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

    const clientIp = getClientIp(request);
    const anonymousRateLimit = await checkRateLimits([
      {
        scope: "household_join:ip",
        subject: rateLimitSubject(clientIp),
        limit: 30,
        windowSeconds: 60 * 60
      },
      {
        scope: "household_join:token",
        subject: rateLimitSubject(clientIp, token),
        limit: 8,
        windowSeconds: 60 * 60
      }
    ]);

    if (!anonymousRateLimit.allowed) {
      return createRateLimitResponse(anonymousRateLimit, { bodyShape: "error" });
    }

    const supabase = createSupabaseServerClient();
    const context = await resolveAccountContext(request, supabase);
    const userId = context.appUserId;

    if (!context.authenticated || !userId) {
      return jsonApiResult(apiResult({ error: "Utilisateur non authentifie" }, 401));
    }

    const userRateLimit = await checkRateLimits([
      {
        scope: "household_join:user",
        subject: rateLimitSubject(userId),
        limit: 20,
        windowSeconds: 60 * 60
      }
    ]);

    if (!userRateLimit.allowed) {
      return createRateLimitResponse(userRateLimit, { bodyShape: "error" });
    }

    return jsonApiResult(await joinHouseholdWithInvitation(supabase, { token, userId }));
  } catch (err: unknown) {
    logError("household.join_failed", err, getRequestLogContext(request, "/api/household/join"));
    return jsonApiResult(apiResult({ error: "Erreur lors du rattachement au foyer" }, 500));
  }
}
