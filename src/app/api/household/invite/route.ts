import { apiResult, jsonApiResult } from "@/lib/api/responses";
import { getRequestLogContext, logError } from "@/lib/observability/logger";
import { checkRateLimits, createRateLimitResponse, getClientIp, rateLimitSubject } from "@/lib/rate-limit";
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

    const rateLimit = await checkRateLimits([
      {
        scope: "household_invite:ip",
        subject: rateLimitSubject(getClientIp(request)),
        limit: 40,
        windowSeconds: 60 * 60
      },
      {
        scope: "household_invite:user",
        subject: rateLimitSubject(appUserId),
        limit: 20,
        windowSeconds: 60 * 60
      },
      {
        scope: "household_invite:household",
        subject: rateLimitSubject(householdId),
        limit: 60,
        windowSeconds: 60 * 60
      }
    ]);

    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit, { bodyShape: "error" });
    }

    return jsonApiResult(await createHouseholdInvitation(supabase, { householdId, userId: appUserId }));
  } catch (err: unknown) {
    logError("household.invite_failed", err, getRequestLogContext(request, "/api/household/invite"));
    return jsonApiResult(apiResult({ error: "Erreur lors de la generation de l'invitation" }, 500));
  }
}
