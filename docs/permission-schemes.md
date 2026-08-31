# Permission schemes and issue security

Planeo evaluates project capabilities server-side through `src/lib/permissions.ts`. Projects without an assigned scheme use the migration-compatible legacy policy; assigning an immutable scheme version switches the project to explicit, deny-by-default grants. Creating a new version never mutates an active version, and assigning an older version is the rollback path.

Issue security levels may grant access to the reporter, assignee, workspace or project roles, organization groups, and named active workspace users. Restricted issues are filtered before counts and records are returned. Unauthorized direct access uses the same not-found response as a missing issue.

Administrators can preview an actor's effective decision through `GET /api/projects/{key}/permission-scheme?explain=issue.view`. Scheme creation/versioning, assignment, security-level creation, and issue-level changes are audited.
