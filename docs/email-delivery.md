# Transactional email delivery

Planeo writes email deliveries to `EmailDelivery` in the same database transaction as invitations, password-reset tokens, and issue notifications. Web requests never wait for the provider. `email-worker` claims rows with `SKIP LOCKED`, supplies a stable idempotency key, retries temporary failures with bounded exponential backoff, and moves exhausted deliveries to `DEAD` for operator visibility.

## Development

`docker compose up` starts the worker and a local capture provider. Captured messages are available as JSON at `http://localhost:8025/messages`. Set `APP_URL` to the browser-visible Planeo origin.

Production can use either an HTTPS gateway or SMTP. For the gateway, set `EMAIL_PROVIDER_URL` to an HTTPS endpoint accepting the documented JSON payload and honoring the `Idempotency-Key` header. For SMTP, set `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM`; optional settings are `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, and the `SMTP_USERNAME`/`SMTP_PASSWORD` pair. SMTP is selected whenever `SMTP_HOST` is present. Keep deployment values in the environment or namespace Secret, never in the repository.

## Operations

Monitor counts by `status`, the age of the oldest `PENDING` row, retry volume, and worker `email.delivered`, `email.retry`, and `email.dead` events. Logs contain delivery and correlation IDs but never recipients, bodies, or action links. Investigate `DEAD` rows using `lastError`; after correcting the provider, requeue a delivery by changing its status to `PENDING`, resetting `availableAt`, and preserving its `dedupeKey`. Stale `PROCESSING` claims recover after ten minutes.

Account-security mail ignores marketing/notification preferences. Issue mail requires email notifications to be enabled, an active workspace membership, and current project authorization at enqueue time. The worker sends only the immutable, previously authorized payload.
