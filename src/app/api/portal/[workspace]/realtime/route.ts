import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalContext, portalRequestWhere } from "@/lib/portal-auth";

export async function GET(request: Request, { params }: { params: Promise<{ workspace: string }> }) {
  const context = await getPortalContext();
  const { workspace } = await params;

  if (!context || context.workspace.slug !== workspace) {
    return NextResponse.json({ error: "Portal not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const cursorParam = url.searchParams.get("cursor");
  if (cursorParam !== null && !/^\d{1,18}$/.test(cursorParam)) return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
  let cursor: bigint;

  try {
    cursor = BigInt(cursorParam ?? "0");
    if (cursor < 0) throw new Error("Cursor must be non-negative.");
  } catch {
    return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
  }

  // Fetch issue.created/issue.updated events for the workspace, after the cursor.
  // We don't filter by resourceId (issueId) here yet, as we need to authorize them first.
  const events = await db.realtimeEvent.findMany({
    where: {
      workspaceId: context.workspace.id,
      id: { gt: cursor },
      type: { in: ["issue.created", "issue.updated"] },
    },
    select: {
      id: true,
      resourceId: true, // This is the issueId
      createdAt: true,
    },
    orderBy: { id: "asc" },
    take: 100,
  });

  // Extract unique issueIds from the fetched events
  const issueIds = events.map((event) => event.resourceId).filter((id): id is string => id !== null);

  // Fetch authorized ServiceRequests for these issueIds
  const authorizedRequests = await db.serviceRequest.findMany({
    where: {
      ...portalRequestWhere(context),
      issueId: { in: issueIds },
    },
    select: {
      id: true,
      issueId: true,
    },
  });

  const authorizedIssueIdToRequestId = new Map<string, string>();
  for (const req of authorizedRequests) {
    authorizedIssueIdToRequestId.set(req.issueId, req.id);
  }

  const signals: { id: string; requestId: string; type: "request.changed"; createdAt: string }[] = [];
  let lastScannedEventCursor: bigint = cursor;

  for (const event of events) {
    lastScannedEventCursor = event.id; // Always advance cursor to the last scanned event

    const requestId = event.resourceId ? authorizedIssueIdToRequestId.get(event.resourceId) : undefined;
    if (requestId) {
      signals.push({
        id: event.id.toString(),
        requestId: requestId,
        createdAt: event.createdAt.toISOString(),
        type: "request.changed",
      });
    }
  }

  return NextResponse.json({
    events: signals,
    cursor: lastScannedEventCursor.toString(),
  });
}
