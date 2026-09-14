# Advanced issue query language

Planeo query links use the versioned `query` and `queryVersion=1` URL parameters. Saved filters normalize advanced queries to version 1 so links remain stable across compatible parser changes.

Queries combine clauses with `AND`, `OR`, `NOT`, and parentheses. Supported operators are `=`, `!=`, `~`, `IN`, `NOT IN`, `>`, `>=`, `<`, and `<=`. Quote values containing spaces. Fields include `key`, `text`, `summary`, `description`, `project`, `type`, `status`, `assignee`, `reporter`, `priority`, `label`, `sprint`, `release`, `parent`, `link`, `requestType`, `created`, `updated`, `due`, and `resolved`. Date values accept `YYYY-MM-DD`, `now`, `today`, and relative durations such as `-7d`, `-12h`, or `-2w`.

Example: `project = WEB AND priority IN (URGENT, HIGH) AND updated >= -7d`

The parser accepts data only and compiles an AST to parameterized Prisma predicates. Query length and weighted cost are bounded. Tenant, accessible-project, and issue-security predicates are always added to the database query before counts, sorting, pagination, or aggregation. Invalid queries return a stable error code and character offset without database or schema details. Suggestions and filter metadata contain only values visible to the authenticated workspace member.
