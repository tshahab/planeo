# Transactional email delivery

Planeo writes email deliveries to `EmailDelivery` in the same database transaction as invitations, password-reset tokens, and issue notifications. Web requests never wait for the provider. `email-worker` claims rows with `SKIP LOCKED`, supplies a stable idempotency key, retries temporary failures with bounded exponential backoff, and moves exhausted deliveries to `DEAD` for operator visibility.

## Development

`docker compose up` starts the worker and a local capture provider. Captured messages are available as JSON at `http://localhost:8025/messages`. Set `APP_URL` to the browser-visible Planeo origin. Production must set `EMAIL_PROVIDER_URL` to an HTTPS endpoint accepting the documented JSON payload and honoring the `Idempotency-Key` header.

## Operations

Monitor counts by `status`, the age of the oldest `PENDING` row, retry volume, and worker `email.delivered`, `email.retry`, and `email.dead` events. Logs contain delivery and correlation IDs but never recipients, bodies, or action links. Investigate `DEAD` rows using `lastError`; after correcting the provider, requeue a delivery by changing its status to `PENDING`, resetting `availableAt`, and preserving its `dedupeKey`. Stale `PROCESSING` claims recover after ten minutes.

Account-security mail ignores marketing/notification preferences. Issue mail requires email notifications to be enabled, an active workspace membership, and current project authorization at enqueue time. The worker sends only the immutable, previously authorized payload.
