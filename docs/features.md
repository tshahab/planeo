# Feature Catalogue

## Priority definitions

- **P0:** Required for the MVP pilot
- **P1:** Important immediately after MVP
- **P2:** Later product expansion

## Feature matrix

| Area | Feature | Priority | Release |
|---|---|---:|---|
| Identity | Sign up, sign in, sign out, recovery | P0 | MVP |
| Identity | Profile and notification preferences | P0 | MVP |
| Workspace | Workspace creation and settings | P0 | MVP |
| Workspace | Member invitations and role assignment | P0 | MVP |
| Workspace | Member deactivation and removal | P0 | MVP |
| Projects | Create, edit, list, and archive projects | P0 | MVP |
| Projects | Kanban and Scrum starter templates | P0 | MVP |
| Projects | Private project membership | P0 | MVP |
| Issues | Epic, story, task, bug, and subtask | P0 | MVP |
| Issues | Core fields, labels, estimates, and dates | P0 | MVP |
| Issues | Comments, mentions, and attachments | P0 | MVP |
| Issues | Parent-child and issue links | P0 | MVP |
| Issues | Watchers and activity history | P0 | MVP |
| Issues | Bulk field updates | P1 | Post-MVP |
| Board | Kanban columns and drag-and-drop | P0 | MVP |
| Board | Ranking and quick filters | P0 | MVP |
| Board | WIP limits | P1 | Post-MVP |
| Planning | Ranked backlog | P0 | MVP |
| Planning | Create, start, and complete sprint | P0 | MVP |
| Planning | Multiple future sprints | P1 | Post-MVP |
| Planning | Epics panel and release versions | P1 | Post-MVP |
| Search | Keyword search and structured filters | P0 | MVP |
| Search | Saved and shared filters | P0 | MVP |
| Search | Advanced query language | P2 | Later |
| Collaboration | In-app notification inbox | P0 | MVP |
| Collaboration | Email notifications | P1 | Post-MVP |
| Collaboration | Real-time issue and board updates | P1 | Post-MVP |
| Reporting | Personal/project dashboard | P0 | MVP |
| Reporting | Basic sprint progress | P0 | MVP |
| Reporting | Burndown, velocity, cumulative flow | P1 | Post-MVP |
| Reporting | Custom dashboard widgets | P2 | Later |
| Administration | Status and board-column configuration | P0 | MVP |
| Administration | Basic role-based permissions | P0 | MVP |
| Administration | Audit event viewer | P0 | MVP |
| Data | CSV issue import/export | P1 | Post-MVP |
| Automation | Trigger-condition-action rules | P2 | Later |
| Platform | REST API and webhooks | P1 | Post-MVP |
| Integrations | GitHub/GitLab development links | P1 | Post-MVP |
| Integrations | Slack/Teams notifications | P2 | Later |
| Enterprise | SAML SSO and provisioning | P2 | Later |
| Service | Customer portal, queues, and SLAs | P2 | Separate expansion |
| Mobile | Native iOS and Android apps | P2 | Later |

## MVP screen inventory

- Authentication and invitation acceptance
- Workspace setup and switcher
- Home dashboard
- Project directory
- Project summary
- Kanban board
- Backlog and sprint planning
- Issue list/search
- Issue details drawer or page
- Create issue dialog
- Notification inbox
- Member management
- Project settings
- Workspace settings and audit log
- User profile/preferences

## Definition of done for a feature

A feature is complete when:

- Product acceptance criteria are met.
- Authorization and tenant isolation are enforced server-side.
- Loading, empty, success, validation, and failure states are designed and implemented.
- Keyboard access and screen-reader semantics are supported for the primary flow.
- Relevant unit, integration, and end-to-end tests pass.
- Logs and metrics make production failures diagnosable.
- User-facing behavior and administrative implications are documented.

