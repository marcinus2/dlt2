# Spoken lap time to one decimal

> Request: Spoken lap time to one decimal place, as a new setting in Configuration (mid-flight the pilot doesn't need hundredths).

## Goal
Mid-flight, "twelve point three four" takes longer to hear and parse than the pilot needs. Add an
Audio setting that speaks lap times to tenths ("12.3"). The screen keeps showing hundredths.
Reading: this is opt-in. The default stays at hundredths (D9 today), so existing users hear no change.

## Behaviour
- New setting **`audio.voicePrecision`** (stored in `dronelap.settings.v2` like every other setting),
  type `enum`, values `'hundredths' | 'tenths'`, default `'hundredths'`.
  - Configuration › Audio, placed right after "Spoken lap times" (`audio.voice`). It is not advanced.
  - Label: `Spoken precision`. Segmented options: `12.34` (hundredths) and `12.3` (tenths).
  - Help: `Tenths are quicker to hear mid-flight. The screen always shows hundredths.`
- With `tenths`, every spoken lap time has one decimal: lap "12.3", new best "Best, 12.3",
  ≥ 60 s "1 minute 5.3", "2 minutes 5.0". "Go" and "Paused" are unchanged.
- Rounding: round the **displayed** centisecond value to one decimal, half up, so what is heard matches
  what is on screen rounded. 12 345 ms → shown "12.35" → spoken "12.4". 12 340 ms → "12.3".
  The carry crosses the minute: 59 950 ms → "1 minute 0.0". A trailing zero is kept: 12 000 ms → "12.0".
- `hundredths` behaves exactly as today ("12.34", "1 minute 5.34").
- On-screen times (`formatLap`: LapHero, LapList) are unchanged in both modes.
- `audio.voice` off → nothing is spoken and the precision has no effect. The control stays enabled.
- No voice on the device → beeps only, as today. The existing "Voice not available" note covers it.
- Cues use the **saved** settings (`host.saved().audio`), so a change applies to the next lap after Save.
  Diagnostics › Sound check (`?debug=1`) uses the **draft**, so with `tenths` selected, Lap says "12.3" and
  Best says "Best, 12.3" before Save.
- Sim mode (`?sim=1`) behaves the same way, through the same announcer.
- Stored settings with no `voicePrecision` (every existing user) or an invalid value are filled with
  the default by `sanitize()`. There is no schema version bump and no migration.
- The Audio group summary (`groupSummary`) is unchanged.

## Acceptance criteria
- **AC1**: `SCHEMA` has an `enum` field `audio.voicePrecision` (group `audio`, not advanced, default `'hundredths'`,
  options `hundredths` → `12.34` and `tenths` → `12.3`), ordered directly after `audio.voice`. `DEFAULTS.audio`
  is `{ beep: true, voice: true, announceBest: true, voicePrecision: 'hundredths' }`.
- **AC2**: `speechText` in tenths mode produces `lap 12340 → "12.3"`, `best 12340 → "Best, 12.3"`,
  `lap 12345 → "12.4"`, `lap 65340 → "1 minute 5.3"`, `best 59950 → "Best, 1 minute 0.0"`,
  `lap 125000 → "2 minutes 5.0"`, `lap 12000 → "12.0"`. Go, Paused and armed are unchanged.
- **AC3**: In hundredths mode, and when the mode is omitted, `speechText` output is byte-identical to today
  (the existing `speechText` table passes unchanged).
- **AC4**: `announce(cue, lapMs, s)` uses `s.voicePrecision`. With `tenths`, `announce('best', 12340, …)` gives
  `{ tone: 'best', text: 'Best, 12.3' }`. Voice off still gives `text: ''`, and the tone is unaffected.
- **AC5**: `sanitize()` of a stored v2 payload without `audio.voicePrecision`, or with an unknown value, yields
  `'hundredths'`. A stored `'tenths'` survives a reload.
- **AC6**: Configuration › Audio shows "Spoken precision" with the two options. Choosing `12.3` and Save
  persists `voicePrecision: 'tenths'` to `dronelap.settings.v2`.
- **AC7**: In `?sim=1` with `voicePrecision: 'tenths'`, a session speaks "Go" and then lap times matching
  `/^(Best, )?\d+\.\d$/`. On-screen lap times keep two decimals.

## Out of scope
- Changing what the screen shows (`formatLap`, LapHero, LapList, `--.--`).
- Whole seconds, three decimals, or any other precision.
- Changing the default to tenths, rewording phrases, lap-number announcements, or speech rate.
- Changing the Audio group summary line.

## Touches
- `app/src/engine/types.ts`: add `voicePrecision: 'hundredths' | 'tenths'` to `AudioSettings`
  (a type-only change, with no DOM).
- `app/src/settings/schema.ts`: new `enum` field after `audio.voice`. `DEFAULTS` derives from it.
  `validate.ts`/`sanitize` already handle `enum`, so no change is expected there. This module stays pure.
- `app/src/session/laps.ts`: `spokenTime(ms, precision)` and
  `speechText(cue, lapMs?, precision = 'hundredths')`, with the tenths rounding from the centisecond value.
  This module stays pure.
- `app/src/audio/announcer.ts`: pass `s.voicePrecision` to `speechText`. No change to `speech.ts`.
- UI: no new component. `SettingField` already renders `enum` as `Segmented` from the schema.
  `ui/` doesn't import `engine/browser` or `sim/`.
- Tests and fixtures that build `AudioSettings` literals: `announcer.test.ts` (`ALL`), `schema.test.ts`
  (the `DEFAULTS` snapshot), `store.test.ts` and gallery presets if they spell out `audio`.
- Docs: `docs/final/SPEC-v1.0.0.md` D9 (line ~22), §1.3 settings table (`audio.*` row ~98), §3.3 "Spoken format"
  (~318), and the `AudioSettings` interface (~557). Copy this spec to `docs/final/specs/spoken-lap-decimal.md`,
  then tick the item in `docs/final/backlog.md` and link the spec there.
- No machine or store changes and no new dependency. The machine still emits `audio.cue` with `lapMs`,
  and effects pass the saved audio settings.

## Test plan
- **AC1**: Vitest in `settings/schema.test.ts`. Update the `DEFAULTS` `toEqual`. Assert that `field('audio.voicePrecision')`
  is an `enum` in group `audio` with no `advanced`, and that its index in `SCHEMA` is the index of `audio.voice` + 1.
  The existing "every default is valid" test covers the default.
- **AC2/AC3**: Vitest in `session/laps.test.ts`. Add an `it.each` table for `'tenths'` with the cases from AC2, and
  keep the existing table, which calls without a precision. Add the same cases with an explicit `'hundredths'`.
- **AC4**: Vitest in `audio/announcer.test.ts`. Add `voicePrecision: 'hundredths'` to `ALL`. Add a case
  `announce('best', 12340, { ...ALL, voicePrecision: 'tenths' })` → `'Best, 12.3'`, a voice-off case, and a
  `createAnnouncer` case where the fake speech receives `'12.3'`.
- **AC5**: Vitest in `settings/validate.test.ts` (or `storage.test.ts`). Run `sanitize()` on a payload with `audio`
  lacking the key, one with `voicePrecision: 'bogus'`, and one with `'tenths'`.
- **AC6**: Testing Library in `ui/App.test.tsx`, or a new `Configuration` test using `src/test/ui.tsx`. Open
  Configuration, expand Audio, click the `12.3` option, Save, then assert the stored settings / store have
  `audio.voicePrecision === 'tenths'`.
- **AC7**: Playwright `e2e/audio.spec.ts` (`?sim=1`, `--project=chromium` locally). Use
  `recordAudio(page, { ...DEFAULTS.audio, voicePrecision: 'tenths' })`, run go + 2 passes, and expect the spoken lines to match
  `/^say (Best, )?\d+\.\d$/`. Assert the on-screen latest lap still matches `/\d+\.\d\d/`. Extend the
  Diagnostics sound-check test with a tenths variant that expects `['say Go', 'say 12.3', 'say Best, 12.3', 'say Paused']`.
- Manual: on a phone, set Spoken precision to `12.3`, fly 3 laps, and hear one decimal.
