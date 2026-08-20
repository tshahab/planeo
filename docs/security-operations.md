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
