# Launch and post-launch evidence checklist

This checklist is intentionally evidence-based. A checkbox is complete only when its artifact, timestamp, owner, and result are recorded in the release record.

## M4 — Production launch

- [ ] Approved release tag and image digest recorded.
- [ ] Production-only secrets verified; rotation owners and next rotation dates recorded.
- [ ] No development seed data or demo credentials present in the production database.
- [ ] Database migration output and pre-migration backup identifier recorded.
- [ ] Attachment storage read/write and signed-download checks passed.
- [ ] Email delivery test passed and provider response recorded.
- [ ] DNS/TLS, readiness, liveness, error reporting, and alert routing verified.
- [ ] Email, webhook, automation, bulk, chat, and SLA workers started successfully; worker queue status output has no unexpected dead letters.
- [ ] Admin, member, viewer, and enabled portal smoke journeys passed.
- [ ] Backup, restore, rollback, and support paths confirmed.
- [ ] Restore drill records the backup completion timestamp, restore result, measured RPO source, and RTO seconds.
- [ ] Pilot users onboarded with support instructions and incident contact.
- [ ] First 24-hour review records errors, latency, queue depth, failed deliveries, backups, and user-impacting incidents.

## M5 — Post-launch stabilization

At day 7 and day 30, record the measurement window, query version, timezone, sample size, exclusions, and owner for:

- availability and readiness failures;
- p50/p95 request latency for core journeys;
- error rate and top correlated failures;
- email, webhook, automation, bulk, chat, and SLA worker success/retry/dead-letter counts;
- backup completion and restore evidence;
- active pilot workspaces, users, issues, and core journey adoption;
- support volume, severity, time to acknowledge, and time to resolve;
- security findings, tenant-isolation findings, and unresolved launch risks.

The review must classify each finding as resolved, accepted with an owner/date, or a release blocker. The resulting next milestone must cite the evidence that drove its priority.

## Evidence record

```text
release/tag:
review window:
environment:
owner:
go/no-go:
backup id:
backup completed at:
restore result:
rpo source:
rto seconds:
image digest:
test report:
smoke report:
monitoring report:
open S0/S1 issues:
accepted risks and owners:
next milestone:
```
