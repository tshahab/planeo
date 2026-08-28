import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit, requestClientKey } from "@/lib/security";
import { logEvent, requestId } from "@/lib/observability";

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function proxy(request: NextRequest) {
  const correlationId = requestId(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", correlationId);
  if (!writeMethods.has(request.method)) return NextResponse.next({ request: { headers: requestHeaders }, headers: { "X-Request-Id": correlationId } });
  const client = requestClientKey(request);
  const isIdentity = request.nextUrl.pathname.startsWith("/api/auth/") && request.nextUrl.pathname !== "/api/auth/logout";
  const identityLimit = Number(process.env.IDENTITY_RATE_LIMIT ?? 10);
  const limit = await consumeRateLimit(`${isIdentity ? "identity" : "write"}:${client}`, isIdentity ? identityLimit : 120, isIdentity ? 15 * 60 : 60);
  if (!limit.allowed) {
    logEvent("warn", "request.rate_limited", { requestId: correlationId, path: request.nextUrl.pathname, method: request.method });
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000))), "X-Request-Id": correlationId } });
  }

  if (request.cookies.has("planeo_session")) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
    const expectedOrigin = host ? `${protocol}://${host}` : request.nextUrl.origin;
    if (!origin || origin !== expectedOrigin) {
      logEvent("warn", "request.cross_site_rejected", { requestId: correlationId, path: request.nextUrl.pathname, method: request.method, origin });
      return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403, headers: { "X-Request-Id": correlationId } });
    }
  }
  return NextResponse.next({ request: { headers: requestHeaders }, headers: { "X-Request-Id": correlationId } });
}

export const config = { matcher: ["/api/:path*"] };
