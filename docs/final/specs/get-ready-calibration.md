# Get Ready preview modes and Calibrate

> Request: lets do calibration should be easier to access. maybe get ready screen with preview from backlog
> (backlog: "Get ready screen: live camera preview, switchable between live and difference view, to help position
> the phone and debug detection." and "Make calibration easier to reach, e.g. from the Get ready preview.")

## Goal
Today, the only way to calibrate is Configuration › Test & calibrate › Start test › Calibrate › Save. After that the
pilot goes back to Welcome and then Get Ready. The pixel diff view only exists behind `?debug=1`. This job puts both on
Get Ready, where the phone is already in place: a **Live / Difference** preview toggle and a **Calibrate** button
that saves its result immediately.
Reading: Calibrate on Get Ready uses and writes the **saved** settings, with no draft and no Save step, because Get Ready
always runs on saved settings. The preview mode is screen state only, not a setting.

## Behaviour
- **Preview toggle.** Below the preview, next to the health line, add a segmented control labelled `Preview` with
  `Live` and `Difference`. It reuses `SegmentGroup` from `SettingField.tsx` (export it). The default is `Live` every time
  Get Ready opens. It is component state, with no new `dronelap.` key and no schema change.
  - `Live`: the current Get Ready preview (CameraLayer + RoiOverlay + pass flash), unchanged.
  - `Difference`: the same box shows the `DiffView` canvas of the processed region. Pixels that changed by more
    than `detection.pixelDiffThreshold` (saved) are drawn in accent; the rest are dimmed luma. It is mirrored for the front camera,
    like the live view. Only the detection region is shown, at processing resolution. Caption under it (`text-muted`):
    `Highlighted: pixels that changed. Only the detection region is shown.`
    The video element goes back to `CameraHost` while the canvas is shown. The camera and engine keep running.
  - Before the first two processed frames, the canvas stays blank (`luma().valid` is false).
  - Sim mode (`?sim=1`) has no analyzer. Difference shows the text `Difference view needs the real camera.` in the box instead.
  - Camera starting or error: the toggle is disabled, and the error card and spinner work as today.
- **Calibrate.** In the same row, add an accent-outline pill button `Calibrate` (Crosshair icon), as in Test & calibrate.
  Next to it: `Keep the scene empty for {durationMs/1000} s.` (from saved `calibration.durationMs`).
  It is enabled only when `state.camera === 'live'`.
  - Tapping it runs `createCalibrator(saved.calibration.durationMs, saved.calibration.k)` over `onSample`, which is the same loop as
    Test & calibrate. The button label becomes `Cancel`, and a status shows `Calibrating — keep the scene still…` with a
    progress bar. The bar and progress are written through refs on rAF, never as React state per frame.
  - On success, the ratios are clamped with `fitRatio` (end ≤ start), **saved and applied to the running engine right away**.
    Status: `Calibrated and saved: start {pct} · end {pct}.` If `hint` is set, add a warn line:
    `Idle noise is high: check the lighting, exposure and region.`
  - On failure (no usable frames): `Calibration failed: no usable frames. Try again.` (warn). Nothing changes.
  - Cancel, START, nav, APP_HIDDEN or a camera loss during the run cancel it (the hook unmounts or `live` drops)
    and change nothing.
  - Passes during calibration still flash the ROI. Calibration works in both preview modes.
  - The storage write can fail. Then the existing `STORAGE_TOAST` shows, and the values still apply for this run (as with Save).
  - In sim mode, SimEngine samples drive the calibrator, so Calibrate works and saves as on a real camera.
- **Plumbing (machine → store → UI):**
  - Machine: a new event `CALIBRATED`. On `getReady` with `camera === 'live'`, it keeps the state and emits
    `[{ type: 'settings.commit' }, { type: 'engine.update' }]`. Every other state or camera ignores it.
  - Effect `engine.update` → `fx.engine.update(host.saved().detection)` (it runs after commit, so it sees the new values).
  - Store: `applyCalibration(values: { startRatio; endRatio })`. It is a no-op unless `screen === 'getReady'` and the
    camera is live. Otherwise it calls `setDraftValues` with `detection.startRatio`/`endRatio`, then `dispatch({ type: 'CALIBRATED' })`.
    The `CONFIG_CHANGED` that this dispatches is ignored on Get Ready. On Get Ready, draft equals saved, so the commit writes only these two fields.
  - Store: `luma(): Readonly<LumaPair> | null` returns `fx.diag?.analyzer.luma() ?? null` (null in sim). The UI never
    touches `engine/browser`.
- Extract the calibration loop from `TestCalibrate.tsx` `Calibrate` (calibrator, progress ref, outcome, `fitRatio`)
  into a shared hook `ui/config/useCalibration.ts`. Test & calibrate behaves exactly as today: it writes the draft, and the user saves.

## Acceptance criteria
- **AC1**: `reduce(getReadyLive, { type: 'CALIBRATED' })` returns the same state with effects
  `[settings.commit, engine.update]`. In getReady with camera `starting`/`off`/error, and on welcome, session,
  paused and config, it is ignored (no state change, no effects).
- **AC2**: On Get Ready with a live camera, `store.applyCalibration({ startRatio: 0.031, endRatio: 0.015 })` sets
  `saved.detection` and `draft.detection` to those ratios, persists them to `dronelap.settings.v2`, and calls
  `engine.update` with the new detection settings. Off Get Ready, or with the camera not live, nothing changes.
- **AC3**: Get Ready shows the `Preview` toggle with `Live` (selected by default) and `Difference`, and a `Calibrate`
  button. The toggle and Calibrate are disabled until the camera is live.
- **AC4**: Choosing `Difference` replaces the camera layer with the diff canvas (`role="img"`, name
  `Diff view of the processed region`) and the caption. Choosing `Live` brings back the video and ROI overlay. The camera
  and engine are not restarted (no `camera.start`/`engine.start` effects). In sim mode, Difference shows
  `Difference view needs the real camera.`
- **AC5**: Calibrate on Get Ready shows progress, then `Calibrated and saved: …`. The new start ratio survives a reload and
  appears in Configuration › Detection without pressing Save. Cancel leaves the settings unchanged.
- **AC6**: Configuration › Test & calibrate › Calibrate still writes only the draft (`Save to keep them.`), using the shared hook.
- **AC7**: `npm run size` stays ≤ 130 KB gz initial JS (DiffView is lazy-loaded on first Difference), and lint, typecheck and tests are green.

## Out of scope
- Showing the preview or diff during Session/Paused.
- A ratio meter on Get Ready. Changing ROI, threshold or camera from Get Ready.
- Persisting the preview mode, or adding a setting for it.
- Diff of the full frame (outside the ROI). A pass flash on the diff canvas.
- Changing calibration math, `calibration.*` settings, or Test & calibrate's draft/Save flow.

## Touches
- `app/src/app/machine.ts`: `CALIBRATED` event and `engine.update` effect. Stays pure.
- `app/src/app/effects.ts`: run `engine.update` with `host.saved().detection`.
- `app/src/app/store.ts`: `applyCalibration`, `luma`. The `LumaPair` type comes via `app/diagnostics.ts` (type-only re-export).
- `app/src/ui/screens/GetReady.tsx`: toggle row, Calibrate, lazy `DiffView`.
- `app/src/ui/debug/DiffView.tsx`: add `className` (and `mirrored`) props so it can fill the preview box. Diagnostics keeps working.
- `app/src/ui/config/useCalibration.ts` (new) and `TestCalibrate.tsx` (use the hook).
- `app/src/ui/components/SettingField.tsx`: export `SegmentGroup`.
- Boundaries: `ui/` must not import `engine/browser` or `sim/`, so `luma` goes through the store. `machine.ts` has no React.
  There is no per-frame allocation (DiffView already reuses its `ImageData`) and no per-frame React state. Colours come only from tokens.
- Docs: SPEC §3.1 Get Ready row, the §3.2 transition table (`GetReady | CALIBRATED | camera live | stays | settings.commit, engine.update`),
  the §4.3 Get Ready wireframe, and a D3 note. Copy this spec to `docs/final/specs/get-ready-calibration.md`, then tick both items in
  `docs/final/backlog.md` and link the spec there.

## Test plan
- **AC1**: Vitest in `app/machine.test.ts`. Use `it.each` over the states listed and assert the effects/no-op.
- **AC2**: Vitest in `app/store.test.ts` with fake effects. Drive GET_READY → CAMERA_LIVE, call `applyCalibration`, and assert
  `saved`, `draft`, the storage payload and the `engine.update` spy. Repeat on welcome and with the camera starting, and assert nothing changes.
- **AC3/AC4**: Testing Library `ui/screens/GetReady.test.tsx` (new, `src/test/ui.tsx`). Check the controls are disabled while starting
  and enabled when live. Toggle Difference and find the canvas by role/name (store `luma` stubbed), then toggle back to find the video slot.
  With `luma` returning null (sim), find the placeholder text. Assert no camera/engine start calls on toggle.
- **AC5**: Playwright `e2e/session.spec.ts` (`?sim=1`). Get ready → Calibrate → `calibration-result` contains
  `Calibrated and saved`. Read `dronelap.settings.v2` and expect `startRatio` ≠ 0.02 (the default). Reload, open Configuration, and
  see the new value. A second run with Cancel leaves the stored value unchanged.
- **AC4 (real)**: Playwright `e2e/session-real.spec.ts` (fake camera clip). Switch to Difference and expect the canvas width to be > 1
  within the wait. Switch back to Live and START still works.
- **AC6**: The existing `ui/config/TestCalibrate.test.tsx` and the `e2e/config.spec.ts` Test & calibrate test pass unchanged.
- **AC7**: CI `npm run size`, `lint`, `typecheck`, `test`.
- Manual: on a phone at the gate, switch to Difference, wave a hand and see highlighted pixels. Then Calibrate, START, and fly a lap.
