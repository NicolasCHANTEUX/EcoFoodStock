import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateRequestId } from "@/lib/observability/request-id";
import { buildStrictContentSecurityPolicy, createCspNonce, isStrictCspEnabled } from "@/lib/security/csp";

export function middleware(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  const requestHeaders = new Headers(request.headers);
  const cspNonce = isStrictCspEnabled() ? createCspNonce() : undefined;
  const strictContentSecurityPolicy = cspNonce ? buildStrictContentSecurityPolicy(cspNonce) : undefined;

  requestHeaders.set("x-request-id", requestId);

  if (cspNonce && strictContentSecurityPolicy) {
    requestHeaders.set("x-nonce", cspNonce);
    requestHeaders.set("Content-Security-Policy", strictContentSecurityPolicy);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  response.headers.set("x-request-id", requestId);

  if (strictContentSecurityPolicy) {
    response.headers.set("Content-Security-Policy", strictContentSecurityPolicy);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|apple-touch-icon.png|manifest.webmanifest|sw.js|offline.html).*)"]
};
