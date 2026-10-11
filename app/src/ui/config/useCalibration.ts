// Calibrate loop shared by Test & calibrate (writes the draft) and Get Ready (saves). Feeds engine
// samples to the calibrator; the progress bar is written through a ref on rAF, never React state.
import { useEffect, useRef, useState } from 'react';
import { type Calibration, createCalibrator } from '../../engine/calibration.ts';
import { field, type RatioField, type SettingKey } from '../../settings/schema.ts';
import { useApp } from '../store.tsx';

export type CalibrationOutcome = { kind: 'done'; c: Calibration } | { kind: 'failed' } | null;
export interface Ratios {
  startRatio: number;
  endRatio: number;
}

export const pct = (v: number) => `${+(v * 100).toPrecision(3)}%`;

/** Calibrated ratio → the field's range, 3 significant digits. */
export function fitRatio(key: SettingKey, v: number): number {
  const f = field(key) as RatioField;
  return Number(Math.min(f.max, Math.max(f.min, v)).toPrecision(3));
}

/**
 * Runs while `running` and `live`; losing `live` or unmounting cancels it. `onResult` gets the
 * fitted ratios (end ≤ start) on success; nothing is written on failure or cancel.
 */
export function useCalibration(opts: {
  live: boolean;
  durationMs: number;
  k: number;
  onResult: (r: Ratios) => void;
  /** No usable frames (not on cancel). */
  onFail?: () => void;
}) {
  const { live, durationMs, k } = opts;
  const onSample = useApp((s) => s.onSample);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<CalibrationOutcome>(null);
  const progress = useRef<HTMLDivElement>(null);
  const onResult = useRef(opts.onResult);
  onResult.current = opts.onResult;
  const onFail = useRef(opts.onFail);
  onFail.current = opts.onFail;

  useEffect(() => {
    if (!running || !live) {
      setRunning(false);
      return;
    }
    const calibrator = createCalibrator(durationMs, k);
    let p = 0;
    let raf = 0;
    const off = onSample((x) => {
      const step = calibrator.add(x.t, x.ratio, x.global);
      if (!step.done) {
        p = step.progress;
        return;
      }
      off();
      setRunning(false);
      if (!step.result) {
        onFail.current?.();
        return setOutcome({ kind: 'failed' });
      }
      const startRatio = fitRatio('detection.startRatio', step.result.startRatio);
      const endRatio = Math.min(startRatio, fitRatio('detection.endRatio', step.result.endRatio));
      onResult.current({ startRatio, endRatio });
      setOutcome({ kind: 'done', c: { ...step.result, startRatio, endRatio } });
    });
    const draw = () => {
      // `scale`, not `transform`: the bar's `scale-x-0` class sets the `scale` property (Tailwind v4).
      if (progress.current) progress.current.style.scale = `${p} 1`;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [running, live, durationMs, k, onSample]);

  return {
    running,
    outcome,
    /** Attach to the progress bar's fill. */
    progress,
    /** Calibrate ↔ Cancel; clears the last outcome. */
    toggle() {
      setOutcome(null);
      setRunning(!running);
    },
  };
}
