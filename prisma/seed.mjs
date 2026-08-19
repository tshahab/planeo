import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const users = [
  ["mina@planeo.co", "Mina Park"], ["sam@planeo.co", "Sam Reed"],
  ["alex@planeo.co", "Alex Chen"], ["noor@planeo.co", "Noor Malik"],
];

const issueSeeds = [
  [142, "Checkout fails when coupon is removed", "Customers see a stale total after removing an applied coupon. Recalculate the order and keep the payment intent in sync.", "BUG", "TODO", "URGENT", "sam@planeo.co", 3],
  [139, "Add saved payment methods", "Let returning customers select a previously saved payment method during checkout.", "STORY", "TODO", "HIGH", "mina@planeo.co", 5],
  [136, "Empty state for new workspaces", "Design a helpful first-run state that guides owners to create a project and invite their team.", "TASK", "TODO", "MEDIUM", "alex@planeo.co", 2],
  [138, "Redesign profile preferences", "Simplify personal settings and separate account security from workspace preferences.", "STORY", "IN_PROGRESS", "HIGH", "alex@planeo.co", 5],
  [134, "Improve search result ranking", "Rank exact issue-key matches first, followed by title and description matches.", "TASK", "IN_PROGRESS", "MEDIUM", "noor@planeo.co", 3],
  [131, "Add API contract tests", "Cover the project and issue endpoints with stable request and response contract tests.", "TASK", "IN_REVIEW", "MEDIUM", "sam@planeo.co", 3],
  [126, "Keyboard controls for board", "Provide accessible move commands and clear focus handling for every issue card.", "STORY", "IN_REVIEW", "HIGH", "mina@planeo.co", 5],
  [121, "Workspace member invitations", "Invite members by email, select their initial role, and show pending invitations.", "STORY", "DONE", "HIGH", "noor@planeo.co", 5],
  [118, "Project creation flow", "Create a project from a sensible template with a validated key and clear defaults.", "STORY", "DONE", "MEDIUM", "sam@planeo.co", 3],
];

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function main() {
  const workspace = await prisma.workspace.upsert({ where: { slug: "planeo" }, update: {}, create: { name: "Planeo", slug: "planeo" } });
  const createdUsers = new Map();
  for (const [email, name] of users) {
    const passwordHash = hashPassword("planeo-demo");
    const user = await prisma.user.upsert({ where: { email }, update: { name, passwordHash }, create: { email, name, passwordHash } });
    createdUsers.set(email, user);
    await prisma.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } }, update: {}, create: { workspaceId: workspace.id, userId: user.id, role: email === "mina@planeo.co" ? "OWNER" : "MEMBER" } });
  }
  const project = await prisma.project.upsert({
    where: { workspaceId_key: { workspaceId: workspace.id, key: "WEB" } },
    update: {},
    create: { workspaceId: workspace.id, name: "Website redesign", key: "WEB", description: "Plan, build, and ship the new customer experience.", template: "SCRUM", issueSequence: 142 },
  });
  for (const user of createdUsers.values()) await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: user.id } }, update: {}, create: { projectId: project.id, userId: user.id, role: user.email === "mina@planeo.co" ? "ADMIN" : "MEMBER" } });

  const typeNames = { EPIC: "Epic", STORY: "Story", TASK: "Task", BUG: "Bug", SUBTASK: "Subtask" };
  const issueTypes = new Map();
  let position = 0;
  for (const [kind, name] of Object.entries(typeNames)) {
    const value = await prisma.issueType.upsert({ where: { projectId_name: { projectId: project.id, name } }, update: {}, create: { projectId: project.id, name, kind, position: position++ } });
    issueTypes.set(kind, value);
  }
  const statusSeeds = [["TODO", "To do", "TODO", "#8a93a3"], ["IN_PROGRESS", "In progress", "IN_PROGRESS", "#5a72d8"], ["IN_REVIEW", "In review", "IN_PROGRESS", "#a16bc0"], ["DONE", "Done", "DONE", "#43a47e"]];
  const statuses = new Map();
  for (const [index, [key, name, category, color]] of statusSeeds.entries()) {
    const value = await prisma.status.upsert({ where: { projectId_name: { projectId: project.id, name } }, update: { position: index }, create: { projectId: project.id, name, category, color, position: index } });
    statuses.set(key, value);
  }
  let board = await prisma.board.findFirst({ where: { projectId: project.id, name: "Main board" } });
  if (!board) board = await prisma.board.create({ data: { projectId: project.id, name: "Main board" } });
  for (const [index, [key, name]] of statusSeeds.entries()) await prisma.boardColumn.upsert({ where: { boardId_statusId: { boardId: board.id, statusId: statuses.get(key).id } }, update: { position: index }, create: { boardId: board.id, statusId: statuses.get(key).id, name, position: index } });

  const reporter = createdUsers.get("mina@planeo.co");
  for (const [number, summary, description, kind, statusKey, priority, email, estimate] of issueSeeds) {
    await prisma.issue.upsert({
      where: { projectId_number: { projectId: project.id, number } }, update: {},
      create: { workspaceId: workspace.id, projectId: project.id, number, issueTypeId: issueTypes.get(kind).id, statusId: statuses.get(statusKey).id, reporterId: reporter.id, assigneeId: createdUsers.get(email).id, summary, description, priority, estimate, rank: `a${String(number).padStart(5, "0")}` },
    });
  }
}

main().then(() => console.log("Seeded Planeo demo workspace.")).finally(() => prisma.$disconnect());
