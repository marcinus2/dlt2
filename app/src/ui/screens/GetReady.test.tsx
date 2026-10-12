import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Effects } from '../../app/effects.ts';
import { type AppEvent, initialState, reduce } from '../../app/machine.ts';
import type { DetectionSettings, MotionSample } from '../../engine/types.ts';
import { DEFAULTS } from '../../settings/schema.ts';
import { createSettingsStorage, memoryBackend, SETTINGS_KEY } from '../../settings/storage.ts';
import { noopEffects, renderWithStore, testStore } from '../../test/ui.tsx';
import { GetReady } from './GetReady.tsx';

const CHOOSE: AppEvent = { type: 'CHOOSE_MODE', mode: 'bestLap' };
const at = (...events: AppEvent[]) => events.reduce((s, e) => reduce(s, e).state, initialState);

const pair = { latest: new Uint8Array(4), previous: new Uint8Array(4), width: 2, height: 2, valid: true };

function setup({ live = true, sim = false } = {}) {
  const fx = noopEffects();
  const backend = memoryBackend();
  fx.settings = createSettingsStorage(backend);
  const calls: string[] = [];
  const updated: DetectionSettings[] = [];
  const listeners = new Set<(x: MotionSample) => void>();
  fx.engine.on = ((e: string, cb: (x: MotionSample) => void) => {
    if (e !== 'sample') return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
  }) as typeof fx.engine.on;
  fx.engine.start = () => calls.push('engine.start');
  fx.engine.update = (s) => updated.push(s);
  const start = fx.camera.start;
  fx.camera.start = () => {
    calls.push('camera.start');
    return start();
  };
  // A real pipeline exposes the analyzer; sim has none.
  if (!sim) fx.diag = { analyzer: { luma: () => pair } } as unknown as NonNullable<Effects['diag']>;
  const cues: string[] = [];
  fx.audio.cue = ((c: string) => {
    cues.push(c);
    return { tone: null, text: '' };
  }) as typeof fx.audio.cue;
  const store = testStore({
    effects: fx,
    state: at({ type: 'GET_READY' }, CHOOSE, ...(live ? [{ type: 'CAMERA_LIVE' } as const] : [])),
  });
  renderWithStore(<GetReady />, store);
  const emit = (t: number, ratio: number, global = false) =>
    act(() => {
      for (const cb of [...listeners]) cb({ t, ratio, globalRatio: 0, global, gapReset: false });
    });
  const stored = () => JSON.parse(backend.getItem(SETTINGS_KEY) ?? 'null');
  return { store, cues, calls, updated, emit, listeners, stored };
}

const previewGroup = () => screen.getByRole('group', { name: 'Preview' }) as HTMLFieldSetElement;
const calibrateButton = () => screen.getByRole('button', { name: 'Calibrate' }) as HTMLButtonElement;

describe('Get Ready preview and Calibrate', () => {
  it('shows Preview (Live selected) and Calibrate, disabled until the camera is live', () => {
    setup({ live: false });
    expect(previewGroup().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Live' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Difference' }).getAttribute('aria-pressed')).toBe('false');
    expect(calibrateButton().disabled).toBe(true);
    expect(screen.getByText('Keep the scene empty for 3 s.')).toBeTruthy();
  });

  it('enables the toggle and Calibrate once live', () => {
    setup();
    expect(previewGroup().disabled).toBe(false);
    expect(calibrateButton().disabled).toBe(false);
  });

  it('Difference swaps the video for the diff canvas and back, without restarting camera or engine', async () => {
    const { store, calls } = setup();
    const video = store.getState().video;
    expect(video.isConnected).toBe(true);
    expect(screen.getByTestId('roi')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Difference' }));
    expect(await screen.findByRole('img', { name: 'Diff view of the processed region' })).toBeTruthy();
    expect(
      screen.getByText('Highlighted: pixels that changed. Only the detection region is shown.'),
    ).toBeTruthy();
    expect(screen.getByText('Waiting for frames…')).toBeTruthy(); // no 2D context in happy-dom: nothing drawn
    expect(video.isConnected).toBe(false);
    expect(screen.queryByTestId('roi')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.queryByRole('img', { name: 'Diff view of the processed region' })).toBeNull();
    expect(video.isConnected).toBe(true);
    expect(screen.getByTestId('roi')).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('Difference in sim mode shows a placeholder', () => {
    setup({ sim: true });
    fireEvent.click(screen.getByRole('button', { name: 'Difference' }));
    expect(screen.getByText('Difference view needs the real camera.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Diff view of the processed region' })).toBeNull();
  });

  it('Calibrate saves and applies the result without a Save step', () => {
    const { store, emit, updated, stored, cues } = setup();
    fireEvent.click(calibrateButton());
    expect(screen.getByText('Calibrating — keep the scene still…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.queryByText(/Keep the scene empty/)).toBeNull(); // one status slot
    emit(1000, 0, true); // first frame: excluded
    for (let t = 1033; t < 4000; t += 33) emit(t, t % 2 ? 0.004 : 0.006);
    emit(4000, 0.005);
    const { saved, draft, state } = store.getState();
    expect(saved.detection.startRatio).toBe(0.00997);
    expect(saved.detection.endRatio).toBeCloseTo(0.00997 / 2, 5);
    expect(draft).toEqual(saved);
    expect(state).toMatchObject({ screen: 'getReady', camera: 'live' });
    expect(updated).toEqual([saved.detection]);
    expect(cues).toEqual(['calibrated']);
    expect(stored().detection.startRatio).toBe(0.00997);
    expect(screen.getByTestId('calibration-result').textContent).toMatch(
      /^Calibrated and saved: start 0\.997% · end 0\.4\d+%\.$/,
    );
  });

  it('a failed run (no usable frames) changes nothing', () => {
    const { store, emit, stored, cues } = setup();
    fireEvent.click(calibrateButton());
    emit(0, 0, true);
    emit(3000, 0, true);
    expect(cues).toEqual(['calibrationFailed']);
    expect(screen.getByText('Calibration failed: no usable frames. Try again.')).toBeTruthy();
    expect(store.getState().saved.detection).toEqual(DEFAULTS.detection);
    expect(stored()).toBeNull();
  });

  it('Cancel stops the run and leaves the settings unchanged', () => {
    const { store, emit, listeners, updated, stored, cues } = setup();
    const before = listeners.size;
    fireEvent.click(calibrateButton());
    expect(listeners.size).toBe(before + 1);
    emit(1000, 0.004);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(listeners.size).toBe(before);
    for (let t = 1033; t <= 5000; t += 33) emit(t, 0.004);
    expect(store.getState().saved.detection).toEqual(DEFAULTS.detection);
    expect(updated).toEqual([]);
    expect(stored()).toBeNull();
    expect(screen.queryByTestId('calibration-result')).toBeNull();
    expect(cues).toEqual([]);
  });

  it('losing the live camera mid-run cancels it', () => {
    const { store, emit, updated } = setup();
    fireEvent.click(calibrateButton());
    emit(1000, 0.004);
    act(() => store.getState().dispatch({ type: 'APP_HIDDEN' }));
    expect(screen.queryByText('Calibrating — keep the scene still…')).toBeNull();
    for (let t = 1033; t <= 5000; t += 33) emit(t, 0.004);
    expect(store.getState().saved.detection).toEqual(DEFAULTS.detection);
    expect(updated).toEqual([]);
  });
});
