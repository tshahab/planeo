# Sprint planning and capacity

Scrum projects may keep multiple deterministically ordered `PLANNED` sprints and exactly one `ACTIVE` sprint. Planned sprints support names, goals, dates, capacity targets, ordering, and deletion while empty. Every planning mutation includes the sprint `version`; stale versions return `409` so concurrent moves never silently overwrite one another. A database partial unique index independently enforces the one-active-sprint invariant.

The backlog exposes issue and estimate totals, capacity overruns, active dates, and board WIP-limit counts. Buttons provide keyboard and touch alternatives for sprint and issue ordering. On completion, unfinished work moves to the backlog by default or to a selected planned sprint. Planeo stores immutable issue, estimate, and completion snapshots plus aggregate totals; later issue edits therefore cannot rewrite completed-sprint history used by delivery reports.
