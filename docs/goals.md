# Organizational goals

Workspace goals connect measurable outcomes to authorized issues, projects, releases, and portfolio plans. A goal has an owner, period, status, visibility, progress method, optional parent, and an archive lifecycle.

## Visibility and progress

Goal visibility is evaluated independently from linked-work access. Workspace goals are visible to members; private goals are visible only to their owner. Every linked target is authorized again for the viewer. Hidden targets are omitted before labels, counts, and progress are calculated, so their existence cannot be inferred from aggregates.

Manual progress is the rounded current-to-target ratio, capped at 100%. Work-derived progress expands visible links, deduplicates issue IDs across every source, and counts completed issues once. Plan links use the plan's project and query sources. Calculations are bounded to 1,000 issues per expanded source.

## Check-ins, concurrency, and hierarchy

Creation writes version 1 of the immutable check-in history. Each later check-in stores its own status, progress snapshot, author, note, timestamp, and sequential version. Goal edits and check-ins require the version last read; stale concurrent writes return `409`. Parent updates walk the visible ancestor chain and reject cycles.

## Operations and governance

- `GET/POST /api/goals` lists, searches, exports, and creates goals.
- `GET/PATCH /api/goals/:id` reads details or performs conflict-safe edits and archival.
- `GET/POST /api/goals/:id/links` reads visible links or adds an authorized target.
- `POST /api/goals/:id/check-ins` records a historical snapshot and notifies the owner when an administrator checks in for them.

Creates, edits, links, check-ins, and archives write audit events. Archival is non-destructive: goal history and links remain retained for governance and audit; there is no destructive deletion endpoint. Search, dashboard navigation, CSV export, stale-check-in signals, responsive layout, keyboard focus, and semantic status messaging use the same visibility rules.
