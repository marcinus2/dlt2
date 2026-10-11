# Calibration voice cue

> Request: spoken feedback for Get Ready Calibrate: a short "Calibrated" / "Calibration failed" cue, so a pilot standing away from the phone knows the result.

## Goal
Get Ready's Calibrate shows its result only on screen. Announce it with the existing audio pipeline (tone + speech) so the pilot hears it from a distance.
Reading: Get Ready only (Test & calibrate in Configuration stays silent); cancelling is silent; the cues follow the existing `dronelap.audio` toggles (`beep`, `voice`), no new setting.

## Behaviour
- Two new cues in `Cue` (`session/types.ts`): `calibrated`, `calibrationFailed`.
- Spoken text (`speechText` in `session/laps.ts`): `calibrated` -> "Calibrated", `calibrationFailed` -> "Calibration failed". Spoken only when `audio.voice` is on; the tone plays only when `audio.beep` is on. `announceBest` is irrelevant to them.
- Tones (`audio/cues.ts` `TONES`): `calibrated` rising like `go` (660->990 Hz, 180 ms, gain 0.5, loud because the pilot is away from the phone); `calibrationFailed` falling like `paused` (495->330 Hz, 300 ms, gain 0.5).
- Success: when a Calibrate run on Get Ready completes with a result and `applyCalibration` is applied (screen `getReady`, camera `live`), the machine's `CALIBRATED` transition also emits `audio.cue` `calibrated`.
- Failure (no usable frames): `useCalibration` gets an optional `onFail` callback; Get Ready passes a store action that dispatches new event `CALIBRATION_FAILED`. The machine emits `audio.cue` `calibrationFailed` only when `screen === 'getReady'` and `camera === 'live'`.
- Cancel, losing the camera, or leaving the screen mid-run: no cue. Test & calibrate (Configuration) passes no `onFail`, and its success path does not dispatch `CALIBRATED`: no cue.
- Sim mode (`?sim=1`): works through the same effect; the sim log shows `cue calibrated “Calibrated”`.
- Diagnostics test cues use `testCue`; it needs no change (new cues are not added to the sound check).

## Acceptance criteria
- **AC1** - `speechText('calibrated')` is "Calibrated" and `speechText('calibrationFailed')` is "Calibration failed"; `announce()` returns the matching tone, and the text is empty with `voice: false` and the tone null with `beep: false`.
- **AC2** - `TONES` has entries for both new cues (the `Record<Cue, Tone>` still type-checks).
- **AC3** - Machine: `CALIBRATED` with `camera: 'live'` yields `audio.cue {cue:'calibrated'}` in addition to the existing `settings.commit` and `engine.update`; with camera not live it yields no effects.
- **AC4** - Machine: `CALIBRATION_FAILED` on `getReady` with a live camera yields exactly `audio.cue {cue:'calibrationFailed'}`; on any other screen, or with the camera not live, it yields none.
- **AC5** - Get Ready component: a failing calibration run (no usable samples) dispatches `CALIBRATION_FAILED`, so `audio.cue` is called with `calibrationFailed`; a successful run calls it with `calibrated`; pressing Cancel mid-run calls neither.
- **AC6** - Test & calibrate (Configuration) completes success and failure runs with no `audio.cue` call.

## Out of scope
New settings or toggles, localization, adding the cues to Diagnostics' sound check, speaking during the calibration countdown/progress.

## Touches
`app/src/session/types.ts`, `session/laps.ts`, `audio/cues.ts`, `app/machine.ts` (event + effects), `app/store.ts` (action for the failure dispatch), `ui/config/useCalibration.ts` (`onFail`), `ui/screens/GetReady.tsx`. Rules: machine/session/audio stay free of React and UI; no per-frame work (cues fire once at the end of a run); no `await` before gesture-bound effects (not applicable: audio is already unlocked from the earlier tap, and `announcer.cue` only plays when unlocked); the existing on-screen status text stays unchanged.

## Test plan
- AC1: Vitest in `session/laps.test.ts` and `audio/announcer.test.ts`.
- AC2: `audio/cues.test.ts` (entries exist, positive durations/gain) plus `npm run typecheck`.
- AC3, AC4: Vitest in `app/machine.test.ts`.
- AC5, AC6: Testing Library in `ui/screens/GetReady.test.tsx` and `ui/config/TestCalibrate.test.tsx`, spying on the `audio.cue` of `noopEffects()` (see `test/ui.tsx`), as the existing calibrate tests do.
- Optional e2e (`?sim=1`): Calibrate on Get Ready, assert the sim log contains `cue calibrated`.
