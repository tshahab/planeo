import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ user: context.user });
}

export async function PATCH(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as { name?: unknown; avatarUrl?: unknown; timezone?: unknown; emailNotifications?: unknown; inAppNotifications?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const avatarUrl = typeof body?.avatarUrl === "string" ? body.avatarUrl.trim() || null : null;
  const timezone = typeof body?.timezone === "string" ? body.timezone.trim() : "";
  if (!name || name.length > 100) return NextResponse.json({ error: "Enter a valid display name." }, { status: 400 });
  if (avatarUrl) { try { const parsed = new URL(avatarUrl); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } catch { return NextResponse.json({ error: "Avatar must be a valid HTTP URL." }, { status: 400 }); } }
  try { Intl.DateTimeFormat(undefined, { timeZone: timezone }).format(); } catch { return NextResponse.json({ error: "Select a valid time zone." }, { status: 400 }); }
  if (typeof body?.emailNotifications !== "boolean" || typeof body.inAppNotifications !== "boolean") return NextResponse.json({ error: "Notification preferences are required." }, { status: 400 });
  const user = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: context.user.id }, data: { name, avatarUrl, timezone, emailNotifications: body.emailNotifications as boolean, inAppNotifications: body.inAppNotifications as boolean }, select: { id: true, email: true, name: true, avatarUrl: true, timezone: true, emailNotifications: true, inAppNotifications: true } });
    await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "identity.profile_updated", targetType: "user", targetId: context.user.id, metadata: {} } });
    return updated;
  });
  return NextResponse.json({ user });
}
