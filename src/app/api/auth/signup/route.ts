import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

const DEFAULT_LEGAL_TERMS_VERSION = "2026-06-07";
const DEFAULT_PRIVACY_POLICY_VERSION = "2026-06-07";
const RATE_LIMIT_MAX_KEYS = 500;
const SIGNUP_IP_WINDOW_MS = 10 * 60 * 1000;
const SIGNUP_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX_BY_IP = 8;
const SIGNUP_MAX_BY_EMAIL = 3;

const signupAttempts = new Map<string, number[]>();

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
    legalTermsVersion: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).default(DEFAULT_LEGAL_TERMS_VERSION),
    privacyPolicyVersion: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).default(DEFAULT_PRIVACY_POLICY_VERSION),
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
  const rateLimit = checkSignupRateLimit(request, payload.email);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Reessayez dans quelques minutes." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
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
          legal_terms_version: payload.legalTermsVersion,
          privacy_policy_version: payload.privacyPolicyVersion
        }
      }
    });

    if (error) {
      if (isDuplicateSignupError(error.message)) {
        return createSignupResponse({ needsEmailConfirmation: true, status: 202 });
      }

      console.warn("signup failed", { status: error.status, code: error.code, name: error.name });
      return NextResponse.json({ error: getPublicSignupError(error.message) }, { status: getPublicSignupStatus(error.status) });
    }

    return createSignupResponse({ needsEmailConfirmation: !data.session, status: 201 });
  } catch (error) {
    console.error("signup unexpected failure", error);
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

function checkSignupRateLimit(request: Request, email: string) {
  const ip = getClientIp(request);
  const ipLimit = recordSignupAttempt(`ip:${ip}`, SIGNUP_MAX_BY_IP, SIGNUP_IP_WINDOW_MS);

  if (!ipLimit.allowed) {
    return ipLimit;
  }

  return recordSignupAttempt(`email:${email}`, SIGNUP_MAX_BY_EMAIL, SIGNUP_EMAIL_WINDOW_MS);
}

function recordSignupAttempt(key: string, maxAttempts: number, windowMs: number) {
  const now = Date.now();
  const recentAttempts = (signupAttempts.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

  if (recentAttempts.length >= maxAttempts) {
    signupAttempts.set(key, recentAttempts);
    const oldestAttempt = recentAttempts[0] ?? now;
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldestAttempt)) / 1000))
    };
  }

  recentAttempts.push(now);
  signupAttempts.set(key, recentAttempts);
  pruneSignupAttempts(now);
  return { allowed: true as const };
}

function pruneSignupAttempts(now: number) {
  if (signupAttempts.size <= RATE_LIMIT_MAX_KEYS) {
    return;
  }

  for (const [key, attempts] of signupAttempts.entries()) {
    const recentAttempts = attempts.filter((timestamp) => now - timestamp < SIGNUP_EMAIL_WINDOW_MS);

    if (recentAttempts.length === 0) {
      signupAttempts.delete(key);
    } else {
      signupAttempts.set(key, recentAttempts);
    }

    if (signupAttempts.size <= RATE_LIMIT_MAX_KEYS) {
      break;
    }
  }
}

function buildEmailRedirectTo(request: Request, inviteToken?: string) {
  const redirectUrl = new URL("/login", new URL(request.url).origin);

  if (inviteToken) {
    redirectUrl.searchParams.set("token", inviteToken);
  }

  return redirectUrl.toString();
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwardedFor || realIp || "local";
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
