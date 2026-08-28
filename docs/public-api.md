# Public API and webhooks

Planeo's public contract is under `/api/v1`; browser cookie endpoints are not part of it. Send a token as `Authorization: Bearer pln_…`. Workspace administrators create named tokens through `/api/integrations/tokens`, choose least-privilege scopes, and optionally set expiry. Secrets are shown only in create/rotate responses, stored as SHA-256 hashes, redacted from audit metadata, and immediately invalid after revocation or rotation.

Lists use opaque `cursor` and `limit` (1–100) and return `{ data, page: { limit, nextCursor } }`. Writes use structured errors, rate limits, optimistic `version` checks, and an `Idempotency-Key` for creates. Repeat keys return the stored response with `Idempotent-Replay: true`. Compatibility is additive within v1; breaking changes require `/api/v2` and migration notes.

Administrators create subscriptions at `/api/integrations/webhooks`. URLs must be public HTTPS endpoints; credentials, non-443 ports, localhost, private/link-local IPs, redirects, and unsafe DNS results are rejected and destinations are checked again before delivery. Secrets are encrypted at rest and revealed only on creation/rotation.

Each delivery includes `X-Planeo-Delivery`, `X-Planeo-Event`, `X-Planeo-Timestamp`, and `X-Planeo-Signature: v1=<hex>`. Verify HMAC-SHA256 over `<timestamp>.<raw request body>`, compare in constant time, reject timestamps older than five minutes, and deduplicate the delivery ID. Planeo retries with bounded exponential backoff, preserves per-subscription order where practical, and exposes the latest 50 redacted delivery diagnostics. See [openapi.yaml](openapi.yaml).
