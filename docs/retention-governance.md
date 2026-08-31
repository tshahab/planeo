# Retention, legal holds, and governed deletion

Organization administrators configure retention independently for issues, comments, attachments, notifications, realtime events, integration deliveries, automation history, and audit events. Audit retention cannot be shorter than 180 days.

Deletion is deliberately two-phase: discovery stores a sorted candidate set and SHA-256 preview digest; approval must echo that digest; execution rechecks active legal holds and deletes only the originally previewed, still-eligible intersection. Retries are idempotent, and completion stores counts plus a tamper-evident evidence digest. Legal holds may cover an organization, workspace, project, issue, or user. Hold events are append-only; release never edits prior history.

Schedulers call the deletion-job preview endpoint for each enabled policy, leaving every discovered job in `PREVIEWED` state until an organization administrator explicitly approves it. Workers may retry the execute action; completed jobs return their original evidence without deleting again.

Attachment deletion removes the storage object before its database row. Issue deletion is limited to already archived issues and uses declared foreign-key behavior. User anonymization preserves operational foreign keys while replacing personal profile data.

Backups are immutable snapshots: deletion does not rewrite an existing backup. Operators must expire backup media on its documented schedule. Restoring an older backup temporarily restores its snapshot state; governed deletion jobs must be replayed before serving traffic, while active holds remain authoritative.
