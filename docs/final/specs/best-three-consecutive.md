# Best 3 consecutive laps mode

> Request: "Best 3 consecutive laps mode: after Get ready, a screen with two buttons, Best lap and Best 3 laps."
> (backlog: "add best 3 consecutive laps mode. get ready screen. after clicking get ready there should be another screen
> added with two options (buttons): best lap, best 3 laps.")

## Goal
Pilots who practise for race qualifying care about their fastest 3 consecutive laps, not only their fastest single lap.
A new **Mode** screen appears after the Welcome **GET READY!** tap. It offers `Best lap` (today's behaviour) and
`Best 3 laps`, which makes the best 3-consecutive-lap total the headline in Session and announces each new best total.
Reading: "after Get ready" means after tapping the Welcome **GET READY!** button, so the order is Welcome → Mode → Get Ready
(preview) → Session. The mode is chosen per session and is not a setting.

## Behaviour
- **Mode screen** (`screen: 'mode'`). It shows the TopBar (`New session` current, `Configuration`), the heading `Choose mode`,
  and two accent pill buttons, each at least 112 px tall: `Best lap` and `Best 3 laps`. They are stacked in portrait and side by side in
  landscape/≥ 768 px, with a max width of 480 px. Under each button is a `text-muted` line: `Fastest single lap` /
  `Fastest 3 laps in a row`. Both buttons use the 300 ms tap guard (`ActionButton`), so the double tap that came from GET READY! can't
  select a mode. The camera is not running on this screen.
- **Gesture-bound effects move to the mode tap.** `GET_READY` (Welcome) now only goes to `mode` with `[audio.unlock]`.
  A new event `CHOOSE_MODE { mode }` on `mode` goes to `getReady` with `camera: 'starting'` and emits
  `[audio.unlock, camera.start, wakeLock.acquire]`, the same as `GET_READY` today. It runs synchronously inside `dispatch` from the tap.
- On `mode`, `NAV_NEW_SESSION` → Welcome and `NAV_CONFIG` → Configuration, with no effects. Every other event is ignored.
  Keyboard: `primaryEvent` returns `null` on `mode` (two equal choices). Tab/Enter on the buttons works natively, and
  `Best lap` gets focus on mount.
- **Mode in state.** `type SessionMode = 'bestLap' | 'best3'` (`session/types.ts`). `AppState.mode: SessionMode` is
  `'bestLap'` initially and is set by `CHOOSE_MODE`. `START` calls `newSession(s.mode)`. `SessionData.mode` is kept across
  STOP/CONTINUE. Leaving to Welcome resets nothing else. There is no persistence and no new `dronelap.` key.
- **Best 3 semantics** (pure, `session/laps.ts`, computed in both modes and shown only in `best3`):
  - `SessionData` gains `best3: { idx: number; ms: Ms } | null`, where `idx` is the index of the first lap of the window, and
    `runStart: number`, the index of the first lap recorded since the last pause.
  - `applyPass` checks only the window ending at the new lap, in O(1): if `laps.length - runStart >= 3`, the window sum is
    `laps[n-3..n-1]`. It is the new best when `best3` is null or the sum is strictly smaller (ties keep the earlier window).
    `applyPass` also returns `best3: boolean`, which is true when this lap set a new best window.
  - **A window never spans a pause.** `stop()` sets `runStart = laps.length` (also when timing is already standby).
    Example: 2 laps, pause, then 1 lap: no best 3 yet.
- **Session in `best3` mode:**
  - Summary (`lap-summary`): `Laps 5 · Best 3 36.12` (mono, `text-best`). Before the first window it shows `Best 3 --.--`.
    The single-lap `Best` is not shown in the summary in this mode. `bestLap` mode is unchanged: `Laps 5 · Best 11.98`.
  - Hero: when the latest lap set a new best window, the label row shows `LAP 5` plus a `Best3Badge` (accent outline pill,
    text `Best 3`). The single-lap green `BEST` badge and colour still work as today. Both badges can show together.
    The `aria-live` text appends `, best 3 laps 36.12`.
  - History: rows inside the current best window (except the latest, which is in the hero) get `data-best3` and a 4 px
    `--accent` left bar, plus sr-only text `, in best 3`. The bar is a shape cue, so colour is not the only cue.
    The single-best ★ row is unchanged.
- **Audio in `best3` mode:** for a lap that sets a new best window, the machine emits
  `{ type: 'audio.cue', cue: 'best3', lapMs, totalMs }`. Speech: `12.34, best three, 36.12` (`spokenTime` for both,
  so `audio.voicePrecision` applies to both and ≥ 60 s gives `1 minute 0.12`). The tone is `LAP`. With `audio.announceBest`
  off, `best3` is spoken as a plain `lap`. Every other lap uses today's `lap`/`best` cues. `bestLap` mode never emits `best3`.
- **Edge cases:** 0–2 laps, or fewer than 3 since the last pause: `Best 3 --.--`, no badge, no bar. Paused: the summary keeps
  the best total. Sim mode (`?sim=1`) works the same way (the SimPanel `Pass` drives laps).

## Acceptance criteria
- **AC1** — On Welcome, `reduce(welcome, GET_READY)` → `screen: 'mode'` with effects `[audio.unlock]` only.
  `reduce(mode, { type: 'CHOOSE_MODE', mode: 'best3' })` → `getReady`, `camera: 'starting'`, `mode: 'best3'`, effects
  `[audio.unlock, camera.start, wakeLock.acquire]`. On `mode`, `NAV_NEW_SESSION`/`NAV_CONFIG` leave with no effects,
  and `START`/`PASS`/`CAMERA_LIVE` are ignored.
- **AC2** — `START` creates a session with `mode` equal to the chosen mode. CONTINUE keeps it.
- **AC3** — `applyPass` tracks the best 3-consecutive window: laps 14.02, 13.40, 11.98, 12.87, 12.34 give
  `best3 = { idx: 2, ms: 37190 }`. Ties keep the earlier window. Laps 1–2, then `stop`, then lap 3 give `best3 === null`.
  The returned `best3` flag is true only on the lap that sets a new best.
- **AC4** — In `best3` mode, a new best window emits `audio.cue` `best3` with `lapMs` and `totalMs`. `speechText('best3', 12340,
  'hundredths', 36120)` is `12.34, best three, 36.12`. The tenths precision and `announceBest: false` (plain lap phrase) are honoured.
  `bestLap` mode emits exactly today's cues.
- **AC5** — The Mode screen shows the `Choose mode` heading and `Best lap` / `Best 3 laps` buttons. The buttons ignore taps for 300 ms after
  mount. Choosing one opens Get Ready with the camera starting.
- **AC6** — The Session summary in `best3` mode reads `Best 3 --.--` until a window exists, then shows the total. The hero shows the `Best 3`
  badge on the lap that set it, and the history rows of the window carry `data-best3`. `bestLap` mode renders as today.
- **AC7** — Lint, typecheck, unit and e2e tests are green (the existing e2e flows go through the Mode screen), and `npm run size` ≤ 130 KB gz.

## Out of scope
- The end-of-session summary with best lap and best 3 (a separate backlog item).
- Persisting or remembering the last mode, or a Configuration setting for it.
- Windows other than 3 (best 5, etc.), race/heat formats, a countdown, or a lap limit.
- Changing detection, the lap semantics for single laps, or the Get Ready preview/calibration.

## Touches
- `app/src/session/types.ts`, `session/laps.ts`: `SessionMode`, `best3`, `runStart`, `newSession(mode)`, `applyPass`/`stop`,
  and `speechText` with `'best3'` + `totalMs`. These are pure, with tests in `session/laps.test.ts`.
- `app/src/app/machine.ts`: `Screen` adds `'mode'`, `AppState.mode`, the `CHOOSE_MODE` event, `audio.cue.totalMs`, and the
  `best3` cue in `session()`. It stays pure (no React).
- `app/src/audio/cues.ts` (`TONES.best3 = LAP`), `audio/announcer.ts` (`announce`/`cue` pass `totalMs`),
  `app/effects.ts` (forward `e.totalMs`), and `sim` announcer logging if it switches on cue.
- `app/src/ui/screens/Mode.tsx` (new), `ui/App.tsx` (`ORDER`: welcome 0, mode 1, getReady 2, session 3, config 4),
  `ui/useKeyboard.ts`, `ui/components/LapHero.tsx`, `ui/components/LapList.tsx` (`best3` prop),
  `ui/components/BestBadge.tsx` (add `Best3Badge`), and `ui/screens/Session.tsx` (pass `best3`/`mode`).
- `ui/gallery/presets.ts`: insert `CHOOSE_MODE` into `GET_READY`, add `mode` and `best3Timing` presets.
  `e2e/helpers.ts` and `ui/App.test.tsx`: add the Mode step.
- Boundaries: `ui/` reads the mode only through the store. There are no `engine/browser`/`sim/` imports in `ui/`.
  The best-3 update is O(1) per lap and runs per pass, never per frame. Colours come only from tokens (accent for best 3, red not used).
- Docs: SPEC §3.1 (Mode row), §3.2 (diagram + transition rows for `GET_READY`/`CHOOSE_MODE`), §3.3 (best 3 semantics,
  spoken format), §4.3 (Mode wireframe). Copy this spec to `docs/final/specs/best-three-consecutive.md`, then tick backlog line 5 and link it.

## Test plan
- **AC1** — Vitest `app/machine.test.ts`: the new rows (GET_READY → mode, CHOOSE_MODE both modes, nav from mode, ignored events).
  Update the existing GET_READY row.
- **AC2** — Vitest `app/machine.test.ts`: GET_READY → CHOOSE_MODE best3 → CAMERA_LIVE → START → `session.mode === 'best3'`.
  Then STOP → CONTINUE keeps it.
- **AC3** — Vitest `session/laps.test.ts`: the example laps, a tie, the pause split (`stop` sets `runStart`), and the flag only on new best.
- **AC4** — Vitest `app/machine.test.ts` (cue effects in both modes), `session/laps.test.ts` (`speechText` hundredths/tenths/≥ 60 s),
  and `audio/announcer.test.ts` (`announceBest: false` → lap phrase, tone `LAP`).
- **AC5** — Testing Library `ui/screens/Mode.test.tsx` (new): heading, two buttons, a click within 300 ms ignored (fake timers),
  then `Best 3 laps` → store `screen === 'getReady'`, `mode === 'best3'`. Update `ui/App.test.tsx` for the extra step.
- **AC6** — Testing Library: `ui/components/LapList.test.tsx` (`data-best3` rows), plus a LapHero/Session test for the summary text and
  badge. Playwright `e2e/session.spec.ts` (`?sim=1`): Get ready! → Best 3 laps → Start → 4 passes → the summary shows `Best 3`
  with a time.
- **AC7** — CI: `lint`, `typecheck`, `test --coverage`, `size`, and e2e with the `helpers.ts` flow updated (`Best lap` step).
- Manual: on a phone, pick Best 3 laps, fly 4 laps, and hear "…, best three, …" on lap 3. Pause, continue, and check the window restarts.
