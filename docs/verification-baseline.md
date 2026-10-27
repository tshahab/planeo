# Verification baseline

Baseline date: 2026-10-27  
Repository: `tshahab/planeo`  
Checkout: local `main`

## Offline checks completed

- Docker and Docker Compose are installed.
- `compose.test.yaml` renders successfully with required test secrets supplied.
- `compose.staging.yaml` renders successfully with required staging secrets supplied.
- `git diff --check` passes.
- The repository contains a committed Docker CI workflow covering build, database migration, unit/integration tests, browser/accessibility tests, staging migration, and smoke checks.
- The OpenShift deployment manifest is tracked and reviewed. It defines the app, database, migration job, attachment volume, readiness/liveness probes, route, and runtime egress policy.

## Verified checks

The Docker verification path is green on the current checkout:

- production builder image: built successfully with Prisma validation, ESLint, TypeScript, and Next.js production build;
- unit and integration suite: 57 test files and 141 tests passed;
- production-readiness controls: rejection and acceptance cases passed;
- focused portfolio health tests: passed;
- browser release smoke: passed in the focused release run.

The Vite config emits an existing `configLoader: native` warning, and the PostgreSQL driver emits a deprecation warning during concurrent test setup; neither causes a test failure.

## External gates still required

Local verification cannot prove the real staging or production exit criteria. The release owner must still provide a reachable OpenShift/staging cluster, production-only secret values, external database/storage/email/DNS/TLS/monitoring integrations, backup and restore evidence, pilot activity, and 7/30-day telemetry before closing the M3–M5 launch issues.

## Required next run

For a fresh checkout, run:

```bash
docker build --target builder --tag planeo-ci:baseline .
docker compose -f compose.test.yaml run --rm tests
docker compose -f compose.test.yaml run --rm e2e
POSTGRES_PASSWORD=... SESSION_SECRET=... ATTACHMENT_SIGNING_SECRET=... \
  docker compose -f compose.staging.yaml up --build --abort-on-container-exit --exit-code-from smoke smoke
```

Record the image/tag, migration result, test counts, browser diagnostics, smoke output, and any flaky or known failures in the release evidence. Do not treat these local checks as proof of external staging or production readiness.
