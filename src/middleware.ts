import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateRequestId } from "@/lib/observability/request-id";

export function middleware(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"]
};
