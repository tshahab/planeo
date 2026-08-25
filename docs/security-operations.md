# Security and production operations

## Required production configuration

- Generate `SESSION_SECRET` from at least 32 cryptographically random bytes. Never reuse the Docker development value.
- Terminate TLS before the application and preserve the original scheme and client IP forwarding headers.
- Keep PostgreSQL and attachment storage on private networks with encrypted, access-controlled volumes.
- Do not run the development seed command in production.

## Request protections

State-changing API requests made with a Planeo session cookie must include a same-origin `Origin` header. Authentication is limited to 10 attempts per client address per 15 minutes; other API writes are limited to 120 requests per address per minute. Rate-limit identifiers are SHA-256 hashed before storage.

Standard responses include HSTS, frame denial, MIME sniffing protection, a restrictive permissions policy, opener isolation, and a strict referrer policy.

## Secret rotation

1. Generate a replacement session secret in the deployment secret manager.
2. Schedule a maintenance window because rotating this secret invalidates every active session.
3. deploy the new value without writing it to source control, container images, or logs.
4. Confirm authentication and audit logging, then revoke the previous value.

## Backup and recovery

- Back up PostgreSQL and the attachment-storage volume together so database metadata and objects remain consistent.
- Encrypt backups, restrict restore permissions, and retain copies in a separate failure domain.
- Test restoration at least quarterly and record recovery-point and recovery-time results.
- Periodically remove expired rate-limit buckets and expired or revoked invitations as maintenance work.

## Pilot deployment and verification

Planeo's staging profile uses the production image, a migration job that must complete before startup, a durable PostgreSQL volume, and a separate durable attachment volume. Copy secrets from the deployment secret manager into the environment; never commit them.

```bash
export POSTGRES_PASSWORD='replace-with-a-random-value'
export SESSION_SECRET='replace-with-at-least-32-random-characters'
export ATTACHMENT_SIGNING_SECRET='replace-with-an-independent-random-value'
docker compose -f compose.staging.yaml up -d --build database migrate app
docker compose -f compose.staging.yaml run --rm smoke
```

`/api/health/live` proves that the process can serve HTTP without touching dependencies. `/api/health/ready` separately checks PostgreSQL and writable attachment storage, returns 503 on dependency failure, and never includes connection or filesystem details. Route the platform liveness and readiness probes accordingly.

For rollback, retain the previous immutable image tag, stop new traffic, restore the backup paired with that release when a migration is incompatible, redeploy the prior tag, and run the smoke service before restoring traffic. Never use `prisma migrate reset` in staging or production.

## Logs, monitoring, and pilot alerts

Application security and readiness events are newline-delimited JSON with a timestamp, severity, event name, and request ID. Authenticated operations can add workspace IDs, but must never log credentials, authorization headers, cookies, tokens, request bodies, or attachment contents. Forward stdout/stderr to the deployment log collector and configure the monitoring provider outside application code.

Essential pilot alerts:

- readiness unavailable for two consecutive minutes;
- HTTP 5xx rate above 2% for five minutes or any sustained authentication 5xx;
- p95 request latency above two seconds for ten minutes;
- PostgreSQL capacity above 80%, failed migration, or failed daily backup;
- attachment volume above 80% or repeated object read/write failures;
- no successful restore drill recorded within 90 days.

The `X-Request-Id` response header is safe to share with support and correlates user reports with JSON logs. Monitoring integrations should preserve it and the workspace ID while applying the same redaction rules tested in `tests/unit/observability.test.ts`.

## Backup, restore drill, and maintenance

Create a consistent pilot backup while database and attachment services are running:

```bash
sh ops/backup.sh backups/$(date -u +%Y%m%dT%H%M%SZ)
sh ops/restore-verify.sh backups/20260825T120000Z
```

The restore drill uses only disposable Docker services, restores PostgreSQL, verifies the workspace table, validates the attachment archive, tears the environment down, and writes `restore-result.txt` with the observed RPO source time and RTO seconds. Store the backup and result in an encrypted, access-controlled system outside the application host.

Run bounded cleanup after backup and during a low-traffic window:

```bash
docker compose -f compose.staging.yaml run --rm migrate pnpm maintenance
```

This expires pending invitations and removes expired rate-limit buckets, revoked/expired sessions, and consumed/expired password-reset records. Review the structured count output and alert on failure.
