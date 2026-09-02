import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { createPortalSession } from "@/lib/portal-auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const workspace = typeof body?.workspace === "string" ? body.workspace.trim().toLowerCase() : ""; const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""; const password = typeof body?.password === "string" ? body.password : "";
  const customer = workspace && email && password ? await db.portalCustomer.findFirst({ where: { email, workspace: { slug: workspace }, verifiedAt: { not: null }, deactivatedAt: null }, include: { workspace: true } }) : null;
  if (!customer?.passwordHash || !verifyPassword(password, customer.passwordHash)) return NextResponse.json({ error: "Email, password, or portal is incorrect." }, { status: 401 });
  await createPortalSession(customer.id, customer.workspaceId); return NextResponse.json({ workspace: customer.workspace.slug });
}
