# Bulk issue operations

Clients submit an explicit selection of issue IDs and optimistic versions plus the originating query snapshot. Preview re-evaluates visibility and reports inaccessible or changed items. Execution requires an idempotency key and persists immutable per-item inputs before returning `202`.

The worker claims one operation with `SKIP LOCKED`, processes bounded batches of 50, and rechecks workspace/project roles, references, workflow availability, WIP limits, and versions for every issue. Results are independently committed, so partial success is explicit and successful items are never replayed. Pending operations may be cancelled; a CSV failure report is available from `GET /api/bulk-operations/:id?format=csv`.

One activity row and one realtime event are emitted per successful issue. A single summary audit event represents the operation; notification and automation storms are intentionally suppressed. Operators should run multiple workers for horizontal capacity and monitor pending age, failure counts, and processing duration.
