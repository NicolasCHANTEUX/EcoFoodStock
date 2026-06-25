const OFF_IMAGE_HOSTS = new Set(["images.openfoodfacts.org", "static.openfoodfacts.org", "images.openfoodfacts.net"]);
type OffImageSize = "100" | "200" | "400";

type OffImageUrlOptions = {
  proxy?: boolean;
  size?: OffImageSize;
};

export function proxiedOffImageUrl(url?: string | null, options: OffImageUrlOptions = {}) {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);

    if (!OFF_IMAGE_HOSTS.has(parsed.hostname)) {
      return undefined;
    }

    parsed.protocol = "https:";
    const optimizedUrl = optimizeOffImageUrl(parsed, options.size ?? "200");

    if (options.proxy === false) {
      return optimizedUrl;
    }

    return `/api/images?src=${encodeURIComponent(optimizedUrl)}`;
  } catch {
    return undefined;
  }
}

export function persistableOffImageUrl(url?: string | null, baseUrl = "http://localhost") {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url, baseUrl);
    const sourceUrl = parsed.pathname === "/api/images" ? parsed.searchParams.get("src") : parsed.toString();
    return proxiedOffImageUrl(sourceUrl, { proxy: false });
  } catch {
    return undefined;
  }
}

function optimizeOffImageUrl(url: URL, size: OffImageSize) {
  const nextUrl = new URL(url.toString());
  nextUrl.pathname = nextUrl.pathname.replace(/\.(100|200|400)(\.(?:jpe?g|png|webp))$/i, `.${size}$2`);
  return nextUrl.toString();
}
