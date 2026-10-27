export type HealthItem = {
  id: string;
  dueDate: string | null;
  completedAt: string | null;
  estimate?: number | null;
};

export type PortfolioHealth = {
  rules: {
    timezone: "UTC";
    overdue: string;
    forecast: string;
    exclusions: string;
  };
  scope: { total: number; bounded: boolean };
  progress: { completed: number; completionRate: number; remaining: number };
  schedule: { overdue: number; unscheduled: number; confidence: "HIGH" | "MEDIUM" | "LOW" };
  forecast: { remainingPoints: number; lowDays: number; highDays: number; confidence: "HIGH" | "MEDIUM" | "LOW" };
};

export function calculatePortfolioHealth(items: HealthItem[], now = new Date("2026-01-01T00:00:00.000Z")): PortfolioHealth {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const completed = items.filter((item) => item.completedAt !== null).length;
  const overdue = items.filter((item) => item.completedAt === null && item.dueDate !== null && Date.parse(item.dueDate) < today).length;
  const unscheduled = items.filter((item) => item.completedAt === null && item.dueDate === null).length;
  const remaining = items.length - completed;
  const remainingPoints = items.filter((item) => item.completedAt === null).reduce((sum, item) => sum + Math.max(0, item.estimate ?? 0), 0);
  const confidence = items.length === 0 || unscheduled / Math.max(1, remaining) > 0.25 ? "LOW" : overdue / Math.max(1, remaining) > 0.2 ? "MEDIUM" : "HIGH";
  const lowDays = Math.ceil(remainingPoints / 8);
  const highDays = Math.ceil(remainingPoints / 3) + unscheduled * 2;
  return {
    rules: {
      timezone: "UTC",
      overdue: "Incomplete items with a due date before the UTC day boundary are overdue.",
      forecast: "Remaining estimate points use 8 points/day as the optimistic rate and 3 points/day as the conservative rate; unestimated items add two conservative days each.",
      exclusions: "Archived and inaccessible work is excluded by the authenticated plan query.",
    },
    scope: { total: items.length, bounded: false },
    progress: { completed, completionRate: items.length ? Math.round((completed / items.length) * 100) : 0, remaining },
    schedule: { overdue, unscheduled, confidence },
    forecast: { remainingPoints, lowDays, highDays, confidence },
  };
}
