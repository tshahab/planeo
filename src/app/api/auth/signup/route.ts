import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : ""; const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""; const password = typeof body?.password === "string" ? body.password : ""; const workspaceName = typeof body?.workspaceName === "string" ? body.workspaceName.trim() : ""; const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || workspaceName.length < 2 || workspaceName.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 48) return NextResponse.json({ error: "Enter a valid name, email, workspace name, and unique lowercase slug." }, { status: 400 });
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return NextResponse.json({ error: "Password must be at least 12 characters and include upper, lower, and numeric characters." }, { status: 400 });
  if (await db.user.findUnique({ where: { email } }) || await db.workspace.findUnique({ where: { slug } })) return NextResponse.json({ error: "Account setup could not be completed with those details." }, { status: 409 });
  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name, email, passwordHash: hashPassword(password) } });
      const workspace = await tx.workspace.create({ data: { name: workspaceName, slug } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
      const key = "FIRST";
      const project = await tx.project.create({ data: { workspaceId: workspace.id, name: "First project", key, description: "Your team’s first Planeo project.", template: "KANBAN" } });
      await tx.projectMember.create({ data: { projectId: project.id, userId: user.id, role: "ADMIN" } });
      const types = [["Epic", "EPIC"], ["Story", "STORY"], ["Task", "TASK"], ["Bug", "BUG"], ["Subtask", "SUBTASK"]] as const;
      await Promise.all(types.map(([typeName, kind], position) => tx.issueType.create({ data: { projectId: project.id, name: typeName, kind, position } })));
      const statusData = [["To do", "TODO", "#8a93a3"], ["In progress", "IN_PROGRESS", "#5a72d8"], ["In review", "IN_PROGRESS", "#a16bc0"], ["Done", "DONE", "#43a47e"]] as const;
      const statuses = []; for (const [position, [statusName, category, color]] of statusData.entries()) statuses.push(await tx.status.create({ data: { projectId: project.id, name: statusName, category, color, position } }));
      const board = await tx.board.create({ data: { projectId: project.id, name: "Main board" } });
      await Promise.all(statuses.map((status, position) => tx.boardColumn.create({ data: { boardId: board.id, statusId: status.id, name: status.name, position } })));
      await tx.auditEvent.createMany({ data: [{ workspaceId: workspace.id, actorId: user.id, action: "identity.signup", targetType: "user", targetId: user.id, metadata: {} }, { workspaceId: workspace.id, actorId: user.id, action: "workspace.created", targetType: "workspace", targetId: workspace.id, metadata: { slug } }] });
      return { user, workspace, project };
    });
    await createSession(result.user.id, result.workspace.id);
    return NextResponse.json({ projectKey: result.project.key }, { status: 201 });
  } catch { return NextResponse.json({ error: "Account setup could not be completed." }, { status: 409 }); }
}
