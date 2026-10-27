# Pilot launch contract

Status: approved for implementation review  
Owner: product and engineering lead  
Last reviewed: 2026-10-27

This document freezes the first Planeo pilot release. Any change to the pilot scope, acceptance criteria, or rollback authority requires an explicit review by the release owner.

## Pilot audience and supported journeys

The pilot is for small software/product teams managing internal work. The pilot personas are:

- workspace owner or administrator;
- project administrator;
- project member;
- viewer; and
- customer portal user only where the portal is explicitly enabled for the pilot workspace.

The supported journeys are signup and login, workspace and project creation, member administration, issue create/read/update/archive/restore, board and backlog planning, one active sprint, search and saved filters, notifications, audit and settings views, and the enabled customer portal journey.

## Explicit non-goals

Native mobile apps, billing, marketplace extensions, full Jira parity, advanced portfolio planning, AI-generated changes, SAML/SCIM provisioning, and production use of development seed accounts are outside the pilot unless separately approved.

## Release acceptance criteria

The release owner may approve launch only when all of the following are true:

1. A clean checkout builds with the pinned package manager and the Docker verification matrix is green.
2. Database migrations apply to an empty production-like database without running development seed data.
3. Admin, member, project user, viewer, and enabled portal smoke journeys pass, including authorization failures and tenant-boundary checks.
4. Login, issue CRUD, board/backlog/sprint, search, notifications, settings, attachments, email outbox, and worker health checks pass for the enabled scope.
5. Accessibility checks have no serious or critical violations on the pilot routes, and keyboard/mobile review has no release-blocking defect.
6. Backups, restore verification, monitoring, alerting, support contact, and rollback steps have been rehearsed.
7. No production credential, demo password, local seed data, or private environment file is committed.

## Severity and response

| Severity | Definition | Pilot response |
| --- | --- | --- |
| S0 | Data loss, cross-tenant exposure, credential compromise, or unsafe migration | Stop rollout; page release owner immediately; rollback or disable affected path |
| S1 | Core journey unavailable or materially corrupting work for most users | Stop rollout; mitigate within 1 hour; rollback if no safe mitigation |
| S2 | Important workflow degraded with a documented workaround | Triage same business day; fix or schedule before pilot expansion |
| S3 | Cosmetic, copy, or minor usability issue | Record and prioritize with normal product work |

## Ownership and authority

The release owner is the engineering lead unless a release record names a replacement. The product owner approves scope and non-goals. The operations owner controls deployment, backups, migrations, monitoring, and rollback. The support owner handles pilot communication and user escalation. The release owner has final go/no-go and rollback authority; an S0 or S1 incident may be rolled back by the operations owner immediately, with notification afterward.

## External services and configuration contract

The deployment must provide these values through the platform secret/configuration store, never through git:

| Capability | Required configuration | Owner |
| --- | --- | --- |
| Host/cluster and DNS/TLS | `APP_URL`, ingress/domain, certificate automation | Operations |
| PostgreSQL | `DATABASE_URL` and backup destination | Operations |
| Sessions | `SESSION_SECRET` | Engineering/Operations |
| Email | provider credentials, sender, and `EMAIL_*` settings | Operations |
| Attachments | `ATTACHMENTS_ROOT` or object-storage credentials | Operations |
| Audit exports | `AUDIT_EXPORT_KEY` | Engineering/Operations |
| Monitoring/error tracking | `OTEL_*` or approved monitoring settings | Engineering/Operations |
| Support | published support address and incident channel | Product/Support |

Production must reject missing or development-only secrets and must run migrations without the development seed. The release preflight is executable as `pnpm production:validate`.

## Linked operating documents

- [Production runbook](production-runbook.md)
- [Security and production operations](security-operations.md)
- [Product requirements](product-requirements.md)
- [Delivery roadmap](roadmap.md)
