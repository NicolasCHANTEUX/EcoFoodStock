import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimits, createRateLimitResponse, getClientIp, rateLimitSubject } from "@/lib/rate-limit";
import { getRequestLogContext, logError, logWarn } from "@/lib/observability/logger";
import { CURRENT_LEGAL_TERMS_VERSION, CURRENT_PRIVACY_POLICY_VERSION } from "@/lib/legal";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

const SIGNUP_MAX_BY_IP = 8;
const SIGNUP_MAX_BY_EMAIL = 3;

const signupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z
      .string()
      .min(8)
      .max(128)
      .refine(isStrongEnoughPassword, "Le mot de passe doit contenir au moins une lettre et un chiffre."),
    full_name: z.string().trim().min(2).max(100).transform(normalizeDisplayName),
    acceptedLegalTerms: z.literal(true),
    inviteToken: z.preprocess(
      (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
      z.string().max(128).regex(/^[a-zA-Z0-9._:-]+$/).optional()
    )
  })
  .strict();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedPayload = signupSchema.safeParse(body);

  if (!parsedPayload.success) {
    return NextResponse.json(
      {
        error: "Informations d'inscription invalides.",
        fields: parsedPayload.error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }

  const payload = parsedPayload.data;
  const rateLimit = await checkRateLimits([
    {
      scope: "signup:ip",
      subject: rateLimitSubject(getClientIp(request)),
      limit: SIGNUP_MAX_BY_IP,
      windowSeconds: 10 * 60
    },
    {
      scope: "signup:email",
      subject: rateLimitSubject(payload.email),
      limit: SIGNUP_MAX_BY_EMAIL,
      windowSeconds: 60 * 60
    }
  ]);

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit, {
      bodyShape: "error",
      message: "Trop de tentatives. Reessayez dans quelques minutes."
    });
  }

  try {
    const supabase = createSupabasePublicServerClient();
    const legalTermsAcceptedAt = new Date().toISOString();
    const emailRedirectTo = buildEmailRedirectTo(request, payload.inviteToken);
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        emailRedirectTo,
        data: {
          full_name: payload.full_name,
          display_name: payload.full_name,
          name: payload.full_name,
          legal_terms_accepted_at: legalTermsAcceptedAt,
          legal_terms_version: CURRENT_LEGAL_TERMS_VERSION,
          privacy_policy_version: CURRENT_PRIVACY_POLICY_VERSION
        }
      }
    });

    if (error) {
      if (isDuplicateSignupError(error.message)) {
        return createSignupResponse({ needsEmailConfirmation: true, status: 202 });
      }

      logWarn("auth.signup_rejected", "Signup request was rejected", {
        ...getRequestLogContext(request, "/api/auth/signup"),
        status: error.status,
        code: error.code,
        errorName: error.name
      });
      return NextResponse.json({ error: getPublicSignupError(error.message) }, { status: getPublicSignupStatus(error.status) });
    }

    return createSignupResponse({ needsEmailConfirmation: !data.session, status: 201 });
  } catch (error) {
    logError("auth.signup_unexpected_failure", error, getRequestLogContext(request, "/api/auth/signup"));
    return NextResponse.json({ error: "Impossible de creer le compte pour le moment." }, { status: 500 });
  }
}

function createSignupResponse(options: { needsEmailConfirmation: boolean; status: number }) {
  const message = options.needsEmailConfirmation
    ? "Si cette adresse peut creer un compte, un email de confirmation vient d'etre envoye."
    : "Compte cree. Vous pouvez continuer.";

  return NextResponse.json(
    {
      ok: true,
      needsEmailConfirmation: options.needsEmailConfirmation,
      message
    },
    { status: options.status }
  );
}

function buildEmailRedirectTo(request: Request, inviteToken?: string) {
  const redirectUrl = new URL("/login", getAppBaseUrl(request));

  if (inviteToken) {
    redirectUrl.searchParams.set("token", inviteToken);
  }

  return redirectUrl.toString();
}

function getAppBaseUrl(request: Request) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL is required in production for auth redirects");
  }

  return new URL(request.url).origin;
}

function isStrongEnoughPassword(value: string) {
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

function normalizeDisplayName(value: string) {
  return value.replace(/\s+/g, " ");
}

function isDuplicateSignupError(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already exists") ||
    normalizedMessage.includes("user already")
  );
}

function getPublicSignupError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("password")) {
    return "Le mot de passe ne respecte pas les regles de securite.";
  }

  if (normalizedMessage.includes("email")) {
    return "L'adresse email n'est pas valide.";
  }

  return "Impossible de creer le compte pour le moment.";
}

function getPublicSignupStatus(status?: number) {
  if (status && status >= 400 && status < 500) {
    return 400;
  }

  return 500;
}
