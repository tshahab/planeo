# Audit log policy

Planeo records security-sensitive identity events and administrative workspace, membership, invitation, project, workflow, and archive mutations. Action names use the stable `<area>.<event>` form (for example `identity.login`, `workspace.member_removed`, or `workflow.status.update`). Each event identifies one workspace, the attributable actor when available, a target type and identifier, and minimal operational metadata.

Audit metadata must never contain passwords, password hashes, session cookies, authorization headers, invitation or reset tokens, attachment contents, or request bodies. The audit API applies recursive key-based redaction as a second boundary before returning metadata. Events have no update or delete application route and are immutable through normal product flows.

For the pilot, retain audit events for at least 180 days. Exports are intentionally deferred; database administrators may produce a tenant-scoped export using `workspaceId`, preserving the deterministic `createdAt DESC, id DESC` order and applying the same redaction policy. Any future retention deletion or export capability must be separately authorized and itself audited.
