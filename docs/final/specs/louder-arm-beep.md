# Louder arm beep

> Request: after get ready, arm beep sound should be louder

## Goal
The `armed` cue (the beep that says detection is live after GET READY → START and the warm-up)
is the quietest tone in the app (gain 0.1, half of every other cue), so pilots standing away from
the phone miss it. Make it clearly audible, with no new setting.
Reading: "arm beep" means the `armed` cue (`TONES.armed` in `app/src/audio/cues.ts`). The request
asks for louder, not for a different sound, so the 440 Hz pitch stays.

## Behaviour
- After START (or CONTINUE), when the warm-up (`dronelap.` setting `warmupMs`, default 1500 ms)
  ends, the machine's `ARMED` transition emits `audio.cue armed` exactly as today. Only the tone changes:
  - `armed`: 440 Hz → 440 Hz, **200 ms** (was 120 ms), **gain 0.5** (was 0.1, about +14 dB).
  - Same envelope as every cue in `playTone`: 5 ms attack, then a linear ramp to 0 at the end.
- The armed tone is the loudest cue. It plays once per session or continue, and nothing else
  sounds at the same moment, so a 0.5 peak from one oscillator cannot clip.
- Other cues (`go`, `lap`, `best`, `paused`) are unchanged.
- `audio.beep` off → no armed tone, as before. Audio locked → the "Tap to enable sound" banner, as before.
- Sim mode (`?sim=1`) plays the same tone. The Sound check in Configuration › Diagnostics (`?debug=1`)
  "Armed" button plays the new tone.
- `warmupMs = 0`: the armed cue still fires right after START, using the new tone.
- No new settings, copy strings or UI.

## Acceptance criteria
- **AC1**: `TONES.armed` is `{ from: 440, to: 440, ms: 200, gain: 0.5 }`.
- **AC2**: `TONES.armed.gain` is greater than or equal to the gain of every other cue, and at least 4× the old 0.1.
- **AC3**: `TONES.armed.gain` is ≤ 1 and `TONES.armed.ms` is ≤ 250 ms, so the tone stays short and cannot clip.
- **AC4**: The other `TONES` entries (`go`, `lap`, `best`, `paused`) keep their current values.
- **AC5**: `playTone(ctx, TONES.armed)` ramps the gain node to 0.5 after the 5 ms attack, and the oscillator stops at `t0 + 0.2` s.
- **AC6**: The e2e audio flow still plays an armed tone and then a go tone after GET READY → START in `?sim=1`.
- **AC7**: Spec §2.3 "Cues" row describes `armed` as a 440 Hz 200 ms tone, the loudest cue, with "soft" removed.

## Out of scope
- A volume setting or slider, or per-cue volume.
- Changing pitch or waveform, or adding a double beep.
- Changing other cues, speech volume, or when the armed cue fires.

## Touches
- `app/src/audio/cues.ts`: change the `armed` entry in `TONES` (and its comment if needed).
  It is a pure module with no React, UI or DOM globals beyond the `AudioContext` that is passed in.
- `app/src/audio/announcer.test.ts`: extend the `TONES` describe, or add `app/src/audio/cues.test.ts`.
- `docs/final/SPEC-v1.0.0.md` §2.3 Cues row (line ~175): update the `armed` description.
- `docs/final/backlog.md`: tick "arm beep should be louder" and link this spec.
- No machine, store or UI changes. No new dependency.

## Test plan
- **AC1–AC4**: Vitest in the `TONES` describe. Assert `TONES.armed` equals the exact object.
  Assert `armed.gain >= max(gain of the other cues)` and `>= 0.4`, `gain <= 1`, `ms <= 250`.
  Snapshot the other four entries with `toEqual`.
- **AC5**: Vitest unit test of `playTone` with a fake `AudioContext`: `currentTime = 0`, and stub
  `createOscillator` / `createGain` to record `setValueAtTime`, `linearRampToValueAtTime`, `start` and `stop`.
  Expect `linearRampToValueAtTime(0.5, 0.005)` on the gain param and `stop(0.2)` on the oscillator.
- **AC6**: The existing Playwright `e2e/audio.spec.ts` (sim, `--project=chromium` locally) still
  passes, polling for 2 tone calls (armed, go).
- **AC7**: Review the docs diff in the PR.
- Manual: on a phone, run Diagnostics › Sound check "Armed" next to "Lap" and confirm armed is clearly louder.
