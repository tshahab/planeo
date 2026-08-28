# Project releases

Project releases are many-to-many delivery targets: an issue may belong to no release or several releases. Project administrators can create and edit planned releases, assign project issues, mark a release as released, and archive or restore it. Release names are unique per project. Dates use `YYYY-MM-DD`, and the target date cannot precede the start date.

Marking a release as released records `releasedAt` once and does not complete unresolved issues. Released and archived releases remain available in release detail, historical issue context, search filters, dashboard summaries, and CSV exports. Mutations require the current `version`; stale requests receive `409 Conflict`. Administrative mutations are written to the workspace audit log.

Endpoints: `GET/POST /api/projects/{key}/releases` and `GET/PATCH /api/projects/{key}/releases/{id}`. CSV uses the semicolon-separated `releases` column and export accepts a `release` name filter.
