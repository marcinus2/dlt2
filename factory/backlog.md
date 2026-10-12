# Factory backlog

`/factory next` runs the first unchecked item and marks it `[x] … → <job-id>`.
Items come from [docs/final/backlog.md](../docs/final/backlog.md). One line each; the spec-writer fills in the details.

- [x] Arm beep should be louder. → 001-louder-arm-beep
- [x] Spoken lap time to one decimal place, as a new setting in Configuration (mid-flight the pilot doesn't need hundredths). → 002-spoken-lap-decimal
- [x] After End session, show the best lap and the best 3 consecutive laps. → 005-end-session-bests
- [ ] Idle too long during an active session: voice warning, then switch to Paused to save battery (the drone may need repairs that take more than 2 minutes). The pilot un-pauses manually. The idle time can be changed in Configuration.
- [x] Best 3 consecutive laps mode: after Get ready, a screen with two buttons, Best lap and Best 3 laps. → 004-best-three-consecutive
- [x] Get ready screen: live camera preview, switchable between live and difference view, to help position the phone and debug detection. → 003-get-ready-calibration
- [x] Make calibration easier to reach, e.g. from the Get ready preview. → 003-get-ready-calibration
- [x] Configuration: numeric segmented options (Spoken precision `12.34` / `12.3`) use JetBrains Mono like other numbers; text options stay in Inter.
- [x] Spoken feedback for Get Ready Calibrate: a short "Calibrated" / "Calibration failed" cue, so a pilot standing away from the phone knows the result. → 006-calibration-voice-cue
