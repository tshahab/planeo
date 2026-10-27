"use client";

import { useEffect, useState } from "react";

type Plan = { id: string; name: string };
type Health = { progress: { completionRate: number; remaining: number }; schedule: { overdue: number; confidence: string }; forecast: { lowDays: number; highDays: number } };

export function PortfolioHealthDirectory() {
  const [reports, setReports] = useState<Array<{ plan: Plan; health: Health }>>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/plans").then((response) => response.json()).then(async (body) => {
      const plans = (body.plans ?? []) as Plan[];
      const values = await Promise.all(plans.map(async (plan) => ({ plan, ...(await fetch(`/api/plans/${plan.id}/health`).then((response) => response.json())) })));
      if (!cancelled) setReports(values.filter((value) => value.health));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  if (!reports.length) return null;
  return <section className="portfolio-health-directory" aria-labelledby="portfolio-health-heading"><header><h2 id="portfolio-health-heading">Portfolio health</h2><p>Authorized plans, calculated in UTC with documented forecast assumptions.</p></header><div className="dashboard-grid">{reports.map(({ plan, health }) => <article className="dashboard-list" key={plan.id}><h3>{plan.name}</h3><p><strong>{health.progress.completionRate}% complete</strong> · {health.progress.remaining} remaining</p><dl><div><dt>Overdue</dt><dd>{health.schedule.overdue}</dd></div><div><dt>Confidence</dt><dd>{health.schedule.confidence}</dd></div><div><dt>Forecast</dt><dd>{health.forecast.lowDays}–{health.forecast.highDays} days</dd></div></dl><a href={`/api/plans/${plan.id}/health?format=csv`}>Export health CSV</a></article>)}</div></section>;
}
