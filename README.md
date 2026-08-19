# Ticketing

Ticketing is a planned multi-tenant project and issue-tracking application inspired by Jira, with a simpler, faster Kanban-first experience.

This product, including its requirements, design, implementation, tests, and documentation, is fully generated and maintained by AI under the engineering identity **Kiro**.

## Product documentation

- [Product requirements](docs/product-requirements.md)
- [Feature catalogue](docs/features.md)
- [Product and technical design](docs/design.md)
- [Delivery roadmap](docs/roadmap.md)

## Initial product direction

The first release is a responsive web application for small and medium-sized software teams. It will support workspaces, projects, issue tracking, Kanban boards, backlog management, lightweight sprints, collaboration, search, notifications, and role-based access.

The product will begin as a modular monolith. This keeps delivery fast while preserving clear boundaries for later extraction of search, notifications, files, and automation services.

## Local development with Docker

No Node.js packages need to be installed on the host. Application dependencies, the pnpm store, and PostgreSQL data live in Docker containers or named volumes.

```bash
docker compose up --build
```

Open `http://localhost:3000` after the application starts.

On first start, the app automatically applies committed migrations and seeds an idempotent Planeo demo workspace. Issue creation and status changes are persisted in the Docker-managed PostgreSQL volume.

Sign in with any seeded account—`mina@planeo.co`, `sam@planeo.co`, `alex@planeo.co`, or `noor@planeo.co`—using the development password `planeo-demo`. Replace the Docker development `SESSION_SECRET` and remove demo credentials before any public deployment.

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
