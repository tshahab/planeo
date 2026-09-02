import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { queueProject, QueueError } from "@/lib/service-queues";
import { requireProjectPermission } from "@/lib/permissions";
import { queueFailure } from "@/lib/queue-http";
import { validateSlaGoal } from "@/lib/sla";
import { validateCalendar } from "../../../../../../ops/sla-engine.mjs";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const project = await queueProject(context, (await params).key);
    if (!await requireProjectPermission(context, project.id, "project.admin")) throw new QueueError("Project not found.", 404);
    const [calendars, goals] = await Promise.all([db.slaCalendar.findMany({ where: { projectId: project.id }, include: { versions: { orderBy: { version: "desc" } } } }), db.slaGoal.findMany({ where: { projectId: project.id }, orderBy: [{ position: "asc" }, { id: "asc" }], include: { versions: { orderBy: { version: "desc" } } } })]);
    return NextResponse.json({ calendars, goals }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return queueFailure(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const project = await queueProject(context, (await params).key);
    if (!await requireProjectPermission(context, project.id, "project.admin")) throw new QueueError("Project not found.", 404);
    const body = await request.json() as Record<string, unknown>, name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100 || !["calendar", "goal"].includes(String(body.kind))) throw new QueueError("A valid name and configuration kind are required.");
    const id = typeof body.id === "string" ? body.id : null;
    const result = await db.$transaction(async tx => {
      if (body.kind === "calendar") {
        const config = validateCalendar(body.config);
        const existing = id ? await tx.slaCalendar.findFirst({ where: { id, projectId: project.id } }) : null;
        if (id && !existing) throw new QueueError("Calendar not found.", 404);
        if (existing && body.version !== existing.currentVersion) throw new QueueError("Calendar changed. Refresh and retry.", 409);
        const calendar = existing ?? await tx.slaCalendar.create({ data: { projectId: project.id, name } });
        const version = existing ? existing.currentVersion + 1 : 1;
        await tx.slaCalendarVersion.create({ data: { calendarId: calendar.id, version, config: config as unknown as Prisma.InputJsonValue, createdById: context.user.id } });
        await tx.slaCalendar.update({ where: { id: calendar.id }, data: { name, currentVersion: version } });
        await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "sla.calendar.versioned", targetType: "slaCalendar", targetId: calendar.id, metadata: { version } } });
        return { id: calendar.id, version };
      }
      const existing = id ? await tx.slaGoal.findFirst({ where: { id, projectId: project.id } }) : null;
      if (id && !existing) throw new QueueError("Goal not found.", 404);
      if (existing && body.version !== existing.currentVersion) throw new QueueError("Goal changed. Refresh and retry.", 409);
      const metric = existing?.metric ?? String(body.metric), position = Number(body.position ?? 0);
      if (!Number.isInteger(position) || position < 0 || position > 10000 || body.enabled !== undefined && typeof body.enabled !== "boolean") throw new QueueError("Invalid goal ordering or availability.");
      const data = await validateSlaGoal(tx, project.id, context.workspace.id, body, metric);
      if (!existing && await tx.slaGoal.count({ where: { projectId: project.id } }) >= 100) throw new QueueError("This project has reached its 100-goal limit.");
      const goal = existing ?? await tx.slaGoal.create({ data: { projectId: project.id, name, metric, position } }), version = existing ? existing.currentVersion + 1 : 1;
      await tx.slaGoalVersion.create({ data: { ...data, goalId: goal.id, version, createdById: context.user.id } });
      await tx.slaGoal.update({ where: { id: goal.id }, data: { name, position, enabled: body.enabled !== false, currentVersion: version } });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "sla.goal.versioned", targetType: "slaGoal", targetId: goal.id, metadata: { version } } });
      return { id: goal.id, version };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return queueFailure(error); }
}
