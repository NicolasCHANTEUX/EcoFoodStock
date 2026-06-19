import { NextResponse } from "next/server";
import { z } from "zod";
import { CURRENT_LEGAL_TERMS_VERSION, CURRENT_PRIVACY_POLICY_VERSION } from "@/lib/legal";
import { getRequestLogContext, logError, logWarn } from "@/lib/observability/logger";
import { checkRateLimits, createRateLimitResponse, getClientIp, rateLimitSubject } from "@/lib/rate-limit";
import { resolveAccountContext } from "@/lib/supabase/account-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const legalConsentSchema = z
  .object({
    accepted: z.literal(true)
  })
  .strict();

export async function POST(request: Request) {
  let supabase;

  try {
    supabase = createSupabaseServerClient();
  } catch {
    return NextResponse.json({ ok: false, message: "Supabase serveur n'est pas configure." }, { status: 500 });
  }

  const parsedPayload = legalConsentSchema.safeParse(await request.json().catch(() => null));

  if (!parsedPayload.success) {
    return NextResponse.json({ ok: false, message: "Consentement invalide." }, { status: 400 });
  }

  const context = await resolveAccountContext(request, supabase);

  if (!context.authenticated || !context.authUserId || !context.appUserId) {
    return NextResponse.json({ ok: false, message: "Utilisateur non authentifie." }, { status: 401 });
  }

  const rateLimit = await checkRateLimits([
    {
      scope: "legal_consent:ip",
      subject: rateLimitSubject(getClientIp(request)),
      limit: 30,
      windowSeconds: 10 * 60
    },
    {
      scope: "legal_consent:user",
      subject: rateLimitSubject(context.appUserId),
      limit: 10,
      windowSeconds: 10 * 60
    }
  ]);

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  const acceptedAt = new Date().toISOString();
  const legalTermsVersion = CURRENT_LEGAL_TERMS_VERSION;
  const privacyPolicyVersion = CURRENT_PRIVACY_POLICY_VERSION;
  const metadata = {
    legal_terms_accepted_at: acceptedAt,
    legal_terms_version: legalTermsVersion,
    privacy_policy_version: privacyPolicyVersion
  };

  const { data: authUserData, error: getUserError } = await supabase.auth.admin.getUserById(context.authUserId);

  if (getUserError) {
    logError("account.legal_consent_auth_lookup_failed", getUserError, getRequestLogContext(request, "/api/account/legal-consent"));
    return NextResponse.json({ ok: false, message: "Impossible d'enregistrer le consentement." }, { status: 500 });
  }

  const existingMetadata = (authUserData.user?.user_metadata ?? {}) as Record<string, unknown>;

  const { error: authError } = await supabase.auth.admin.updateUserById(context.authUserId, {
    user_metadata: {
      ...existingMetadata,
      ...metadata
    }
  });

  if (authError) {
    logError("account.legal_consent_auth_update_failed", authError, getRequestLogContext(request, "/api/account/legal-consent"));
    return NextResponse.json({ ok: false, message: "Impossible d'enregistrer le consentement." }, { status: 500 });
  }

  const { error: userError } = await supabase
    .from("users")
    .update({
      legal_terms_accepted_at: acceptedAt,
      legal_terms_version: legalTermsVersion,
      privacy_policy_version: privacyPolicyVersion,
      updated_at: new Date().toISOString()
    })
    .eq("id", context.appUserId);

  if (userError && !isMissingLegalConsentColumn(userError.message)) {
    logError("account.legal_consent_user_update_failed", userError, getRequestLogContext(request, "/api/account/legal-consent"));
    return NextResponse.json({ ok: false, message: "Impossible d'enregistrer le consentement." }, { status: 500 });
  }

  if (userError) {
    logWarn("account.legal_consent_columns_missing", "Legal consent columns are missing on users table", {
      ...getRequestLogContext(request, "/api/account/legal-consent"),
      error: userError.message
    });
  }

  return NextResponse.json({
    ok: true,
    consent: metadata,
    warning: userError ? "legal_columns_missing" : undefined
  });
}

function isMissingLegalConsentColumn(message: string) {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("legal_terms_accepted_at") ||
    lowerMessage.includes("legal_terms_version") ||
    lowerMessage.includes("privacy_policy_version")
  );
}
