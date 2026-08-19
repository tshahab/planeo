# Delivery Roadmap

## Delivery assumptions

- One initial deployment environment plus staging and production before pilot
- Kanban-first MVP with lightweight Scrum support
- Responsive web application, not native mobile
- Managed PostgreSQL, authentication, and object storage
- Product decisions and required credentials are provided without long external delays

Estimates below describe focused implementation effort with AI-assisted development. Calendar time can increase because of product review, usability testing, external service setup, security review, and pilot feedback.

## Phase 0 — Requirements and validation

**Target:** 1–2 days

- Validate target customer and primary workflows
- Resolve open decisions in the PRD
- Confirm MVP boundaries and acceptance criteria
- Create sitemap, low-fidelity flows, and clickable core prototype
- Confirm stack, hosting, identity, email, and storage providers

**Exit:** Product scope and core designs are approved for implementation.

## Phase 1 — Foundation

**Target:** 1–2 days

- Scaffold application, quality tooling, and continuous integration
- Establish database schema and migrations
- Implement authentication and session protection
- Implement workspace creation, membership, and project shell
- Establish authorization and tenant-isolation test patterns
- Add baseline logging and error monitoring

**Exit:** A user can securely enter a workspace and create/open a project.

## Phase 2 — Issue tracking

**Target:** 2–3 days

- Issue types, statuses, priorities, and issue keys
- Create, read, update, archive, and restore issues
- Subtasks, labels, estimates, assignees, and due dates
- Comments, activity history, watchers, and attachments
- Issue detail page/drawer and creation dialog

**Exit:** A team can manage issues through a complete lifecycle with reliable history.

## Phase 3 — Board and backlog

**Target:** 2–3 days

- Kanban board and columns
- Drag-and-drop plus accessible move controls
- Stable ranking and conflict recovery
- Board filters and issue drawer integration
- Ranked backlog and lightweight sprint lifecycle

**Exit:** A team can visually plan, prioritize, and execute work.

## Phase 4 — Search, notifications, and dashboard

**Target:** 1–2 days

- Keyword and structured issue search
- Saved filters and URL-preserved filter state
- In-app notification inbox
- Assignment, mention, comment, and watcher events
- Personal and project dashboard summaries

**Exit:** Users can find relevant work and understand changes requiring attention.

## Phase 5 — Administration and hardening

**Target:** 2–3 days

- Member and project administration
- Status and column configuration
- Audit log viewer
- Loading, empty, validation, and recovery states
- Responsive and accessibility pass
- Security, performance, backup, and migration validation
- Automated end-to-end coverage and deployment documentation

**Exit:** The application satisfies MVP acceptance criteria and is ready for a controlled pilot.

## Overall planning range

| Milestone | Focused effort |
|---|---:|
| Requirements and clickable design | 1–2 days |
| Functional local MVP | 6–10 days |
| Hardened pilot release | 10–15 days total |
| Production v1 after pilot feedback | 3–6 weeks total |

The earlier 4–7 day range remains possible for a demo with narrower behavior and less hardening. The 10–15 day range is safer for an MVP that includes authorization tests, failure states, accessibility, observability, and deployment readiness.

## Post-MVP sequence

### Release 1.1

- Email notifications
- CSV import/export
- WIP limits and multiple future sprints
- Burndown, velocity, and cumulative-flow reports
- Release/version planning
- Public API and webhooks

### Release 1.2

- Custom fields and richer workflow configuration
- Automation rules
- GitHub/GitLab development information
- Slack/Teams integration
- Dark theme and deeper dashboard customization

### Enterprise and service expansion

- SAML SSO and automated provisioning
- Advanced audit, retention, and compliance controls
- Issue-level security and advanced permission schemes
- Customer portal, queues, SLAs, knowledge base, and incident workflows

## Immediate approval checklist

Before implementation begins, confirm:

- Target users are software/product teams rather than a customer support desk.
- The MVP is Kanban-first with one active sprint per project.
- Web-only delivery is acceptable.
- Workspace administrators may see all projects, including private projects.
- The initial roles and permission matrix are sufficient.
- Preferred identity, hosting, email, and file-storage providers.
- Whether the pilot requires email notifications and CSV migration on day one.

