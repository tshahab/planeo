# Portfolio health reporting

`GET /api/plans/:id/health` returns an authenticated, tenant-scoped health report for a visible portfolio plan. Add `?format=csv` for a governed export of the same aggregate values.

## Calculation contract

- All day boundaries and forecast ranges use UTC.
- Archived issues and issues outside the caller's project and issue-security visibility are excluded by the existing plan query.
- `overdue` means an incomplete issue whose due date is before the current UTC day.
- `completionRate` is completed visible issues divided by all visible issues, rounded to a whole percentage.
- Forecasts use remaining estimate points at 8 points/day (optimistic) and 3 points/day (conservative). Each remaining unestimated issue adds two conservative days.
- Confidence is `LOW` when the plan is empty or more than 25% of remaining work is unscheduled, `MEDIUM` when more than 20% is overdue, and `HIGH` otherwise.
- The report is bounded to the first 50 pages of the plan's configured page size. `scope.bounded` is true when more visible issues remain than the report includes.
- Shared plans with one to four visible issues suppress aggregate values to avoid exposing a protected small cohort; the response sets `privacy.suppressed` and includes the reason. Private plan owners may see their own small plans.

The JSON response includes these rules so consumers can explain the metric inputs, exclusions, timezone, and confidence semantics. Responses are private and `no-store`; CSV uses the same authorized result and does not expose issue-level rows.

This is the first governed reporting slice. Historical snapshots, release/goal/risk drill-downs, privacy suppression for protected cohorts, dashboard widgets, and measured portfolio-scale performance remain follow-up work.
