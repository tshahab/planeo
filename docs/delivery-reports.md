# Delivery reports

Planeo appends tenant- and project-scoped issue history for creation, status, estimate, and sprint-scope changes. Completed velocity reads immutable sprint snapshots; unrelated later edits cannot rewrite it. The indexed reports endpoint limits cumulative-flow ranges to 90 UTC days, velocity to 12 sprints, and history reads to 100,000 events.

Burndown shows remaining and total estimate, scope changes, and unestimated item counts. Velocity provides completed estimates and issue counts. Cumulative flow reconstructs the latest status category for each non-archived issue at each UTC day boundary; reopened issues return to their latest category. Archived issues remain in completed snapshots but leave current flow. Every visual has an adjacent semantic table, explicit empty/partial states, and does not rely on color or pointer interaction.
