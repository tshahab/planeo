# Service projects and request types

Service projects use the `SERVICE` project template. They retain Planeo's normal issue, workflow, permission, audit, automation, search, and reporting behavior while adding a customer-safe request record.

## Form lifecycle

Project administrators manage portal groups and request-type drafts under `/api/projects/{key}`. A draft maps to an issue type and initial workflow status in the same project. Publishing creates an immutable `ServiceRequestTypeVersion`; editing the draft never changes an existing published form or historical request.

Only fields explicitly present in `schema.fields` are returned from `/api/service/forms/{id}` or accepted by the submission endpoint. Supported standard field kinds are `summary`, `description`, `priority`, and `attachment`; `custom` fields reference stable custom-field IDs that must be active in the same workspace and project. Each field supports a customer label, help text, required flag, default, allow-listed options, string validation, position, and equality-based conditional visibility. Agent-only fields, assignee data, workflow internals, audit data, and inactive custom fields are never inferred into a portal schema.

Publishing requires a summary field. Incomplete drafts may still be saved and previewed. Archiving prevents new form reads and submissions without deleting versions or historical renderings.

## Submission transaction

`POST /api/service/forms/{id}/submissions` re-resolves the current published version and project permission, rejects unknown fields, applies conditional visibility and server validation, validates explicitly published custom fields, and creates the issue, custom values, immutable service-request snapshot, history, audit event, webhook, automation event, and realtime event in one database transaction. A failed validation creates no issue.

The stored `renderedSchema` and `requestTypeVersionId` are the source of truth for historical rendering. Agent-only required custom fields are intentionally completed during triage rather than exposed to customers.

## Authorization and filtering

Drafts, version history, preview, portal grouping, mapping, publishing, and archiving require `project.admin`. Published forms and submission require `issue.create`; denials use the same not-found response as a missing form. Every lookup includes the authenticated workspace boundary.

Issues can be filtered by request type through `requestTypeId` on the project issue API and `requestType` on workspace search and saved filters. Request-type IDs are validated against accessible projects before a saved filter is accepted.

The current authenticated form page is `/service/forms/{requestTypeId}`. Uploads are tenant-, project-, request-type-, and user-bound, expire after one hour, and are claimed at most once in the issue transaction. Dedicated portal customer identities, branding, sharing, comments, and notifications are introduced by #75.
