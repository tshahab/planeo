"use client";

import { useEffect, useState } from "react";

type Plan = { id: string; name: string };
type Snapshot = { id: string; capturedAt: string; report: Health };
type Health = { progress: { completionRate: number; remaining: number }; schedule: { overdue: number; confidence: string }; forecast: { lowDays: number; highDays: number } };

export function PortfolioHealthDirectory() {
  const [reports, setReports] = useState<Array<{ plan: Plan; health: Health; snapshots: Snapshot[] }>>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/plans").then((response) => response.json()).then(async (body) => {
      const plans = (body.plans ?? []) as Plan[];
      const values = await Promise.all(plans.map(async (plan) => { const [live, history] = await Promise.all([fetch(`/api/plans/${plan.id}/health`).then((response) => response.json()), fetch(`/api/plans/${plan.id}/health?history=true`).then((response) => response.json())]); return { plan, health: live.health, snapshots: history.snapshots ?? [] }; }));
      if (!cancelled) setReports(values.filter((value) => value.health));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  if (!reports.length) return null;
  return <section className="portfolio-health-directory" aria-labelledby="portfolio-health-heading"><header><h2 id="portfolio-health-heading">Portfolio health</h2><p>Authorized plans, calculated in UTC with documented forecast assumptions.</p></header><div className="dashboard-grid">{reports.map(({ plan, health, snapshots }) => <article className="dashboard-list" key={plan.id}><h3>{plan.name}</h3><p><strong>{health.progress.completionRate}% complete</strong> · {health.progress.remaining} remaining</p><dl><div><dt>Overdue</dt><dd>{health.schedule.overdue}</dd></div><div><dt>Confidence</dt><dd>{health.schedule.confidence}</dd></div><div><dt>Forecast</dt><dd>{health.forecast.lowDays}–{health.forecast.highDays} days</dd></div><div><dt>Saved snapshots</dt><dd>{snapshots.length}</dd></div></dl>{snapshots.length > 0 && <details><summary>Historical reports</summary><ul>{snapshots.slice(0, 5).map((snapshot) => <li key={snapshot.id}><a href={`/api/plans/${plan.id}/health?snapshot=${snapshot.id}`}>{new Date(snapshot.capturedAt).toLocaleString()}</a></li>)}</ul></details>}<a href={`/api/plans/${plan.id}/health?format=csv`}>Export health CSV</a></article>)}</div></section>;
}
