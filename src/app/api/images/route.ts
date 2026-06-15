import { NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set(["images.openfoodfacts.org", "static.openfoodfacts.org", "images.openfoodfacts.net"]);
const IMAGE_FETCH_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED_IMAGES = 80;

type CachedImage = {
  body: ArrayBuffer;
  contentType: string;
  cachedAt: number;
};

const imageCache = new Map<string, CachedImage>();

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const url = requestUrl.searchParams.get("src");

  if (!url) {
    return NextResponse.json({ ok: false, message: "src required" }, { status: 400 });
  }

  try {
    const parsed = new URL(url);

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return NextResponse.json({ ok: false, message: "Host not allowed" }, { status: 400 });
    }

    parsed.protocol = "https:";
    const cacheKey = parsed.toString();
    const cachedImage = getCachedImage(cacheKey);

    if (cachedImage) {
      return createImageResponse(cachedImage.body, cachedImage.contentType, "HIT");
    }

    const response = await fetchWithTimeout(cacheKey);

    if (!response.ok) {
      return NextResponse.json({ ok: false, message: "Unable to fetch image", status: response.status }, { status: 502 });
    }

    const contentType = normalizeImageContentType(response.headers.get("content-type"));

    if (!contentType) {
      return NextResponse.json({ ok: false, message: "Unsupported image content type" }, { status: 415 });
    }

    const contentLength = Number(response.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ ok: false, message: "Image too large" }, { status: 413 });
    }

    const body = await response.arrayBuffer();

    if (body.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ ok: false, message: "Image too large" }, { status: 413 });
    }

    setCachedImage(cacheKey, { body, contentType, cachedAt: Date.now() });
    return createImageResponse(body, contentType, "MISS");
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid image url" }, { status: 400 });
  }
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "EcoFoodStock/0.1.0"
      }
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getCachedImage(key: string) {
  const cachedImage = imageCache.get(key);

  if (!cachedImage) {
    return null;
  }

  if (Date.now() - cachedImage.cachedAt > IMAGE_CACHE_TTL_MS) {
    imageCache.delete(key);
    return null;
  }

  return cachedImage;
}

function setCachedImage(key: string, value: CachedImage) {
  imageCache.set(key, value);

  while (imageCache.size > MAX_CACHED_IMAGES) {
    const oldestKey = imageCache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    imageCache.delete(oldestKey);
  }
}

function createImageResponse(body: ArrayBuffer, contentType: string, cacheStatus: "HIT" | "MISS") {
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
      "X-Content-Type-Options": "nosniff",
      "X-EcoFoodStock-Image-Cache": cacheStatus
    }
  });
}

function normalizeImageContentType(value: string | null) {
  const mediaType = value?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (!mediaType.startsWith("image/") || mediaType === "image/svg+xml") {
    return null;
  }

  return value ?? mediaType;
}
