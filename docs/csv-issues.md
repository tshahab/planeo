# Issue CSV import and export

Download a template with `GET /api/projects/{key}/issues/csv?format=template` and export the project with the same endpoint without `format`. Export accepts `q`, `status`, `assignee`, and `label` filters. Values that spreadsheet programs could interpret as formulas are prefixed safely.

The stable columns are `externalId,summary,description,type,status,priority,assigneeEmail,labels,estimate,dueDate,parentExternalId,links`. UTF-8 and RFC-style doubled quotes are supported. Labels and related external IDs use semicolons. Parent and link references must identify rows in the same import; imports never resolve objects across projects or workspaces.

Send JSON to the endpoint with `csv`, `idempotencyKey`, and `dryRun: true` first. A valid preview returns its row count and SHA-256 digest. Send the same document with `dryRun: false` to execute. Planeo validates the entire bounded document before opening one transaction; any error returns row, field, and message and nothing is imported. Repeating an executed idempotency key returns the original import without duplicating issues. Project administrators can import; authorized non-viewers can export. Audit metadata records counts and digests, never file contents.
