export type Status = "Backlog" | "To do" | "In progress" | "In review" | "Done";
export type Priority = "Urgent" | "High" | "Medium" | "Low";
export type IssueType = "Epic" | "Story" | "Task" | "Bug";

export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface Issue {
  id: string;
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
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description?: string;
  template: "KANBAN" | "SCRUM";
  visibility: "PUBLIC" | "PRIVATE";
}
