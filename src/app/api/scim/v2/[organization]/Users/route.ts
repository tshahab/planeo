import { authenticateScim, normalizeScimEmail, parseScimFilter, scimBase, scimError, scimLog, scimPage, scimResponse, scimUser, SCIM_LIST_SCHEMA } from "@/lib/scim";
import { db } from "@/lib/db";

export async function GET(request: Request, { params }: { params: Promise<{ organization: string }> }) {
  const { organization } = await params;
  const auth = await authenticateScim(request, organization, "users:read"); if (auth.error) return auth.error;
  try {
    const filter = parseScimFilter(new URL(request.url).searchParams.get("filter"), ["userName", "externalId"]);
    const where = { organizationId: auth.organizationId, ...(filter ? { [filter.attribute]: filter.attribute === "userName" ? filter.value.toLowerCase() : filter.value } : {}) };
    const page = scimPage(request.url);
    const [totalResults, identities] = await Promise.all([db.scimIdentity.count({ where }), db.scimIdentity.findMany({ where, include: { user: true }, orderBy: { id: "asc" }, skip: page.skip, take: page.count })]);
    const base = scimBase(request, organization);
    return scimResponse({ schemas: [SCIM_LIST_SCHEMA], totalResults, startIndex: page.startIndex, itemsPerPage: identities.length, Resources: identities.map(item => scimUser(item, base)) });
  } catch { return scimError(400, "The filter is invalid.", "invalidFilter"); }
}

export async function POST(request: Request, { params }: { params: Promise<{ organization: string }> }) {
  const { organization } = await params;
  const auth = await authenticateScim(request, organization, "users:write"); if (auth.error) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const userName = normalizeScimEmail(body?.userName);
  const externalId = typeof body?.externalId === "string" && body.externalId.trim() ? body.externalId.trim().slice(0, 500) : null;
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : typeof (body?.name as Record<string, unknown> | undefined)?.formatted === "string" ? String((body?.name as Record<string, unknown>).formatted).trim() : "";
  const active = body?.active !== false;
  if (!userName || displayName.length < 1 || displayName.length > 100) return scimError(400, "userName and displayName are required.", "invalidValue");
  const existing = await db.scimIdentity.findFirst({ where: { organizationId: auth.organizationId, OR: [{ userName }, ...(externalId ? [{ externalId }] : [])] }, include: { user: true } });
  const base = scimBase(request, organization);
  if (existing) {
    if (existing.userName === userName && existing.externalId === externalId) return scimResponse(scimUser(existing, base));
    return scimError(409, "A user with that userName or externalId already exists.", "uniqueness");
  }
  try {
    const identity = await db.$transaction(async tx => {
      const organizationRecord = await tx.organization.findUnique({ where: { id: auth.organizationId }, include: { workspaces: { orderBy: { createdAt: "asc" }, take: 1 } } });
      const workspace = organizationRecord?.workspaces[0]; if (!workspace) throw new Error("no_workspace");
      const existingUser = await tx.user.findUnique({ where: { email: userName } });
      if (existingUser) {
        const membership = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: auth.organizationId, userId: existingUser.id } } });
        if (!membership) throw new Error("account_conflict");
        await tx.organizationMember.update({ where: { organizationId_userId: { organizationId: auth.organizationId, userId: existingUser.id } }, data: { deactivatedAt: active ? null : new Date() } });
        await tx.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: existingUser.id } }, create: { workspaceId: workspace.id, userId: existingUser.id, role: "MEMBER", deactivatedAt: active ? null : new Date() }, update: { deactivatedAt: active ? null : new Date() } });
        await tx.user.update({ where: { id: existingUser.id }, data: { name: displayName } });
        return tx.scimIdentity.create({ data: { organizationId: auth.organizationId, userId: existingUser.id, externalId, userName, active }, include: { user: true } });
      }
      const user = await tx.user.create({ data: { email: userName, name: displayName } });
      await tx.organizationMember.create({ data: { organizationId: auth.organizationId, userId: user.id, role: "MEMBER", deactivatedAt: active ? null : new Date() } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "MEMBER", deactivatedAt: active ? null : new Date() } });
      return tx.scimIdentity.create({ data: { organizationId: auth.organizationId, userId: user.id, externalId, userName, active }, include: { user: true } });
    });
    await scimLog(auth.organizationId, auth.token.id, "create", "User", identity.id, 201, undefined, { active });
    return scimResponse(scimUser(identity, base), 201, { location: `${base}/Users/${identity.id}`, etag: `W/\"${identity.version}\"` });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalidValue";
    await scimLog(auth.organizationId, auth.token.id, "create", "User", null, 409, code);
    return scimError(409, "The user conflicts with an existing account or tenant.", "uniqueness");
  }
}
