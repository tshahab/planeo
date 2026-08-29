import type { Issue as PrismaIssue, IssueType, Status, User } from "@prisma/client";
import type { Issue, Priority, Status as UiStatus } from "./types";

type IssueRecord = PrismaIssue & {
  assignee: User | null;
  reporter: User;
  issueType: IssueType;
  status: Status;
  labels: { label: { name: string } }[];
  _count: { comments: number; attachments: number };
  sprintIssues: { sprint: { id: string; name: string } }[];
  releases: { release: { id:string; name:string; status:"PLANNED"|"RELEASED"; archivedAt:Date|null; releasedAt:Date|null } }[];
  customFieldValues: { fieldId: string; value: unknown; field: { name: string; type: string; options: unknown; archivedAt: Date | null } }[];
};

const priorities: Record<string, Priority> = {
  URGENT: "Urgent", HIGH: "High", MEDIUM: "Medium", LOW: "Low",
};

export function toUiIssue(issue: IssueRecord, projectKey: string): Issue {
  return {
    id: issue.id,
    key: `${projectKey}-${issue.number}`,
    title: issue.summary,
    description: typeof issue.description === "string" ? issue.description : "No description yet.",
    status: issue.status.name as UiStatus,
    priority: priorities[issue.priority],
    type: issue.issueType.name,
    assignee: issue.assignee ? {
      id: issue.assignee.id,
      name: issue.assignee.name,
      initials: issue.assignee.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      color: avatarColor(issue.assignee.id),
    } : undefined,
    points: issue.estimate ?? undefined,
    labels: issue.labels.map(({ label }) => label.name),
    due: issue.dueDate ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(issue.dueDate) : undefined,
    dueDate: issue.dueDate ? issue.dueDate.toISOString().slice(0, 10) : undefined,
    comments: issue._count.comments,
    attachments: issue._count.attachments,
    reporter: { id: issue.reporter.id, name: issue.reporter.name, initials: issue.reporter.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), color: avatarColor(issue.reporter.id) },
    sprint: issue.sprintIssues[0]?.sprint,
    releases: issue.releases.map(({release})=>({id:release.id,name:release.name,status:release.status,archived:Boolean(release.archivedAt),releasedAt:release.releasedAt?.toISOString()})),
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    customFields: Object.fromEntries(issue.customFieldValues.map((item) => [item.fieldId, { name: item.field.name, type: item.field.type, value: item.value, options: Array.isArray(item.field.options) ? item.field.options.filter((value): value is string => typeof value === "string") : [], archived: Boolean(item.field.archivedAt) }])),
  };
}

function avatarColor(value: string) {
  const colors = ["#7967e8", "#0b9f8d", "#dc6c56", "#3f7acb", "#b169a8"];
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}
