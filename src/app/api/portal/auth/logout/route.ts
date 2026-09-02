import { NextResponse } from "next/server";
import { clearPortalSession } from "@/lib/portal-auth";
export async function POST(request: Request) { await clearPortalSession(); return NextResponse.redirect(new URL("/portal/login", request.url), 303); }
