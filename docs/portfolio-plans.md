# Portfolio plans

Portfolio plans combine one to fifty authorized project or version-1 query sources. Plans are private by default and shared plans are visible only inside their workspace. Every read reapplies workspace, accessible-project, and issue-security predicates before counting or pagination; sources never grant access.

Plan configuration persists columns, grouping, hierarchy expansion, zoom, timezone, archive visibility, and a bounded page size. Updates require the current version and record an audit event. Items use deterministic due-date/id ordering, represent missing dates as unscheduled, and render ISO calendar dates to avoid timezone drift. Timeline links and the keyboard-friendly table are generated from the same response payload and therefore expose identical work and operations.
