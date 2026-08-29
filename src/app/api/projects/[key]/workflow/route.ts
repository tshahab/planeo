import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { validateWorkflowDraft, type TransitionDraft } from "@/lib/workflow";

const categories = ["TODO", "IN_PROGRESS", "DONE"] as const;
const kinds = ["EPIC", "STORY", "TASK", "BUG", "SUBTASK"] as const;
const priorities = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

async function managedProject(key: string) {
  const context = await getAuthContext();
  if (!context) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const project = await db.project.findUnique({ where: { workspaceId_key: { workspaceId: context.workspace.id, key: key.toUpperCase() } } });
  if (!project || project.archivedAt) return { error: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  const membership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } } });
  if (context.role !== "OWNER" && context.role !== "ADMIN" && membership?.role !== "ADMIN") return { error: NextResponse.json({ error: "Project administration is required." }, { status: 403 }) };
  return { context, project };
}

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const result = await managedProject((await params).key); if (result.error) return result.error;
  const { project } = result;
  const [statuses, issueTypes, board, transitions, versions, customFields] = await Promise.all([
    db.status.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } }),
    db.issueType.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } }),
    db.board.findFirst({ where: { projectId: project.id }, include: { columns: { orderBy: { position: "asc" } } } }),
    db.workflowTransition.findMany({ where: { projectId: project.id }, orderBy: [{ position: "asc" }, { id: "asc" }] }),
    db.workflowVersion.findMany({ where: { projectId: project.id }, orderBy: { version: "desc" }, take: 20, select: { version: true, publishedAt: true, createdById: true } }),
    db.customFieldProject.findMany({ where: { projectId: project.id, field: { archivedAt: null } }, include: { field: true } }),
  ]);
  return NextResponse.json({ project: { defaultPriority: project.defaultPriority }, statuses, issueTypes, board, transitions, versions, customFields });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const result = await managedProject((await params).key); if (result.error) return result.error;
  const { context, project } = result;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const id = typeof body?.id === "string" ? body.id : "";
  let targetId = id || project.id;
  try { await db.$transaction(async (tx) => {
    if (action === "status.create") {
      const name = text(body?.name, 50); const category = categories.includes(body?.category as typeof categories[number]) ? body?.category as typeof categories[number] : null; const color = validColor(body?.color);
      if (!name || !category || !color) throw new Error("INVALID_STATUS");
      const position = await tx.status.count({ where: { projectId: project.id } });
      const status = await tx.status.create({ data: { projectId: project.id, name, category, color, position } }); targetId = status.id;
      const board = await tx.board.findFirst({ where: { projectId: project.id } }); if (board) await tx.boardColumn.create({ data: { boardId: board.id, statusId: status.id, name, position } });
    } else if (action === "status.update") {
      const status = await tx.status.findFirst({ where: { id, projectId: project.id } }); if (!status) throw new Error("NOT_FOUND");
      const name = body?.name === undefined ? status.name : text(body.name, 50); const category = body?.category === undefined ? status.category : categories.includes(body.category as typeof categories[number]) ? body.category as typeof categories[number] : null; const color = body?.color === undefined ? status.color : validColor(body.color);
      if (!name || !category || !color) throw new Error("INVALID_STATUS"); await tx.status.update({ where: { id }, data: { name, category, color } }); await tx.boardColumn.updateMany({ where: { statusId: id }, data: { name } });
    } else if (action === "status.delete") {
      const replacementId = typeof body?.replacementId === "string" ? body.replacementId : ""; const [status, replacement] = await Promise.all([tx.status.findFirst({ where: { id, projectId: project.id } }), tx.status.findFirst({ where: { id: replacementId, projectId: project.id } })]); if (!status || !replacement || id === replacementId) throw new Error("INVALID_REMAP"); await tx.issue.updateMany({ where: { projectId: project.id, statusId: id }, data: { statusId: replacementId } }); await tx.boardColumn.deleteMany({ where: { statusId: id, board: { projectId: project.id } } }); await tx.status.delete({ where: { id } });
    } else if (action === "status.move" || action === "type.move" || action === "column.move") {
      const direction = body?.direction === "up" ? -1 : body?.direction === "down" ? 1 : 0; if (!direction) throw new Error("INVALID_MOVE");
      if (action === "status.move") { await reorder(tx, "status", project.id, id, direction); const ordered = await tx.status.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" }, select: { id: true } }); await Promise.all(ordered.map((status, position) => tx.boardColumn.updateMany({ where: { statusId: status.id, board: { projectId: project.id } }, data: { position } }))); }
      else if (action === "type.move") await reorder(tx, "type", project.id, id, direction);
      else { const board = await tx.board.findFirst({ where: { projectId: project.id } }); if (!board) throw new Error("NOT_FOUND"); await reorder(tx, "column", board.id, id, direction); }
    } else if (action === "type.create") {
      const name = text(body?.name, 50); const kind = kinds.includes(body?.kind as typeof kinds[number]) ? body?.kind as typeof kinds[number] : null; if (!name || !kind) throw new Error("INVALID_TYPE"); const position = await tx.issueType.count({ where: { projectId: project.id } }); const created = await tx.issueType.create({ data: { projectId: project.id, name, kind, position } }); targetId = created.id;
    } else if (action === "type.update") {
      const existing = await tx.issueType.findFirst({ where: { id, projectId: project.id } }); if (!existing) throw new Error("NOT_FOUND"); const name = body?.name === undefined ? existing.name : text(body.name, 50); const kind = body?.kind === undefined ? existing.kind : kinds.includes(body.kind as typeof kinds[number]) ? body.kind as typeof kinds[number] : null; if (!name || !kind) throw new Error("INVALID_TYPE"); await tx.issueType.update({ where: { id }, data: { name, kind } });
    } else if (action === "type.delete") {
      const existing = await tx.issueType.findFirst({ where: { id, projectId: project.id }, include: { _count: { select: { issues: true } } } }); if (!existing) throw new Error("NOT_FOUND"); if (existing._count.issues) throw new Error("TYPE_IN_USE"); await tx.issueType.delete({ where: { id } });
    } else if (action === "column.update") {
      const column = await tx.boardColumn.findFirst({ where: { id, board: { projectId: project.id } } }); if (!column) throw new Error("NOT_FOUND"); const name = body?.name === undefined ? column.name : text(body.name, 50); const wipLimit = body?.wipLimit === null || body?.wipLimit === "" ? null : Number(body?.wipLimit); if (!name || (wipLimit !== null && (!Number.isInteger(wipLimit) || wipLimit < 1 || wipLimit > 999))) throw new Error("INVALID_COLUMN"); await tx.boardColumn.update({ where: { id }, data: { name, wipLimit } });
    } else if (action === "transitions.set") {
      if (!Array.isArray(body?.transitions)) throw new Error("INVALID_TRANSITIONS"); const draft = await validateWorkflowDraft(tx, project.id, body.transitions as TransitionDraft[]); if (body.preview === true) return; const latest = await tx.workflowVersion.aggregate({ where: { projectId: project.id }, _max: { version: true } }); const version = (latest._max.version ?? 0) + 1; await tx.workflowTransition.deleteMany({ where: { projectId: project.id } }); for (const item of draft) await tx.workflowTransition.create({ data: { projectId: project.id, fromStatusId: item.fromStatusId, toStatusId: item.toStatusId, name: item.name!.trim(), description: item.description?.trim(), position: item.position ?? 0, enabled: item.enabled !== false, conditions: (item.conditions ?? []) as Prisma.InputJsonValue, validators: (item.validators ?? []) as Prisma.InputJsonValue, actions: (item.actions ?? []) as Prisma.InputJsonValue, workflowVersion: version } }); await tx.workflowVersion.create({ data: { projectId: project.id, version, createdById: context.user.id, configuration: JSON.parse(JSON.stringify(draft)) as Prisma.InputJsonValue } }); targetId = String(version);
    } else if (action === "defaults.update") {
      const defaultPriority = body?.defaultPriority as typeof priorities[number]; if (!priorities.includes(defaultPriority)) throw new Error("INVALID_PRIORITY"); await tx.project.update({ where: { id: project.id }, data: { defaultPriority } });
    } else throw new Error("INVALID_ACTION");
    await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: `workflow.${action}`, targetType: "workflow", targetId, metadata: { projectId: project.id } } });
  }); } catch (cause) { const code = cause instanceof Error ? cause.message : "INVALID_ACTION"; const messages: Record<string,string> = { INVALID_STATUS:"Status details are invalid or duplicated.", INVALID_REMAP:"Choose a different status in this project before deleting.", INVALID_MOVE:"Ordering direction is invalid.", INVALID_TYPE:"Issue type details are invalid or duplicated.", TYPE_IN_USE:"This issue type is still used by issues.", INVALID_COLUMN:"Column details or WIP limit are invalid.", INVALID_TRANSITIONS:"Transitions must reference statuses in this project.", INVALID_PRIORITY:"Default priority is invalid.", NOT_FOUND:"Configuration item not found.", INVALID_ACTION:"Unsupported configuration action." }; return NextResponse.json({ error: messages[code] ?? "Configuration could not be saved." }, { status: code === "NOT_FOUND" ? 404 : code.includes("IN_USE") ? 409 : 400 }); }
  return NextResponse.json({ updated: true });
}

function text(value: unknown, max: number) { const result = typeof value === "string" ? value.trim() : ""; return result && result.length <= max ? result : null; }
function validColor(value: unknown) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null; }
async function reorder(tx: Prisma.TransactionClient, kind: "status" | "type" | "column", scopeId: string, id: string, direction: number) {
  const scope = kind === "column" ? { boardId: scopeId } : { projectId: scopeId };
  const current = kind === "status" ? await tx.status.findFirst({ where: { ...scope, id } }) : kind === "type" ? await tx.issueType.findFirst({ where: { ...scope, id } }) : await tx.boardColumn.findFirst({ where: { ...scope, id } });
  if (!current) throw new Error("NOT_FOUND");
  const position = direction < 0 ? { lt: current.position } : { gt: current.position }; const order = direction < 0 ? "desc" as const : "asc" as const;
  const adjacent = kind === "status" ? await tx.status.findFirst({ where: { ...scope, position }, orderBy: { position: order } }) : kind === "type" ? await tx.issueType.findFirst({ where: { ...scope, position }, orderBy: { position: order } }) : await tx.boardColumn.findFirst({ where: { ...scope, position }, orderBy: { position: order } });
  if (!adjacent) return;
  if (kind === "status") { await tx.status.update({ where: { id }, data: { position: adjacent.position } }); await tx.status.update({ where: { id: adjacent.id }, data: { position: current.position } }); }
  else if (kind === "type") { await tx.issueType.update({ where: { id }, data: { position: adjacent.position } }); await tx.issueType.update({ where: { id: adjacent.id }, data: { position: current.position } }); }
  else { await tx.boardColumn.update({ where: { id }, data: { position: adjacent.position } }); await tx.boardColumn.update({ where: { id: adjacent.id }, data: { position: current.position } }); }
}
