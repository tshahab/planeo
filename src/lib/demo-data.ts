import type { Issue, Person, Status } from "./types";

export const people: Person[] = [
  { id: "mina", name: "Mina Park", initials: "MP", color: "#7967e8" },
  { id: "sam", name: "Sam Reed", initials: "SR", color: "#0b9f8d" },
  { id: "alex", name: "Alex Chen", initials: "AC", color: "#dc6c56" },
  { id: "noor", name: "Noor Malik", initials: "NM", color: "#3f7acb" },
];

export const initialIssues: Issue[] = [
  { id: "1", key: "WEB-142", title: "Checkout fails when coupon is removed", description: "Customers see a stale total after removing an applied coupon. Recalculate the order and keep the payment intent in sync.", status: "To do", priority: "Urgent", type: "Bug", assignee: people[1], points: 3, labels: ["checkout"], due: "Aug 20", comments: 4, attachments: 1 },
  { id: "2", key: "WEB-139", title: "Add saved payment methods", description: "Let returning customers select a previously saved payment method during checkout.", status: "To do", priority: "High", type: "Story", assignee: people[0], points: 5, labels: ["payments"], comments: 2, attachments: 0 },
  { id: "3", key: "WEB-136", title: "Empty state for new workspaces", description: "Design a helpful first-run state that guides owners to create a project and invite their team.", status: "To do", priority: "Medium", type: "Task", assignee: people[2], points: 2, labels: ["onboarding"], comments: 1, attachments: 2 },
  { id: "4", key: "WEB-138", title: "Redesign profile preferences", description: "Simplify personal settings and separate account security from workspace preferences.", status: "In progress", priority: "High", type: "Story", assignee: people[2], points: 5, labels: ["design-system"], due: "Aug 22", comments: 5, attachments: 3 },
  { id: "5", key: "WEB-134", title: "Improve search result ranking", description: "Rank exact issue-key matches first, followed by title and description matches.", status: "In progress", priority: "Medium", type: "Task", assignee: people[3], points: 3, labels: ["search"], comments: 0, attachments: 0 },
  { id: "6", key: "WEB-131", title: "Add API contract tests", description: "Cover the project and issue endpoints with stable request and response contract tests.", status: "In review", priority: "Medium", type: "Task", assignee: people[1], points: 3, labels: ["quality"], comments: 3, attachments: 0 },
  { id: "7", key: "WEB-126", title: "Keyboard controls for board", description: "Provide accessible move commands and clear focus handling for every issue card.", status: "In review", priority: "High", type: "Story", assignee: people[0], points: 5, labels: ["accessibility"], comments: 6, attachments: 1 },
  { id: "8", key: "WEB-121", title: "Workspace member invitations", description: "Invite members by email, select their initial role, and show pending invitations.", status: "Done", priority: "High", type: "Story", assignee: people[3], points: 5, labels: ["workspace"], comments: 8, attachments: 0 },
  { id: "9", key: "WEB-118", title: "Project creation flow", description: "Create a project from a sensible template with a validated key and clear defaults.", status: "Done", priority: "Medium", type: "Story", assignee: people[1], points: 3, labels: ["projects"], comments: 2, attachments: 1 },
];

export const columns: { status: Status; label: string; tint: string }[] = [
  { status: "To do", label: "To do", tint: "#8a93a3" },
  { status: "In progress", label: "In progress", tint: "#5a72d8" },
  { status: "In review", label: "In review", tint: "#a16bc0" },
  { status: "Done", label: "Done", tint: "#43a47e" },
];
