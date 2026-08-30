# Slack and Microsoft Teams integrations

Workspace administrators create provider-neutral channel mappings through `/api/integrations/chat`. Incoming-webhook endpoints are encrypted at rest and returned only as a non-reversible fingerprint. A mapping to a private project is explicit; the durable enqueue query only matches the originating project, preventing private content from leaking into unrelated channels.

Deliveries use the Release 1.1 outbox pattern with unique connection/event IDs, bounded exponential retries, provider `Retry-After` support, diagnostic status codes, and redacted errors. Disabling or revoking a connection prevents new outbox rows and makes the worker stop queued delivery. Rotation replaces the encrypted endpoint without displaying it. Messages contain concise authorized Planeo links and either minimal or standard detail.

Automated validation uses `chat-provider-test`, a local Slack/Teams simulator that checks delivery identity and signatures, returns a synthetic rate limit, and deduplicates idempotency keys. Real provider credentials are never required for tests.
