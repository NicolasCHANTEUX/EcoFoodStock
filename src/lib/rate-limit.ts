import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isRecord } from "@/lib/api/responses";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_RATE_LIMIT_MESSAGE = "Trop de requetes. Reessayez dans quelques instants.";
const RATE_LIMIT_UNAVAILABLE_MESSAGE = "Controle de frequence indisponible. Reessayez dans quelques instants.";

export type RateLimitRule = {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitDecision =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      status: 429 | 503;
      retryAfterSeconds: number;
      message: string;
    };

type RateLimitResponseOptions = {
  bodyShape?: "api" | "error";
  message?: string;
};

type RpcRateLimitPayload = {
  ok: boolean;
  allowed: boolean;
  retryAfterSeconds: number;
};

export async function checkRateLimits(rules: RateLimitRule[]): Promise<RateLimitDecision> {
  if (rules.length === 0) {
    return { allowed: true };
  }

  let supabase: ReturnType<typeof createSupabaseServerClient>;

  try {
    supabase = createSupabaseServerClient();
  } catch (error) {
    console.error("rate limit client unavailable", error);
    return createUnavailableDecision();
  }

  for (const rule of rules) {
    const normalizedRule = normalizeRateLimitRule(rule);

    if (!normalizedRule) {
      console.error("invalid rate limit rule", { scope: rule.scope });
      return createUnavailableDecision();
    }

    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_scope: normalizedRule.scope,
      p_subject: normalizedRule.subject,
      p_limit: normalizedRule.limit,
      p_window_seconds: normalizedRule.windowSeconds
    });

    if (error) {
      console.error("rate limit rpc failed", {
        scope: normalizedRule.scope,
        code: error.code,
        message: error.message
      });
      return createUnavailableDecision();
    }

    const payload = parseRpcRateLimitPayload(data);

    if (!payload || !payload.ok) {
      console.error("rate limit rpc returned an invalid payload", {
        scope: normalizedRule.scope,
        data
      });
      return createUnavailableDecision();
    }

    if (!payload.allowed) {
      return {
        allowed: false,
        status: 429,
        retryAfterSeconds: payload.retryAfterSeconds,
        message: DEFAULT_RATE_LIMIT_MESSAGE
      };
    }
  }

  return { allowed: true };
}

export function createRateLimitResponse(decision: RateLimitDecision, options: RateLimitResponseOptions = {}) {
  if (decision.allowed) {
    throw new Error("Cannot create a rate limit response for an allowed request");
  }

  const message = decision.status === 429 ? options.message ?? decision.message : decision.message;
  const body = options.bodyShape === "error" ? { error: message } : { ok: false, message };
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };

  if (decision.retryAfterSeconds > 0) {
    headers["Retry-After"] = String(decision.retryAfterSeconds);
  }

  return NextResponse.json(body, {
    status: decision.status,
    headers
  });
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();

  return forwardedFor || realIp || cloudflareIp || "local";
}

export function rateLimitSubject(...parts: Array<number | string | null | undefined>) {
  const rawSubject = parts
    .map((part) => String(part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(":");
  const subject = rawSubject || "unknown";

  if (subject.length <= 300) {
    return subject;
  }

  return `${subject.slice(0, 180)}:${createHash("sha256").update(subject).digest("hex")}`;
}

function normalizeRateLimitRule(rule: RateLimitRule): RateLimitRule | null {
  const scope = rule.scope.trim();
  const subject = rule.subject.trim();
  const limit = Math.floor(rule.limit);
  const windowSeconds = Math.floor(rule.windowSeconds);

  if (!/^[a-z0-9_.:-]{1,80}$/.test(scope) || !subject || subject.length > 300) {
    return null;
  }

  if (limit <= 0 || limit > 10000 || windowSeconds <= 0 || windowSeconds > 86400) {
    return null;
  }

  return {
    scope,
    subject,
    limit,
    windowSeconds
  };
}

function parseRpcRateLimitPayload(value: unknown): RpcRateLimitPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.ok === false) {
    return {
      ok: false,
      allowed: false,
      retryAfterSeconds: normalizeRetryAfterSeconds(value.retryAfterSeconds)
    };
  }

  if (value.ok !== true || (value.allowed !== true && value.allowed !== false)) {
    return null;
  }

  return {
    ok: true,
    allowed: value.allowed,
    retryAfterSeconds: normalizeRetryAfterSeconds(value.retryAfterSeconds)
  };
}

function normalizeRetryAfterSeconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 60;
  }

  return Math.max(1, Math.ceil(value));
}

function createUnavailableDecision(): RateLimitDecision {
  return {
    allowed: false,
    status: 503,
    retryAfterSeconds: 60,
    message: RATE_LIMIT_UNAVAILABLE_MESSAGE
  };
}
