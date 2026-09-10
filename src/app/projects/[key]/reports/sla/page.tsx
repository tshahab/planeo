import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { slaReport } from "@/lib/sla-report";
export default async function SlaReportPage({ params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) redirect("/login");
  const report = await slaReport(context, (await params).key).catch(() => null); if (!report) notFound();
  return <main className="portal-page"><header><strong>{report.project.name}</strong><nav><Link href={`/projects/${report.project.key}/queues`}>Agent queues</Link></nav></header><section className="service-queues"><h1>SLA report</h1><p>Cycles started in the last {report.days} days. Counts include only requests you can currently view. Historical versions are reported separately.</p><div className="queue-table" tabIndex={0} role="region" aria-label="SLA report"><table><thead><tr>{["Goal", "Version", "Metric", "Cycles", "Met", "Breached", "Active"].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{report.rows.map(row => <tr key={`${row.goal}:${row.version}`}><th scope="row">{row.goal}</th><td>{row.version}</td><td>{row.metric}</td><td>{row.cycles}</td><td>{row.met}</td><td>{row.breached}</td><td>{row.active}</td></tr>)}</tbody></table></div>{!report.rows.length && <p>No SLA cycles in this reporting window.</p>}</section></main>;
}
