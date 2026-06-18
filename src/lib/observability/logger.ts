import * as Sentry from "@sentry/nextjs";
import { getOrCreateRequestId } from "@/lib/observability/request-id";

export { getOrCreateRequestId } from "@/lib/observability/request-id";

const SERVICE_NAME = "ecofoodstock";
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_LENGTH = 25;
const MAX_DEPTH = 5;
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|password|passwd|secret|token|api[-_]?key|service[-_]?role|email|birth|weight|height|allerg|health|nutrition|sex/i;

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown> & {
  requestId?: string;
  route?: string;
  method?: string;
  operation?: string;
  userId?: string;
  householdId?: string;
};

export type StructuredLogRecord = {
  timestamp: string;
  level: LogLevel;
  service: typeof SERVICE_NAME;
  environment: string;
  event: string;
  message: string;
  requestId?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

export function getRequestLogContext(request: Request, route: string): LogContext {
  return {
    requestId: getOrCreateRequestId(request.headers.get("x-request-id")),
    route,
    method: request.method
  };
}

export function sanitizeLogContext(context: LogContext): Record<string, unknown> {
  return sanitizeRecord(context, 0, new WeakSet<object>());
}

export function createLogRecord(options: {
  level: LogLevel;
  event: string;
  message: string;
  context?: LogContext;
  error?: unknown;
  now?: Date;
}): StructuredLogRecord {
  const safeContext = options.context ? sanitizeLogContext(options.context) : undefined;
  const requestId = typeof safeContext?.requestId === "string" ? safeContext.requestId : undefined;

  return {
    timestamp: (options.now ?? new Date()).toISOString(),
    level: options.level,
    service: SERVICE_NAME,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    event: normalizeEventName(options.event),
    message: truncate(options.message),
    ...(requestId ? { requestId } : {}),
    ...(safeContext && Object.keys(safeContext).length > 0 ? { context: safeContext } : {}),
    ...(options.error !== undefined ? { error: serializeError(options.error) } : {})
  };
}

export function logInfo(event: string, message: string, context?: LogContext) {
  emit(createLogRecord({ level: "info", event, message, context }));
}

export function logWarn(event: string, message: string, context?: LogContext) {
  emit(createLogRecord({ level: "warn", event, message, context }));
}

export function logError(event: string, error: unknown, context?: LogContext, message = "Unexpected server error") {
  const record = createLogRecord({ level: "error", event, message, context, error });
  emit(record);

  Sentry.withScope((scope) => {
    scope.setTag("event", record.event);

    if (record.requestId) {
      scope.setTag("request_id", record.requestId);
    }

    if (record.context) {
      scope.setContext("log", record.context);
    }

    Sentry.captureException(toError(error, message));
  });
}

function emit(record: StructuredLogRecord) {
  const serialized = JSON.stringify(record);
  const sentryContext = record.context ?? {};

  if (record.level === "error") {
    console.error(serialized);
    return;
  }

  if (record.level === "warn") {
    console.warn(serialized);
    Sentry.logger.warn(record.message, sentryContext);
    return;
  }

  if (record.level === "debug") {
    console.debug(serialized);
    Sentry.logger.debug(record.message, sentryContext);
    return;
  }

  console.info(serialized);
  Sentry.logger.info(record.message, sentryContext);
}

function sanitizeRecord(value: Record<string, unknown>, depth: number, seen: WeakSet<object>) {
  const safeValue: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    safeValue[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeValue(entry, depth + 1, seen);
  }

  return safeValue;
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return truncate(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (depth >= MAX_DEPTH) {
    return "[MAX_DEPTH]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((entry) => sanitizeValue(entry, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[CIRCULAR]";
    }

    seen.add(value);
    return sanitizeRecord(value as Record<string, unknown>, depth, seen);
  }

  return String(value);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: truncate(error.name || "Error"),
      message: truncate(error.message),
      ...(error.stack ? { stack: truncate(error.stack) } : {})
    };
  }

  return {
    name: "Error",
    message: truncate(typeof error === "string" ? error : "Non-Error exception")
  };
}

function toError(error: unknown, fallbackMessage: string) {
  const safeError = serializeError(error instanceof Error || typeof error === "string" ? error : fallbackMessage);
  const normalizedError = new Error(safeError.message);
  normalizedError.name = safeError.name;

  if (safeError.stack) {
    normalizedError.stack = safeError.stack;
  }

  return normalizedError;
}

function normalizeEventName(event: string) {
  const normalized = event.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 100);
  return normalized || "application.unknown";
}

function truncate(value: string) {
  const redacted = value
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi, "[REDACTED_EMAIL]")
    .replace(/\bBearer\s+[a-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, "[REDACTED_JWT]")
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, "$1[REDACTED]");

  return redacted.length <= MAX_STRING_LENGTH
    ? redacted
    : `${redacted.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]`;
}
