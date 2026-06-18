import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isRecord } from "@/lib/api/responses";
import { logError } from "@/lib/observability/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_RATE_LIMIT_MESSAGE = "Trop de requetes. Reessayez dans quelques instants.";
const RATE_LIMIT_UNAVAILABLE_MESSAGE = "Controle de frequence indisponible. Reessayez dans quelques instants.";
const CLIENT_IP_STRATEGY_ENV = "ECOFOODSTOCK_CLIENT_IP_STRATEGY";

type ClientIpStrategy = "auto" | "cloudflare" | "development" | "none" | "trusted-proxy" | "vercel";

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
    logError("rate_limit.client_unavailable", error, { operation: "create_supabase_client" });
    return createUnavailableDecision();
  }

  for (const rule of rules) {
    const normalizedRule = normalizeRateLimitRule(rule);

    if (!normalizedRule) {
      logError("rate_limit.invalid_rule", new Error("Invalid rate limit rule"), { scope: rule.scope });
      return createUnavailableDecision();
    }

    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_scope: normalizedRule.scope,
      p_subject: normalizedRule.subject,
      p_limit: normalizedRule.limit,
      p_window_seconds: normalizedRule.windowSeconds
    });

    if (error) {
      logError("rate_limit.rpc_failed", new Error(error.message), {
        operation: "check_rate_limit",
        scope: normalizedRule.scope,
        code: error.code
      });
      return createUnavailableDecision();
    }

    const payload = parseRpcRateLimitPayload(data);

    if (!payload || !payload.ok) {
      logError("rate_limit.invalid_payload", new Error("Rate limit RPC returned an invalid payload"), {
        operation: "check_rate_limit",
        scope: normalizedRule.scope,
        payloadType: typeof data
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
  const strategy = resolveClientIpStrategy();

  if (strategy === "cloudflare") {
    return getTrustedHeaderIp(request, ["cf-connecting-ip"]) ?? "unknown:cloudflare";
  }

  if (strategy === "vercel") {
    return getTrustedHeaderIp(request, ["x-forwarded-for", "x-real-ip"]) ?? "unknown:vercel";
  }

  if (strategy === "trusted-proxy") {
    return getTrustedHeaderIp(request, ["x-forwarded-for", "x-real-ip"]) ?? "unknown:trusted-proxy";
  }

  if (strategy === "development") {
    return getTrustedHeaderIp(request, ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"]) ?? "local";
  }

  return "unknown:untrusted";
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

function resolveClientIpStrategy(): Exclude<ClientIpStrategy, "auto"> {
  const configuredStrategy = normalizeClientIpStrategy(process.env[CLIENT_IP_STRATEGY_ENV]);

  if (configuredStrategy && configuredStrategy !== "auto") {
    return configuredStrategy;
  }

  if (process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production") {
    return "development";
  }

  if (process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV)) {
    return "vercel";
  }

  return "none";
}

function normalizeClientIpStrategy(value: string | undefined): ClientIpStrategy | null {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "auto" ||
    normalized === "cloudflare" ||
    normalized === "development" ||
    normalized === "none" ||
    normalized === "trusted-proxy" ||
    normalized === "vercel"
  ) {
    return normalized;
  }

  return null;
}

function getTrustedHeaderIp(request: Request, headerNames: string[]) {
  for (const headerName of headerNames) {
    const normalizedIp = normalizeIpHeaderValue(request.headers.get(headerName));

    if (normalizedIp) {
      return normalizedIp;
    }
  }

  return null;
}

function normalizeIpHeaderValue(value: string | null) {
  if (!value) {
    return null;
  }

  const firstValue = value.split(",")[0]?.trim().replace(/^"|"$/g, "");
  const withoutBrackets = firstValue?.startsWith("[") ? firstValue.slice(1, firstValue.indexOf("]")) : firstValue;
  const withoutIpv4Port = withoutBrackets?.replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, "$1");

  if (!withoutIpv4Port) {
    return null;
  }

  return isValidIpAddress(withoutIpv4Port) ? withoutIpv4Port : null;
}

function isValidIpAddress(value: string) {
  return isValidIpv4Address(value) || isValidIpv6Address(value);
}

function isValidIpv4Address(value: string) {
  const parts = value.split(".");

  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }

    const numericPart = Number(part);
    return numericPart >= 0 && numericPart <= 255;
  });
}

function isValidIpv6Address(value: string) {
  return value.includes(":") && /^[0-9a-f:.]+$/i.test(value) && value.length <= 45;
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
