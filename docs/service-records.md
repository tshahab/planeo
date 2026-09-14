# Service records

Service records are tenant-scoped by both `workspaceId` and `projectId`. Incident, problem, and change records use the same permission checks as project issues. Change approval is a distinct action: the record author cannot approve their own change; successful approvals record the approver and UTC timestamp in the record details. APIs must never resolve records outside the authenticated workspace.
