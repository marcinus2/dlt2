# Factory backlog

`/factory next` runs the first unchecked item above **Proposed** and marks it `[x] … → <job-id>`.
Items come from [docs/final/backlog.md](../docs/final/backlog.md). One line each; the spec-writer fills in the details.

- [x] Arm beep should be louder. → 001-louder-arm-beep
- [x] Spoken lap time to one decimal place, as a new setting in Configuration (mid-flight the pilot doesn't need hundredths). → 002-spoken-lap-decimal
- [x] After End session, show the best lap and the best 3 consecutive laps. → 005-end-session-bests
- [x] Idle too long during an active session: voice warning, then switch to Paused to save battery (the drone may need repairs that take more than 3 minutes). The pilot un-pauses manually. The idle time can be changed in Configuration. → 007-idle-auto-pause
- [x] Best 3 consecutive laps mode: after Get ready, a screen with two buttons, Best lap and Best 3 laps. → 004-best-three-consecutive
- [x] Get ready screen: live camera preview, switchable between live and difference view, to help position the phone and debug detection. → 003-get-ready-calibration
- [x] Make calibration easier to reach, e.g. from the Get ready preview. → 003-get-ready-calibration
- [x] Configuration: numeric segmented options (Spoken precision `12.34` / `12.3`) use JetBrains Mono like other numbers; text options stay in Inter.
- [x] Spoken feedback for Get Ready Calibrate: a short "Calibrated" / "Calibration failed" cue, so a pilot standing away from the phone knows the result. → 006-calibration-voice-cue
- [ ] Fit every screen at 360×640, 390×844 and 844×390 without scrolling, and empty `KNOWN_OVERFLOW` in `app/e2e/gallery.spec.ts`: Get Ready and Summary on small phones; Welcome, Summary and the session banners in landscape; the camera-error screens at all sizes. Configuration may keep scrolling.

## Proposed

Review follow-ups the factory adds after each job (from its `followups.md`). `/factory next` skips this
section: move a line up into the list to queue it, or delete it.

- [ ] Summary screen has no spoken result, though audio is the pilot's main channel; a short cue such as "Best 11.98" after End session. (from 005-end-session-bests)
- [ ] End session dialog still says "N laps will be discarded." although the Summary now shows the results first; reword (e.g. results show next, then are discarded) and update the e2e assertion. (from 005-end-session-bests)
- [ ] SPEC §4.3 has no Summary wireframe, which job 005's spec asked for. (from 005-end-session-bests)
- [ ] TopBar marks `New session` as `aria-current="page"` on Summary, duplicating the screen's own New session button; skip `aria-current` there. (from 005-end-session-bests)
- [ ] Get Ready's Calibrate button and Test & Calibrate repeat the pill button styling; extract a shared `PillButton` if they converge (reviewers judged it acceptable as is). (from 003-get-ready-calibration)
- [ ] Spoken idle warning says "No laps." even when the pilot has already flown laps; reword to e.g. "No laps lately. Pausing in 15 seconds." (review-ux r1/r2, session/laps.ts idleWarning) (from 007-idle-auto-pause)
- [ ] Configuration: grey out or hide "Idle time" when "Pause when idle" is off. (review-ux r1, review-code r2, review-ui r2, Configuration.tsx) (from 007-idle-auto-pause)
- [ ] `reduce(s, e, idle)` takes the saved `idleAutoPause` as a positional arg (default false, so a missed caller silently disables idle); move it into AppState or an event payload if more saved settings need to reach the machine. (review-code r1/r2, machine.ts:119) (from 007-idle-auto-pause)
- [ ] Idle timers use `setTimeout`, which browsers throttle on a locked/backgrounded phone; fine while APP_HIDDEN clears them, but switch to timestamp-based checks if background running is ever allowed. (review-ux r1/r2, app/effects.ts idleWatch) (from 007-idle-auto-pause)
- [ ] The compact `short:` landscape Banner layout (icon hidden, one line) applies app-wide; consider limiting it to session-screen banners if other screens' banners fit at full size. (review-ui r1/r2, review-code r2, Banner.tsx:25) (from 007-idle-auto-pause)
- [ ] Idle pause keeps the wake lock, so a forgotten paused session keeps the screen lit indefinitely, which goes against the battery goal; consider releasing the wake lock (or dimming) after a longer paused timeout. (review-security r1 note, own; machine.ts pause()) (from 007-idle-auto-pause)
- [ ] The spoken text hardcodes "15 seconds" while the grace is `IDLE_GRACE_MS` in effects.ts; derive the text from the constant (or test they match) so they can't drift. (own, session/laps.ts + app/effects.ts) (from 007-idle-auto-pause)
- [ ] Visual idle warning: with beep and voice off (or goggles on and muted), nothing warns before the idle pause; consider a brief on-screen hint during the 15 s grace. (review-ux r1 note 2, out of scope in spec) (from 007-idle-auto-pause)
