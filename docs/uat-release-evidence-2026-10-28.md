# UAT release evidence — 2026-10-28

Environment: `planeo` OpenShift namespace  
Route: `https://plan-uat.teknosys.ai`  
Release image tag: `planeo-23`  
Source commit: `cf9255e`  
Build image digest: `sha256:5276df94451fbd7551ca257892cd0a40012d3d9a256ab7626dea4aeec3656c3e`

## Verified

- Application and all six worker deployments are available at `1/1`.
- The migration Job completed successfully; 54 committed migrations were present and none remained pending.
- PostgreSQL runs as non-root UID/GID `70:70`, with privilege escalation disabled and all capabilities dropped. Its replacement pod became ready with zero restarts.
- UAT liveness and readiness returned HTTP 200, and HTTP redirected to HTTPS.
- Authenticated dashboard, goals, search, project navigation, dark mode, and desktop responsive integrity passed UI QA with no browser-console errors.
- The rebuilt unit/integration suite passed 60 test files and 153 tests.
- `SESSION_SECRET`, `WEBHOOK_ENCRYPTION_SECRET`, `ATTACHMENT_SIGNING_SECRET`, and `AUDIT_EXPORT_KEY` are present, meet the 32-character minimum, and do not match known development defaults. `APP_URL` is a canonical HTTPS origin.
- A read-only database check found zero identities using demo, `example.com`, or `planeo.local` email patterns.
- A read-only namespace backup was restored into an isolated disposable PostgreSQL recovery environment. The attachment archive was readable and the restored database passed the workspace query check.

## Restore drill

- Backup completion/RPO source: `2026-10-28T10:40:08Z`
- Drill completed: `2026-10-28T10:40:48Z`
- Measured recovery time: 5 seconds
- Result: passed
- Scope: UAT rehearsal only; this does not replace an encrypted, retained, off-host production backup.

## Remaining external evidence

- Production secret ownership and rotation dates.
- `EMAIL_PROVIDER_URL` is not configured in the runtime secret, so external email delivery cannot yet be verified.
- No `ServiceMonitor`, `PrometheusRule`, or other namespace alert-routing configuration was found.
- Retained off-host backup identifier and production restore record.
- Admin/member/viewer/portal smoke evidence for distinct accounts.
- Pilot onboarding/support record and the first 24-hour review.
- Seven-day and 30-day reliability, latency, adoption, support, and security measurements.

Go/no-go: UAT technical verification passed; production launch and post-launch milestone closure remain gated on the external and time-based evidence above.
