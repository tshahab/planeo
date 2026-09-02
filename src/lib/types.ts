export type Status = string;
export type Priority = "Urgent" | "High" | "Medium" | "Low";
export type IssueType = string;

export interface ProjectStatus { id: string; name: string; color: string; category: "TODO" | "IN_PROGRESS" | "DONE"; wipLimit?: number; }
export interface ProjectIssueType { id: string; name: string; kind: string; }

export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface Issue {
  id: string;
  issueTypeId?: string;
  key: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  type: IssueType;
  assignee?: Person;
  points?: number;
  labels: string[];
  due?: string;
  dueDate?: string;
  comments: number;
  attachments: number;
  reporter?: Person;
  sprint?: { id: string; name: string };
  releases?: Array<{id:string;name:string;status:"PLANNED"|"RELEASED";archived:boolean;releasedAt?:string}>;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  customFields?: Record<string, { name: string; type: string; value: unknown; options: string[]; archived: boolean }>;
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description?: string;
  template: "KANBAN" | "SCRUM" | "SERVICE";
  visibility: "PUBLIC" | "PRIVATE";
}

export interface SprintSummary {
  id: string;
  name: string;
  goal?: string;
  state: "PLANNED" | "ACTIVE" | "COMPLETED";
  startsAt?: string;
  endsAt?: string;
  completedAt?: string;
  totalIssueCount?: number;
  completedIssueCount?: number;
  totalEstimate?: number;
  completedEstimate?: number;
  capacityTarget?: number;
  position: number;
  version: number;
  issueCount?: number;
  estimateTotal?: number;
  issues: Issue[];
}
