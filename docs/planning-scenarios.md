# Planning scenarios and controlled publishing

Scenarios belong to a portfolio plan and provide a copy-on-write workspace for scheduling and staffing alternatives. Saving a proposal records the source issue version, an immutable base snapshot, and a validated patch; it never updates the live issue.

## Changes and comparisons

Supported proposals cover due dates, assignments, hierarchy, estimates, dependencies, and team/week capacity allocations. Every source issue, parent, dependency, team, and plan is tenant-scoped and authorization-checked. Shared scenarios expose only changes whose source work is still visible to the viewer. Comparisons and exports omit inaccessible work rather than exposing names or aggregate counts.

Named baselines store the visible source snapshot plus scenario changes at capture time. They are immutable and remain reproducible when live issues, plan configuration, dependencies, or allocations later change.

## Publishing and conflicts

Publishing requires plan ownership or workspace administration and an explicit list of selected change IDs. Before writing, the service re-authorizes each source and compares its current version with the stored base version. Inaccessible and stale changes become explicit `NOT_AUTHORIZED` or `SOURCE_CHANGED` conflicts. Valid selections are applied in one database transaction; a write-time race aborts the transaction with `409` rather than losing data.

Each publish record stores requested, applied, and conflicting changes plus the prior live values required for rollback tooling. The status is `COMPLETED`, `PARTIAL`, or `CONFLICTED`. Scenario creation, cloning, edits, baselines, publishes, sharing, and archival are audited.

## Lifecycle and API

- `GET/POST /api/plans/:planId/scenarios` lists, creates, or clones scenarios.
- `GET/PATCH /api/plans/:planId/scenarios/:scenarioId` reads, exports, shares, renames, or archives a scenario.
- `POST .../changes` saves an optimistic copy-on-write proposal.
- `POST .../baselines` captures an immutable named baseline.
- `POST .../publish` publishes a granular selection and returns conflicts.

Archival is non-destructive and retains changes, baselines, publish records, rollback snapshots, and audit evidence. No destructive scenario deletion endpoint is exposed; future deletion policy must preserve governance records.
