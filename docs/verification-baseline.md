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
- The OpenShift deployment manifest was reviewed. It defines the app, database, migration job, attachment volume, readiness/liveness probes, route, and runtime egress policy. It remains an untracked deployment artifact and must be intentionally added to version control before release.

## Blocked checks

Local `pnpm` verification could not start because project dependencies are not installed and the environment cannot resolve `registry.npmjs.org` (`ENOTFOUND`). Therefore typecheck, lint, unit/integration tests, and the Docker image build have not been claimed as passing. The Docker CI workflow remains the authoritative reproducible verification path once registry access is available.

## Required next run

From a network-enabled clean checkout, run:

```bash
docker build --target builder --tag planeo-ci:baseline .
docker compose -f compose.test.yaml run --rm tests
docker compose -f compose.test.yaml run --rm e2e
POSTGRES_PASSWORD=... SESSION_SECRET=... ATTACHMENT_SIGNING_SECRET=... \
  docker compose -f compose.staging.yaml up --build --abort-on-container-exit --exit-code-from smoke smoke
```

Record the image/tag, migration result, test counts, browser diagnostics, smoke output, and any flaky or known failures in the release evidence.
