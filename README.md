# Ticketing

Ticketing is a planned multi-tenant project and issue-tracking application inspired by Jira, with a simpler, faster Kanban-first experience.

This product, including its requirements, design, implementation, tests, and documentation, is fully generated and maintained by AI under the engineering identity **Kiro**.

## Product documentation

- [Product requirements](docs/product-requirements.md)
- [Feature catalogue](docs/features.md)
- [Product and technical design](docs/design.md)
- [Delivery roadmap](docs/roadmap.md)
- [Security and production operations](docs/security-operations.md)

## Initial product direction

The first release is a responsive web application for small and medium-sized software teams. It will support workspaces, projects, issue tracking, Kanban boards, backlog management, lightweight sprints, collaboration, search, notifications, and role-based access.

The product will begin as a modular monolith. This keeps delivery fast while preserving clear boundaries for later extraction of search, notifications, files, and automation services.

## Local development with Docker

No Node.js packages need to be installed on the host. Application dependencies, the pnpm store, and PostgreSQL data live in Docker containers or named volumes.

```bash
docker compose up --build
```

Open `http://localhost:3000` after the application starts.

On first start, the app automatically applies committed migrations and seeds an idempotent Planeo demo workspace. Issue creation, status changes, backlog ordering, and sprint lifecycle history are persisted in the Docker-managed PostgreSQL volume.

Sign in with any seeded account—`mina@planeo.co`, `sam@planeo.co`, `alex@planeo.co`, or `noor@planeo.co`—using the development password `planeo-demo`. These credentials are a local Docker demo boundary: the production UI does not display them and the production login endpoint rejects the seeded demo password. Production deployments must run migrations without the development seed and use a unique `SESSION_SECRET`.

Useful commands:

```bash
docker compose run --rm app pnpm typecheck
docker compose run --rm app pnpm lint
docker compose run --rm app pnpm db:validate
docker compose run --rm app pnpm db:seed
docker compose down
```

Use `docker compose down -v` only when intentionally deleting the development database and all container-managed dependency volumes.

## Continuous integration

Every pull request and push to `main` runs a Docker-only verification build in GitHub Actions. The builder target validates the Prisma schema, runs ESLint, type-checks the application, and produces an optimized Next.js production build. The CI workflow installs no project packages directly on the runner host.

## Docker-only tests

The test database uses a disposable PostgreSQL `tmpfs`; fixtures use `test-` tenant slugs and unique user emails so runs are repeatable and isolated. No test command installs packages or writes package caches on the host.

```bash
docker compose -f compose.test.yaml run --rm tests
docker compose -f compose.test.yaml run --rm e2e
docker compose -f compose.test.yaml down --volumes
```

The first command runs the bounded unit and database integration suite. The second starts the test application automatically and runs Chromium onboarding and accessibility scenarios. Playwright writes concise failure artifacts to `test-results/` and `playwright-report/` for CI publication. Focus a suite with `docker compose -f compose.test.yaml run --rm tests pnpm test:unit` or `pnpm test:integration` after the service name.

Production-style Docker deployment, probes, structured logging, durable attachment storage, alerts, backup/restore drills, rollback, and maintenance are documented in [docs/security-operations.md](docs/security-operations.md).
