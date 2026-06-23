"use client";

const CACHE_PREFIX = "ecofoodstock:api-cache";
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_CACHE_VALUE_BYTES = 250_000;

type CachedJsonEnvelope<T> = {
  cachedAt: number;
  payload: T;
};

const pendingJsonRequests = new Map<string, Promise<unknown>>();

export async function getClientApiCacheScope(headers: Record<string, string>) {
  const authorization = headers.Authorization ?? headers.authorization;

  if (!authorization) {
    return "anonymous";
  }

  return `auth:${await hashForCacheScope(authorization)}`;
}

export function readClientJsonCache<T>(cacheKey: string, scope: string, maxAgeMs = DEFAULT_MAX_AGE_MS): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storageKey = buildStorageKey(cacheKey, scope);
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<CachedJsonEnvelope<T>>;

    if (!parsed || typeof parsed.cachedAt !== "number" || !("payload" in parsed)) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    if (Date.now() - parsed.cachedAt > maxAgeMs) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return parsed.payload as T;
  } catch {
    return null;
  }
}

export function writeClientJsonCache<T>(cacheKey: string, scope: string, payload: T) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const serialized = JSON.stringify({
      cachedAt: Date.now(),
      payload
    } satisfies CachedJsonEnvelope<T>);

    if (serialized.length > MAX_CACHE_VALUE_BYTES) {
      return;
    }

    window.localStorage.setItem(buildStorageKey(cacheKey, scope), serialized);
  } catch {
    // localStorage can be unavailable or full; cache failures must never break the app.
  }
}

export function getPendingClientJsonRequest<T>(requestKey: string, loader: () => Promise<T>) {
  const pending = pendingJsonRequests.get(requestKey) as Promise<T> | undefined;

  if (pending) {
    return pending;
  }

  const promise = loader().finally(() => {
    pendingJsonRequests.delete(requestKey);
  });

  pendingJsonRequests.set(requestKey, promise);
  return promise;
}

function buildStorageKey(cacheKey: string, scope: string) {
  return `${CACHE_PREFIX}:${sanitizeCachePart(scope)}:${sanitizeCachePart(cacheKey)}`;
}

function sanitizeCachePart(value: string) {
  return value.replace(/[^a-zA-Z0-9:._-]+/g, "_").slice(0, 120);
}

async function hashForCacheScope(value: string) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  return fallbackHash(value);
}

function fallbackHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
