# End-session bests summary

> Request: "after clicking end session best 3 consecutive laps time and best lap time should be displayed"
> (backlog: "After End session, show the best lap and the best 3 consecutive laps.")

## Goal
Today confirming **End session** drops the pilot on Welcome and the session is lost. They should see their result first.
Reading: confirming the `End session` dialog (paused → END → confirm) opens a new `summary` screen that shows the best single
lap and the best 3 consecutive laps, in both modes. The prior spec (`docs/final/specs/best-three-consecutive.md`) listed this as out of scope.

## Behaviour
- **Trigger.** Only the confirmed `endSession` dialog (session has ≥ 1 lap). `END` with 0 laps still goes straight to Welcome,
  with no summary. Leaving via New session / Configuration (`leaveSession` dialog) is unchanged.
- **Machine.** `Screen` adds `'summary'`. `confirm()` for `endSession` returns
  `{ ...leaveTo(s, 'welcome'), screen: 'summary', session: s.session }` with effects `[wakeLock.release]` (camera is already off
  because the session was paused). No new event is needed. On `summary`: `NAV_NEW_SESSION` → Welcome via `leaveTo` (session null),
  `NAV_CONFIG` → Configuration via `leaveTo`, both with no effects. All other events are ignored. No dialog is shown.
  `primaryEvent` in `ui/useKeyboard.ts` returns `null` on `summary`.
- **Summary screen** (`ui/screens/Summary.tsx`, new). TopBar (`New session`, `Configuration`) and heading `Session complete`.
  Two stat cards (stacked in portrait, side by side at ≥ 768 px or landscape, max width 480 px each):
  - `Best lap` with `formatLap(laps[bestIdx].ms)` (mono, `text-best`), and a `text-muted` line `Lap 3`.
  - `Best 3 laps` with `formatLap(best3.ms)`, and a `text-muted` line `Laps 3–5` for idx 2, i.e. `idx+1`–`idx+3`. If the session has fewer than 3
    laps in a row (`best3 === null`) it shows `--.--` and `Needs 3 laps in a row`.
  - Below, a `text-muted` line: `{n} laps` (via `lapsText`).
  - One accent pill `ActionButton` `New session` (300 ms tap guard) that dispatches `NAV_NEW_SESSION`.
  The mode does not change the layout: both bests are always shown. The screen is static data, with no per-frame updates.
- **Transition.** `ui/App.tsx` `ORDER` gives `summary` the same slot as `config` side (add `summary: 4`, config 5) or reuses the
  session slide direction. Keep it simple and consistent with the existing motion.
- **Settings.** None. No new `dronelap.` key. Sim mode (`?sim=1`) works the same way.
- **Edge cases.** One or two laps: `Best lap` is set and `Best 3 laps` is `--.--`. A window never spans a pause (existing
  `runStart`), so the best 3 shown is the one the session already tracked. Reload loses the summary (not persisted).

## Acceptance criteria
- **AC1** — From `paused` with ≥ 1 lap, `END` then `CONFIRM` gives `screen: 'summary'`, `session` retained, `camera: 'off'`,
  `dialog: null`, and effects `[wakeLock.release]`. `END` with 0 laps still goes to `welcome` with `session: null`.
- **AC2** — On `summary`, `NAV_NEW_SESSION` gives `welcome` and `NAV_CONFIG` gives `config`, both with `session: null` and no effects.
  `START`/`PASS`/`STOP`/`CONTINUE` are ignored.
- **AC3** — The Summary screen shows `Best lap` with the best single lap time and its lap number.
- **AC4** — The Summary screen shows `Best 3 laps` with the best window total and its lap range (`Laps 3–5` for idx 2), in both `bestLap` and
  `best3` modes. With fewer than 3 consecutive laps it shows `--.--`.
- **AC5** — The `New session` button on Summary (after the 300 ms guard) opens Welcome. Space/Enter has no global action on Summary.
- **AC6** — Lint, typecheck, unit and e2e tests, and `npm run size` (≤ 130 KB gz) are green.

## Out of scope
- Persisting sessions or history, sharing/export, a full lap table on Summary, and comparing against earlier sessions.
- Summary after New session / Configuration leave (they keep the discard dialog and no summary).
- Changing best-lap or best-3 computation.

## Touches
- `app/src/app/machine.ts`: `Screen` adds `'summary'`, a `summary()` reducer branch, `confirm()` for `endSession`. Pure, no React.
- `app/src/ui/screens/Summary.tsx` (new), `ui/App.tsx` (render + `ORDER`), `ui/useKeyboard.ts`, `ui/copy.ts` (optional copy helper).
- `app/src/ui/gallery/presets.ts`: add a `summary` preset (the existing `END` preset events plus `CONFIRM`).
- Boundaries: `ui/` reads state only through the store. No `engine/browser`/`sim/` imports. Colours from tokens only (red is not used).
  `formatLap` from `session/laps.ts` is reused.
- Docs: SPEC §3.1 (Summary row), §3.2 (END confirm transition), §4.3 (wireframe). Tick the backlog line and link this spec.

## Test plan
- **AC1, AC2** — Vitest `app/machine.test.ts`: the new rows (END+CONFIRM with laps, END with 0 laps, nav from `summary`, ignored events).
- **AC3, AC4** — Testing Library `ui/screens/Summary.test.tsx` (new): with a store seeded by the laps 14.02, 13.40, 11.98, 12.87, 12.34,
  it shows `11.98`, `Lap 3`, `37.19`, `Laps 3–5` (window idx 2). Cases: 2 laps gives `--.--`, and `best3` mode and `bestLap` mode both render both.
- **AC5** — Same test file: click inside 300 ms is ignored (fake timers), then `New session` gives `screen === 'welcome'`.
  Playwright `e2e/session.spec.ts` (`?sim=1`): start, 3 passes, Stop, End, confirm `End session`, the summary shows `Best lap` and
  `Best 3 laps` with times, then `New session` opens Welcome.
- **AC6** — CI: `lint`, `typecheck`, `test --coverage`, `build`, `size`, and e2e (`--project=chromium` locally).
