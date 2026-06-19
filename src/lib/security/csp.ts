const OFF_IMAGE_HOSTS =
  "https://images.openfoodfacts.org https://static.openfoodfacts.org https://images.openfoodfacts.net";

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function isStrictCspEnabled() {
  return isEnabled(process.env.ECOFOODSTOCK_STRICT_CSP);
}

export function createCspNonce() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function buildStrictContentSecurityPolicy(nonce: string) {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${OFF_IMAGE_HOSTS}`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://world.openfoodfacts.org ${OFF_IMAGE_HOSTS}${
      isDevelopment ? " ws: wss:" : ""
    }`,
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"])
  ];

  return directives.join("; ");
}
