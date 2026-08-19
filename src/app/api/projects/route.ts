import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { listAccessibleProjects } from "@/lib/project-query";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ projects: await listAccessibleProjects(context) });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role !== "OWNER" && context.role !== "ADMIN") return NextResponse.json({ error: "Workspace administration is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const key = typeof body?.key === "string" ? body.key.trim().toUpperCase() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const template = body?.template === "SCRUM" ? "SCRUM" : "KANBAN";
  const visibility = body?.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC";
  if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "Project name must contain 2–80 characters." }, { status: 400 });
  if (!/^[A-Z]{2,10}$/.test(key)) return NextResponse.json({ error: "Project key must contain 2–10 uppercase letters." }, { status: 400 });
  const duplicate = await db.project.findUnique({ where: { workspaceId_key: { workspaceId: context.workspace.id, key } } });
  if (duplicate) return NextResponse.json({ error: "That project key is already in use." }, { status: 409 });

  const project = await db.$transaction(async (tx) => {
    const created = await tx.project.create({ data: { workspaceId: context.workspace.id, name, key, description, template, visibility } });
    await tx.projectMember.create({ data: { projectId: created.id, userId: context.user.id, role: "ADMIN" } });
    const typeData = [["Epic", "EPIC"], ["Story", "STORY"], ["Task", "TASK"], ["Bug", "BUG"], ["Subtask", "SUBTASK"]] as const;
    await Promise.all(typeData.map(([typeName, kind], position) => tx.issueType.create({ data: { projectId: created.id, name: typeName, kind, position } })));
    const statusData = template === "SCRUM"
      ? [["To do", "TODO", "#8a93a3"], ["In progress", "IN_PROGRESS", "#5a72d8"], ["In review", "IN_PROGRESS", "#a16bc0"], ["Done", "DONE", "#43a47e"]] as const
      : [["To do", "TODO", "#8a93a3"], ["In progress", "IN_PROGRESS", "#5a72d8"], ["In review", "IN_PROGRESS", "#a16bc0"], ["Done", "DONE", "#43a47e"]] as const;
    const statuses = [];
    for (const [position, [statusName, category, color]] of statusData.entries()) statuses.push(await tx.status.create({ data: { projectId: created.id, name: statusName, category, color, position } }));
    const board = await tx.board.create({ data: { projectId: created.id, name: "Main board" } });
    await Promise.all(statuses.map((status, position) => tx.boardColumn.create({ data: { boardId: board.id, statusId: status.id, name: status.name, position } })));
    await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "project.created", targetType: "project", targetId: created.id, metadata: { key } } });
    return created;
  });
  return NextResponse.json({ project: { id: project.id, key: project.key, name: project.name, description: project.description, template: project.template, visibility: project.visibility } }, { status: 201 });
}
