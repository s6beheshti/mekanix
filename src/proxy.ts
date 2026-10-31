import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REQUEST_ID_HEADER = "x-request-id";

// MEKANIX — Next.js 16 Proxy (formerly `middleware.ts`)
//
// Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`.
// The exported handler must be named `proxy` (or use a default export).
// See: node_modules/next/dist/build/templates/middleware.js
//   const handlerUserland = (isProxy ? mod.proxy : mod.middleware) || mod.default;
//
// Everything else (config.matcher, request shape, NextResponse API) is
// unchanged from the previous middleware convention.

export function proxy(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("X-Request-ID", requestId);

  // Security headers — permissive for preview panel iframe
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");

  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    res.headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  // In dev: allow all frame ancestors so preview panel works
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.socket.io",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https: http:",
    "connect-src 'self' ws: wss: https: http:",
    "worker-src 'self' blob:",
    process.env.NODE_ENV === "production" ? "frame-ancestors 'self'" : "frame-ancestors *",
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
