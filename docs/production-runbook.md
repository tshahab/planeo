# Production runbook

This is the controlled operating checklist for staging and pilot production. Commands are run from a tagged checkout by the operations owner.

## Preflight

- Confirm the release tag, change record, approver, maintenance window, and rollback owner.
- Verify production-only secrets are present and rotated according to their owner’s policy.
- Run `pnpm production:validate` from the release image and retain its output in the release evidence.
- Verify `NODE_ENV=production`, `SESSION_SECRET` is unique, and development seed credentials are disabled.
- Confirm database, attachment storage, email, DNS/TLS, monitoring, backups, and support contact are reachable.
- Confirm the clean-checkout Docker verification baseline is green.

## Deploy and migrate

1. Build and publish the image from the approved tag.
2. Take and verify a pre-migration database backup.
3. Apply committed migrations with `pnpm db:deploy` from the application image.
4. Start the web process and all enabled workers with the production environment.
5. Check readiness, logs, database connectivity, and worker queue health.

Do not run `pnpm db:seed` in staging or production.

## Smoke checks

Run the health endpoint and then exercise signup/login, workspace/project access, issue creation and update, board movement, search, notifications, settings, attachment access, email outbox, and the enabled portal journey. Verify a second workspace cannot read or mutate the first workspace’s issue, attachment, notification, or project data.

## Rollback

For an S0/S1 defect, stop traffic or disable the affected integration, preserve logs and correlation IDs, and notify the release owner. Restore the prior image only when the migration is backward-compatible. If data or schema is affected, use the approved restore procedure and record RPO/RTO rather than improvising a destructive rollback.

## Incident evidence

Record the release tag, migration result, smoke results, backup identifiers, health metrics, worker failures, user impact, decision-maker, and timestamps. Link the record from the launch issue and retain it with the release artifacts.
