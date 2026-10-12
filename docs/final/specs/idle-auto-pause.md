# Idle auto-pause

> Request: Idle too long during an active session: voice warning, then switch to Paused to save battery (the drone may need repairs that take more than 3 minutes). The pilot un-pauses manually. The idle time can be changed in Configuration.

## Goal
A session left running with no passes (drone being repaired) warns by voice, then pauses itself so the camera and detection stop and the battery is spared. The pilot resumes with CONTINUE.

Reading: "idle" = no pass detected for `session.idleSec` while the session screen is armed/ready. The clock starts when the session becomes `ready` (`ARMED`) and restarts on every `PASS`. Not running on Get Ready, Paused or dialogs-over-nothing (a dialog does not stop it; detection keeps running under dialogs).

## Behaviour
1. New setting `session.idleSec` (new settings group `session`, shown in Configuration under a new "Session" group, number field, unit `s`, min 30, max 900, step 30, default 120; `0` is not allowed, so use the `idleAutoPause` bool below to turn it off). Plus `session.idleAutoPause` bool, default `true`. Help: "Warns, then pauses the session after this long without a pass, to save battery." Both are sanitized/defaulted like other settings (older saved settings without the group get defaults).
2. When idle time reaches `idleSec`, the app plays the `idleWarning` cue (tone 660 Hz 300 ms gain 0.5, loud, the pilot is away from the phone) and says "No laps. Pausing in 15 seconds." (voice only if `audio.voice`; tone only if `audio.beep`). The screen stays unchanged.
3. A pass during the 15 s grace (constant `IDLE_GRACE_MS = 15000`) cancels the warning and restarts the idle clock.
4. If the grace expires, the machine goes to Paused with new `PauseReason` `'idle'` via the existing `pause()` path: engine and camera stop, wake lock is kept, `paused` cue plays ("Paused"), laps are kept. Pausing during idle discards no lap (none in progress is guaranteed only by timing state `standby`; an in-progress lap is discarded as with STOP).
5. Paused banner (`role="alert"`, `pauseBanner`): title "Paused — no activity", body "Tap CONTINUE to resume." The pilot resumes manually with CONTINUE (existing flow: camera restarts, Arming). It never auto-resumes.
6. Edge cases: 0 laps (session just started, never passed) idles the same way; STOP, APP_HIDDEN, CAMERA_LOST, END, navigation cancel the timers; `idleAutoPause = false` never arms them; Arming phase (before `ready`) has no idle clock; sim mode (`?sim=1`) behaves the same, driven by the real timers.
7. Design: the machine stays pure. New events `IDLE_WARN` and `IDLE_TIMEOUT`; new effects `idle.watch` (emitted on `ARMED` and each `PASS` when enabled; carries nothing, the runner reads saved settings) and `idle.clear` (emitted by every transition leaving a ready session). The runner in `app/effects.ts` owns two `setTimeout`s (warn at `idleSec`, then timeout at +`IDLE_GRACE_MS`) and dispatches `IDLE_WARN` (machine returns `audio.cue idleWarning`) and `IDLE_TIMEOUT` (machine calls `pause(s, 'idle')`). Both events are ignored unless the screen is `session` and phase `ready`. `IDLE_WARN`/`IDLE_TIMEOUT` are in `SYSTEM_EVENTS` so a dialog does not block them.

## Acceptance criteria
- **AC1** — Machine: in `session`/`ready`, `ARMED` and `PASS` emit `idle.watch` when `idleAutoPause` is on; `IDLE_WARN` emits `audio.cue idleWarning` and no state change; `IDLE_TIMEOUT` goes to `paused` with `pauseReason 'idle'`, laps kept, effects `engine.stop`, `camera.stop`, `audio.cue paused`; both are ignored on other screens or phases.
- **AC2** — `idle.clear` is emitted when leaving a ready session (STOP, APP_HIDDEN, CAMERA_LOST, NAV leave confirmed, IDLE_TIMEOUT); CONTINUE does not start a clock until the next `ARMED`.
- **AC3** — Effect runner (fake timers): after `idleSec` the warning is dispatched, after `+15 s` the timeout; a `PASS` or `idle.clear` in between cancels and restarts; `idleAutoPause = false` schedules nothing.
- **AC4** — Audio: `announce('idleWarning', …)` yields the tone and the text "No laps. Pausing in 15 seconds." honouring `audio.beep` and `audio.voice`; `TONES` has the new entry.
- **AC5** — Settings: `session.idleSec` (30–900, step 30, default 120) and `session.idleAutoPause` (default true) exist in `SCHEMA`/`DEFAULTS`, are validated, are editable in Configuration, and old stored settings load with defaults.
- **AC6** — Paused with reason `idle` shows banner "Paused — no activity" with CONTINUE; CONTINUE resumes via the existing flow.
- **AC7** — Idle pause (gallery preset `pausedIdle`, new) fits without scrolling at 360×640, 390×844 and 844×390 (`e2e/gallery.spec.ts` fit check); the Configuration "Session" group is covered by the existing config e2e.

## Out of scope
Auto-resume; idle handling on Get Ready, Configuration or Summary; a visible countdown; changing the "Paused" cue; idle detection based on motion other than passes.

## Touches
`src/app/machine.ts` (PauseReason, events, effects), `src/app/effects.ts` (idle timers), `src/engine/types.ts` (Settings `session` group), `src/settings/schema.ts`, `validate.ts`, `migrate.ts` if needed, `src/audio/cues.ts`, `announcer.ts`, `src/session/types.ts` + `laps.ts` (`Cue`, `speechText`), `src/ui/copy.ts`, `src/ui/gallery/presets.ts`, sim effects wiring. Boundaries: machine/settings/session stay React-free and pure; timers live only in the runner; UI reads state via the store.

## Test plan
- AC1, AC2: Vitest in `src/app/machine.test.ts`.
- AC3: Vitest with fake timers in the effects runner test (`src/app/effects.test.ts`).
- AC4: `src/audio/announcer.test.ts`.
- AC5: `src/settings/*.test.ts` (schema/validate/storage defaults) and `e2e/config.spec.ts` field present and saved.
- AC6: component test for the paused screen/banner copy (`src/ui/copy` test) plus `e2e/session.spec.ts` (`?sim=1`, short `idleSec` set in storage, wait for Paused banner, CONTINUE returns to session).
- AC7: `e2e/gallery.spec.ts` fit check with the new preset `pausedIdle`.
