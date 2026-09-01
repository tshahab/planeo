# Audit log policy

Planeo records security-sensitive identity events and administrative workspace, membership, invitation, project, workflow, and archive mutations. Action names use the stable `<area>.<event>` form (for example `identity.login`, `workspace.member_removed`, or `workflow.status.update`). Each event identifies one workspace, the attributable actor when available, a target type and identifier, and minimal operational metadata.

Audit metadata must never contain passwords, password hashes, session cookies, authorization headers, invitation or reset tokens, attachment contents, or request bodies. The audit API applies recursive key-based redaction as a second boundary before returning metadata. Events have no update or delete application route and are immutable through normal product flows.

Audit rows receive a workspace-local sequence, previous hash, event hash, and key version in a database trigger, covering every application writer and concurrent transaction. Verification recomputes hashes and detects altered, missing, or reordered rows; verification and reads are themselves audited.

Audit events are retained for at least 180 days. Authorized exports run as asynchronous jobs, use sequence order, apply recursive redaction, encrypt payloads at rest with AES-256-GCM, and publish a schema-versioned manifest and plaintext SHA-256 checksum. Signed downloads expire with the job. Evidence reports combine access review, SSO/SCIM posture, privileged actions, retention/legal holds, integration token metadata, and per-workspace integrity results without exposing secrets.
