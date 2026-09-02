import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { consumePortalToken, createPortalSession } from "@/lib/portal-auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const token = typeof body?.token === "string" ? body.token : ""; const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return NextResponse.json({ error: "Password must be at least 12 characters and include upper, lower, and numeric characters." }, { status: 400 });
  const customer = await db.$transaction(async (tx) => { const found = await consumePortalToken(tx, token, "INVITATION"); if (!found) return null; return tx.portalCustomer.update({ where: { id: found.id }, data: { passwordHash: hashPassword(password), verifiedAt: found.verifiedAt ?? new Date() }, include: { workspace: true } }); });
  if (!customer) return NextResponse.json({ error: "Activation link is invalid or expired." }, { status: 400 });
  await createPortalSession(customer.id, customer.workspaceId); return NextResponse.json({ workspace: customer.workspace.slug });
}
