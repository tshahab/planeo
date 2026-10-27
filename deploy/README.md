# OpenShift deployment

The manifest is intentionally secret-free. Create `planeo-runtime` in the `planeo` namespace through the cluster secret manager; do not commit a Secret object or literal values.

## Required secret keys

The secret must contain:

- `DATABASE_URL` — PostgreSQL connection string for the migration job and application;
- `POSTGRES_PASSWORD` — database bootstrap password used by the PostgreSQL container;
- `SESSION_SECRET` — at least 32 random characters and never the development value;
- `ATTACHMENT_SIGNING_SECRET` — at least 32 independent random characters;
- `AUDIT_EXPORT_KEY` — at least 32 independent random characters;
- `APP_URL` — the HTTPS public application URL;
- provider and integration keys required by enabled workers.

The application deployment imports the complete secret with `envFrom`; the migration job receives only `DATABASE_URL` so migrations cannot accidentally use application-only credentials.

## Controlled rollout

1. Build and tag the image from the approved release checkout.
2. Update the ImageStream tag and wait for the image to become available.
3. Render the deployable manifest with `RELEASE_TAG=2026.10.27.1 pnpm release:render`. The renderer rejects `latest` and unresolved image placeholders; do not apply a release until the rendered manifest contains the approved tag or digest.
4. Apply the manifest and wait for the PostgreSQL readiness probe.
5. Run the migration Job and confirm it completes successfully.
6. Roll the application deployment and verify `/api/health/live` and `/api/health/ready`.
7. Run the smoke journey and inspect application and worker logs before routing traffic.

Never run the development seed in this namespace. Retain the previous image tag, migration output, backup identifier, smoke result, and go/no-go decision as release evidence. For rollback, follow [the production runbook](../docs/production-runbook.md).
