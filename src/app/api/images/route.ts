import { NextResponse } from "next/server";
import { getRequestLogContext, logWarn } from "@/lib/observability/logger";
import { checkRateLimits, createRateLimitResponse, getClientIp, rateLimitSubject } from "@/lib/rate-limit";

const ALLOWED_HOSTS = new Set(["images.openfoodfacts.org", "static.openfoodfacts.org", "images.openfoodfacts.net"]);
const ALLOWED_IMAGE_PATH_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const IMAGE_FETCH_TIMEOUT_MS = 5_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_MEMORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const IMAGE_ERROR_CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CACHED_IMAGES = 40;
const MAX_IMAGE_CACHE_BYTES = 60 * 1024 * 1024;
const IMAGE_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const IMAGE_BROWSER_CACHE_SECONDS = 24 * 60 * 60;
const IMAGE_CDN_CACHE_SECONDS = 30 * 24 * 60 * 60;
const IMAGE_CDN_STALE_SECONDS = 7 * 24 * 60 * 60;
const IMAGE_ERROR_BROWSER_CACHE_SECONDS = 30;
const IMAGE_ERROR_CDN_CACHE_SECONDS = 2 * 60;

type CachedImage =
  | {
      kind: "image";
      body: ArrayBuffer;
      contentType: string;
      cachedAt: number;
    }
  | {
      kind: "error";
      message: string;
      status: number;
      cachedAt: number;
      ttlMs: number;
    };

type ImageCacheStatus = "HIT" | "MISS" | "NEGATIVE_HIT";

type FetchedImage = {
  body: ArrayBuffer;
  contentType: string;
};

const imageCache = new Map<string, CachedImage>();

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const url = requestUrl.searchParams.get("src");

  if (!url) {
    return createImageErrorResponse({ ok: false, message: "src required" }, 400);
  }

  const parsed = normalizeOpenFoodFactsImageUrl(url);

  if (!parsed) {
    return createImageErrorResponse({ ok: false, message: "Invalid image url" }, 400);
  }

  const cacheKey = parsed.toString();
  const cachedImage = getCachedImage(cacheKey);

  if (cachedImage?.kind === "image") {
    return createImageResponse(cachedImage.body, cachedImage.contentType, "HIT");
  }

  if (cachedImage?.kind === "error") {
    return createImageErrorResponse({ ok: false, message: cachedImage.message }, cachedImage.status, {
      cacheStatus: "NEGATIVE_HIT",
      cdnCacheSeconds: secondsUntilCacheExpiry(cachedImage)
    });
  }

  const clientIp = getClientIp(req);
  const assetSubject = rateLimitSubject(parsed.hostname, parsed.pathname);
  const rateLimit = await checkRateLimits([
    {
      scope: "image_proxy:ip",
      subject: rateLimitSubject(clientIp),
      limit: 600,
      windowSeconds: IMAGE_RATE_LIMIT_WINDOW_SECONDS
    },
    {
      scope: "image_proxy:asset_by_ip",
      subject: rateLimitSubject(clientIp, parsed.hostname, parsed.pathname),
      limit: 80,
      windowSeconds: IMAGE_RATE_LIMIT_WINDOW_SECONDS
    },
    {
      scope: "image_proxy:asset_global",
      subject: assetSubject,
      limit: 2_000,
      windowSeconds: IMAGE_RATE_LIMIT_WINDOW_SECONDS
    }
  ]);

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  try {
    const fetchedImage = await fetchImagePayload(cacheKey);

    setCachedImage(cacheKey, {
      kind: "image",
      body: fetchedImage.body,
      contentType: fetchedImage.contentType,
      cachedAt: Date.now()
    });

    return createImageResponse(fetchedImage.body, fetchedImage.contentType, "MISS");
  } catch (error) {
    const imageError = normalizeImageProxyError(error);

    logWarn("image_proxy.fetch_failed", "Open Food Facts image fetch failed", {
      ...getRequestLogContext(req, "/api/images"),
      url: cacheKey,
      status: imageError.status,
      error: error instanceof Error ? error.message : String(error)
    });

    setCachedImage(cacheKey, {
      kind: "error",
      status: imageError.status,
      message: imageError.message,
      cachedAt: Date.now(),
      ttlMs: imageError.ttlMs
    });

    return createImageErrorResponse({ ok: false, message: imageError.message }, imageError.status, {
      cacheStatus: "MISS",
      cdnCacheSeconds: Math.ceil(imageError.ttlMs / 1000)
    });
  }
}

async function fetchImagePayload(url: string): Promise<FetchedImage> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent": "EcoFoodStock/0.1.0",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.2"
      }
    });

    if (!response.ok) {
      throw new ImageProxyError("Unable to fetch image", 502, IMAGE_ERROR_CACHE_TTL_MS);
    }

    const contentType = normalizeImageContentType(response.headers.get("content-type"));

    if (!contentType) {
      throw new ImageProxyError("Unsupported image content type", 415, IMAGE_ERROR_CACHE_TTL_MS);
    }

    const contentLength = Number(response.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw new ImageProxyError("Image too large", 413, IMAGE_ERROR_CACHE_TTL_MS);
    }

    return {
      body: await readLimitedImageBody(response),
      contentType
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readLimitedImageBody(response: Response) {
  if (!response.body) {
    const body = await response.arrayBuffer();

    if (body.byteLength > MAX_IMAGE_BYTES) {
      throw new ImageProxyError("Image too large", 413, IMAGE_ERROR_CACHE_TTL_MS);
    }

    return body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    byteLength += value.byteLength;

    if (byteLength > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new ImageProxyError("Image too large", 413, IMAGE_ERROR_CACHE_TTL_MS);
    }

    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body.buffer;
}

function normalizeOpenFoodFactsImageUrl(value: string) {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return null;
  }

  if (!ALLOWED_IMAGE_PATH_PATTERN.test(parsed.pathname)) {
    return null;
  }

  parsed.protocol = "https:";
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.search = "";
  return parsed;
}

function getCachedImage(key: string) {
  const cachedImage = imageCache.get(key);

  if (!cachedImage) {
    return null;
  }

  const ttlMs = cachedImage.kind === "image" ? IMAGE_MEMORY_CACHE_TTL_MS : cachedImage.ttlMs;

  if (Date.now() - cachedImage.cachedAt > ttlMs) {
    imageCache.delete(key);
    return null;
  }

  return cachedImage;
}

function setCachedImage(key: string, value: CachedImage) {
  imageCache.delete(key);
  imageCache.set(key, value);

  while (imageCache.size > MAX_CACHED_IMAGES || getImageCacheByteLength() > MAX_IMAGE_CACHE_BYTES) {
    const oldestKey = imageCache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    imageCache.delete(oldestKey);
  }
}

function getImageCacheByteLength() {
  let byteLength = 0;

  for (const cachedImage of imageCache.values()) {
    if (cachedImage.kind === "image") {
      byteLength += cachedImage.body.byteLength;
    }
  }

  return byteLength;
}

function secondsUntilCacheExpiry(cachedImage: Extract<CachedImage, { kind: "error" }>) {
  const expiresInMs = Math.max(1_000, cachedImage.ttlMs - (Date.now() - cachedImage.cachedAt));
  return Math.ceil(expiresInMs / 1000);
}

function createImageResponse(body: ArrayBuffer, contentType: string, cacheStatus: ImageCacheStatus) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      ...createImageCacheHeaders({
        browserCacheSeconds: IMAGE_BROWSER_CACHE_SECONDS,
        cdnCacheSeconds: IMAGE_CDN_CACHE_SECONDS,
        staleSeconds: IMAGE_CDN_STALE_SECONDS,
        immutable: true
      }),
      "X-Content-Type-Options": "nosniff",
      "X-EcoFoodStock-Image-Cache": cacheStatus
    }
  });
}

function createImageErrorResponse(
  body: Record<string, unknown>,
  status: number,
  options: { cacheStatus?: ImageCacheStatus; cdnCacheSeconds?: number } = {}
) {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff"
  };

  if (options.cdnCacheSeconds) {
    Object.assign(
      headers,
      createImageCacheHeaders({
        browserCacheSeconds: IMAGE_ERROR_BROWSER_CACHE_SECONDS,
        cdnCacheSeconds: Math.min(options.cdnCacheSeconds, IMAGE_ERROR_CDN_CACHE_SECONDS),
        staleSeconds: IMAGE_ERROR_CDN_CACHE_SECONDS,
        immutable: false
      })
    );
  } else {
    headers["Cache-Control"] = "no-store";
  }

  if (options.cacheStatus) {
    headers["X-EcoFoodStock-Image-Cache"] = options.cacheStatus;
  }

  return NextResponse.json(body, {
    status,
    headers
  });
}

function createImageCacheHeaders(options: {
  browserCacheSeconds: number;
  cdnCacheSeconds: number;
  staleSeconds: number;
  immutable: boolean;
}) {
  const immutableSuffix = options.immutable ? ", immutable" : "";
  const cdnCacheControl = [
    "public",
    `max-age=${options.cdnCacheSeconds}`,
    `stale-while-revalidate=${options.staleSeconds}`,
    `stale-if-error=${options.staleSeconds}`
  ].join(", ");

  return {
    "Cache-Control": [
      "public",
      `max-age=${options.browserCacheSeconds}`,
      `s-maxage=${options.cdnCacheSeconds}`,
      `stale-while-revalidate=${options.staleSeconds}`,
      `stale-if-error=${options.staleSeconds}${immutableSuffix}`
    ].join(", "),
    "CDN-Cache-Control": cdnCacheControl,
    "Vercel-CDN-Cache-Control": cdnCacheControl
  };
}

function normalizeImageContentType(value: string | null) {
  const mediaType = value?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (!mediaType.startsWith("image/") || mediaType === "image/svg+xml") {
    return null;
  }

  return value ?? mediaType;
}

function normalizeImageProxyError(error: unknown) {
  if (error instanceof ImageProxyError) {
    return {
      message: error.publicMessage,
      status: error.status,
      ttlMs: error.ttlMs
    };
  }

  if (isAbortError(error)) {
    return {
      message: "Image fetch timed out",
      status: 504,
      ttlMs: IMAGE_ERROR_CACHE_TTL_MS
    };
  }

  return {
    message: "Unable to fetch image",
    status: 502,
    ttlMs: IMAGE_ERROR_CACHE_TTL_MS
  };
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

class ImageProxyError extends Error {
  constructor(
    readonly publicMessage: string,
    readonly status: number,
    readonly ttlMs: number
  ) {
    super(publicMessage);
  }
}
