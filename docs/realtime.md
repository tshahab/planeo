# Real-time transport

Planeo uses a tenant-aware server-sent-event abstraction backed by a committed PostgreSQL event table. Writers insert events in the same transaction as domain changes, so subscribers never observe rolled-back work. Each stream re-evaluates accessible projects, filters user-specific notifications, sends at most 100 events per batch, emits heartbeats, and closes after a bounded interval so infrastructure can reclaim resources.

Browsers resume with `Last-Event-ID`. Events are retained for 24 hours; an older cursor receives a `reset` instruction and clients fetch canonical state. Event IDs make duplicate delivery harmless. When streaming is unavailable, the UI uses a bounded 15-second refresh and exponential reconnect backoff.

For horizontal scaling, all application instances read the shared event table; PostgreSQL `LISTEN/NOTIFY` or a managed broker may later replace polling behind the same cursor contract. Operators should prune events older than retention, monitor stream counts and lag, disable proxy buffering, and enforce connection limits. Payloads contain resource IDs and safe version metadata only—never credentials, private audit payloads, or presence details.
