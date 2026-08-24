import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit, requestClientKey } from "@/lib/security";

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function proxy(request: NextRequest) {
  if (!writeMethods.has(request.method)) return NextResponse.next();
  const client = requestClientKey(request);
  const isIdentity = request.nextUrl.pathname.startsWith("/api/auth/") && request.nextUrl.pathname !== "/api/auth/logout";
  const limit = await consumeRateLimit(`${isIdentity ? "identity" : "write"}:${client}`, isIdentity ? 10 : 120, isIdentity ? 15 * 60 : 60);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000))) } });

  if (request.cookies.has("planeo_session")) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
    const expectedOrigin = host ? `${protocol}://${host}` : request.nextUrl.origin;
    if (!origin || origin !== expectedOrigin) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
