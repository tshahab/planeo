# Product Requirements Document

## 1. Document status

- Product: Ticketing
- Version: 0.1
- Status: Draft for validation
- Initial release: Web MVP
- Product approach: Kanban-first Jira alternative

## 2. Product vision

Ticketing gives software and operational teams one clear place to plan, assign, discuss, and complete work. It should provide the structure teams expect from Jira while making everyday actions—creating an issue, finding work, and updating a board—faster and easier to understand.

## 3. Problem statement

Teams need structured issue tracking, but many tools become difficult to configure and slow to operate. Work is then split across chat, spreadsheets, and ticketing systems, which causes unclear ownership, stale status, missed dependencies, and unreliable reporting.

Ticketing will solve this by combining:

- A low-friction issue creation and editing experience
- Flexible but understandable project workflows
- Kanban and backlog planning
- Searchable, durable collaboration history
- Useful delivery insights without extensive configuration

## 4. Goals

### MVP goals

- A new team can create a workspace and start tracking work within 10 minutes.
- Users can manage a complete issue lifecycle without leaving the application.
- Teams can plan and execute work on a drag-and-drop Kanban board.
- Project administrators can manage members, basic permissions, issue types, and statuses.
- Users can find issues quickly through text search and structured filters.
- Important changes are visible through activity history and notifications.
- The system safely separates data belonging to different workspaces.

### Later goals

- Advanced Scrum planning and reporting
- Custom workflow and automation builders
- Public API, webhooks, and third-party integrations
- Enterprise identity and compliance features
- Service-desk and customer portal capabilities

## 5. Non-goals for the MVP

- Full Jira feature parity
- Marketplace or plugin framework
- Native mobile applications
- SAML SSO and automated user provisioning
- Customer service portal and SLA management
- Advanced no-code workflow designer
- Complex query language equivalent to JQL
- Portfolio planning across many organizations
- AI-generated estimates or autonomous issue changes

## 6. Target users

### Workspace owner

Creates the workspace, manages billing-level settings, appoints administrators, and controls workspace-wide access.

### Workspace administrator

Manages members, workspace settings, security policies, and project creation.

### Project administrator

Configures a project, membership, statuses, issue types, and board settings.

### Project member

Creates, updates, assigns, discusses, and completes issues according to permissions.

### Viewer

Can view permitted projects and issues but cannot modify them.

## 7. Core concepts

- **Workspace:** Tenant boundary containing members and projects.
- **Project:** Container for related issues, configuration, and boards.
- **Issue:** Trackable unit of work with a unique project key and sequence, such as `WEB-123`.
- **Issue type:** Epic, story, task, bug, or subtask.
- **Status:** Current workflow state, grouped into To do, In progress, or Done.
- **Board:** Visual representation of issues grouped into status columns.
- **Backlog:** Prioritized issues not yet selected for active execution.
- **Sprint:** Time-boxed collection of planned issues.
- **Activity:** Immutable record of meaningful changes to an issue.

## 8. Primary user journeys

### Create and configure a workspace

1. User signs up or signs in.
2. User creates a workspace with name and URL slug.
3. User creates a project using a Kanban or Scrum template.
4. User invites teammates and assigns roles.
5. The system opens the project board with sensible default statuses.

### Create and complete an issue

1. Member opens the global or project create dialog.
2. Member chooses project and issue type, then enters a summary.
3. Member optionally adds description, priority, assignee, labels, estimate, and due date.
4. The issue appears in the backlog or appropriate board column.
5. Members comment, attach files, and update fields.
6. The assignee moves the issue through its workflow until Done.
7. Each meaningful change is recorded in the activity history.

### Plan work on a board

1. Member opens a project board.
2. Member filters issues or searches within the board.
3. Member reorders issues or moves them between permitted columns.
4. The system validates the move, persists rank and status, and updates connected clients.
5. If persistence fails, the UI restores the previous position and explains the error.

### Find work

1. User enters keywords in global search or opens project filters.
2. User filters by project, status, type, assignee, priority, label, or date.
3. User sorts and optionally saves the filter.
4. User opens an issue while preserving the search context.

## 9. Functional requirements

### Identity and onboarding

- Email/password or magic-link authentication
- Sign up, sign in, sign out, password recovery where applicable
- Workspace creation and invitation acceptance
- User profile with display name, avatar, timezone, and notification preferences
- Session management and protected routes

### Workspace and access management

- Create and update a workspace
- Invite, list, deactivate, and remove members
- Assign workspace and project roles
- Prevent access to data outside the active workspace
- Archive projects without immediately deleting their history

### Projects

- Create projects with name, key, description, lead, and template
- Enforce unique project keys within a workspace
- Configure default assignee, issue types, statuses, and board columns
- List active and archived projects
- Provide project summary, board, backlog, issues, and settings views

### Issues

- Create, view, edit, archive, and restore issues
- Support epic, story, task, bug, and subtask types
- Generate immutable human-readable keys
- Store summary, rich-text description, status, priority, reporter, assignee, labels, estimate, dates, and parent
- Add comments and attachments
- Link issues using blocks, is blocked by, duplicates, and relates to
- Watch and unwatch issues
- Record field changes, comments, and workflow transitions
- Validate required fields and permissions on the server
- Allow a limited bulk update for status, assignee, priority, and labels

### Board, backlog, and sprints

- Display issues in configurable status columns
- Drag issues between columns and reorder within a column
- Persist a stable sortable rank
- Filter board issues by assignee, type, priority, and label
- Display unplanned issues in a ranked backlog
- Create, start, and complete one active sprint per project in the MVP
- Move incomplete sprint issues back to backlog or into a new sprint
- Show issue count and estimate totals by column and sprint

### Search

- Search issue key, summary, and description
- Filter by project, issue type, status, assignee, reporter, priority, label, sprint, and dates
- Sort by updated date, created date, priority, due date, and rank
- Save, rename, share within the workspace, and delete filters
- Preserve filters in the URL where practical

### Collaboration and notifications

- Add, edit, and delete one's own comments, subject to an audit record
- Mention workspace members in comments and descriptions
- Show a chronological issue activity feed
- Create in-app notifications for assignment, mention, comment, and watched issue changes
- Mark notifications read individually or in bulk
- Send optional email notifications asynchronously

### Dashboards

- Show assigned open issues, recently viewed issues, project status counts, overdue work, and sprint progress
- Allow filtering dashboard summaries by project
- Defer customizable widget layout until after MVP

### Administration

- Configure basic statuses and map them to board columns
- Configure available issue types and priorities
- View workspace-level audit events
- Export project issues to CSV
- Import issues from a validated CSV template

## 10. Permission model

Permissions are evaluated server-side and scoped to a workspace and, where relevant, a project.

| Capability | Owner/Admin | Project Admin | Member | Viewer |
|---|---:|---:|---:|---:|
| Manage workspace | Yes | No | No | No |
| Create/archive project | Yes | No | No | No |
| Manage project settings | Yes | Yes | No | No |
| Manage project members | Yes | Yes | No | No |
| View project | Yes | Yes | Yes | Yes |
| Create/update issues | Yes | Yes | Yes | No |
| Move issues | Yes | Yes | Yes | No |
| Comment | Yes | Yes | Yes | No |
| Export issues | Yes | Yes | Optional | No |

Private projects are visible only to explicitly assigned members and workspace administrators. Issue-level security is deferred.

## 11. Business rules

- Project keys contain 2–10 uppercase letters and cannot be reused in the same workspace.
- Issue keys never change, even when the project display name changes.
- Subtasks must belong to a non-subtask issue in the same project.
- Done issues retain completion timestamps; reopening clears the current completion timestamp but remains visible in history.
- Status changes must use an allowed project transition.
- Archived projects and issues are read-only until restored.
- Hard deletion is restricted to retention and administrative processes outside normal user flows.
- Every write includes workspace context and authorization checks.
- Board moves use concurrency protection to avoid silently overwriting newer changes.

## 12. Non-functional requirements

### Performance

- Initial authenticated page load target: under 2.5 seconds at the 75th percentile on a typical broadband connection.
- Common API reads target: under 400 ms at the 95th percentile, excluding file transfer and third-party latency.
- Board interactions should acknowledge visually within 100 ms and persist asynchronously.
- Paginate issue lists, comments, activity, and notifications.

### Reliability

- MVP service availability target: 99.5% monthly.
- Idempotent background jobs and retry policies for notifications and file processing.
- Automated daily backups with a tested restoration procedure before production launch.

### Security and privacy

- Strict tenant isolation and least-privilege authorization
- Secure password handling through the selected identity provider
- TLS in transit and encryption at rest through managed infrastructure
- Signed, expiring file URLs and file type/size validation
- Protection against CSRF, XSS, injection, brute force, and abusive rates
- Audit logs for security-sensitive and administrative actions
- Secrets stored outside source control

### Accessibility and usability

- Target WCAG 2.2 AA for core workflows
- Full keyboard access for navigation, dialogs, issue editing, and board alternatives
- Visible focus indicators, accessible labels, and non-color-only status communication
- Responsive support for desktop and tablet; usable read/update flows on mobile

### Observability

- Structured application logs with request and workspace correlation IDs
- Error monitoring, performance traces, health checks, and background-job metrics
- Alerts for elevated failures, latency, and queue backlog

## 13. Success metrics

- Workspace activation: project created and first issue added within one session
- Time to first issue and time to first teammate invitation
- Weekly active workspaces and users
- Issues created, updated, and completed per active workspace
- Percentage of active projects using boards weekly
- Search success proxy: result opened without immediate query reformulation
- 7-day and 30-day workspace retention
- Board move and issue-save error rates
- Support requests per active workspace

## 14. MVP acceptance criteria

The MVP is ready for pilot use when:

- A user can create a workspace, project, and invite members.
- Permissions prevent unauthorized project and issue access.
- Members can manage the full issue lifecycle, including comments and attachments.
- Kanban moves are reliable across refreshes and concurrent sessions.
- Backlog and a lightweight sprint workflow function end to end.
- Search and core filters work across a workspace without tenant leakage.
- Notifications and issue activity correctly represent supported events.
- Core workflows pass automated tests and accessibility checks.
- Production has monitoring, backups, migration procedures, and documented recovery steps.

## 15. Open product decisions

- Authentication provider and whether password authentication is required at launch
- Exact rich-text storage format and supported formatting
- Maximum attachment size and allowed file types
- Whether guests can be restricted to selected projects in the MVP
- Whether email notifications launch with the pilot or immediately afterward
- Data residency, retention, and compliance requirements for the first customers
- Pricing and workspace usage limits

