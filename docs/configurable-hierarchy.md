# Configurable planning hierarchy

Workspace owners and administrators can define stable, ordered levels above Epic. Archiving a level removes it from new assignments while preserving existing work and history; levels referenced by issues cannot be deleted. Existing issue types and parent relationships are unchanged by the migration.

Planning work uses an Epic issue type plus a `hierarchyLevelId`. Parent updates use `PUT /api/issues/{id}/hierarchy` with the current issue `version`. The service rejects stale writes, cycles, same/lower-level parents, inaccessible issues, and cross-project relationships unless the actor can edit both projects. Changes run in a serializable transaction and create issue activity and workspace audit records.

`GET /api/issues/{id}/hierarchy` returns breadcrumbs, visible children, and rollups. Every ancestor and child is independently filtered by workspace, accessible project, and issue-security predicates. Hidden work is excluded and is never represented by placeholder counts. Archiving a project or issue removes it from navigation and rollups; retention and deletion follow existing issue policies, with foreign-key restrictions preventing hierarchy-level deletion while referenced.
