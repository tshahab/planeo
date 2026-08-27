# Product hardening review

Reviewed 2026-08-27 for the Planeo pilot. All commands ran in `compose.test.yaml`; no host dependencies are required.

## Accessibility and responsive review

- Keyboard: board cards expose their issue, priority, and status; `Alt+Left` and `Alt+Right` move a focused card through the workflow. Create-issue dialogs trap focus, close with Escape, and return focus to their trigger.
- Semantics: the project view switcher uses tab roles and selection state, dialogs have an accessible name, errors are announced, and every focusable control has a visible focus indicator.
- Non-color cues: priority is written beside its icon, status names remain visible, and status color indicators have a boundary.
- Recovery: failed summary loads retain the current screen and offer an explicit retry. Create-issue input remains in the dialog after a failed save, while the workspace error can be dismissed and retried.
- Responsive: the dashboard, project, search, notifications, profile, and workspace settings routes were checked at 390x844 and 768x1024 with no horizontal document overflow.
- Automated accessibility: Axe found no serious or critical violations on those authenticated routes at either viewport.
- Motion: reduced-motion preferences disable nonessential animation and transitions.

Manual follow-up before a wider release should repeat the keyboard path with VoiceOver or NVDA, zoom each route to 200%, and check the board and issue panel with representative long titles and translated text.

## Performance smoke

The Docker development-server smoke warms each route before measuring it. It is a regression gate, not a substitute for production percentile monitoring.

| Measurement | Result | Pilot budget |
| --- | ---: | ---: |
| Cached authenticated project page | 193 ms | < 2,500 ms |
| Issues API p95 (5 samples) | 22 ms | < 400 ms |
| Project summary API p95 (5 samples) | 23 ms | < 400 ms |
| Search API p95 (5 samples) | 29 ms | < 400 ms |

Production telemetry should continue to validate page p75 and API p95 under realistic concurrency and network conditions.

## Reproduce

```sh
docker compose -f compose.test.yaml build
docker compose -f compose.test.yaml run --rm tests
docker compose -f compose.test.yaml up -d test-app
docker compose -f compose.test.yaml run --rm e2e
```
