import type { Ms } from '../engine/types.ts';

export interface Lap {
  n: number; // starts at 1
  ms: Ms;
  at: Ms; // pass.startT
}
/** Headline of a session: fastest single lap, or fastest 3 consecutive laps. */
export type SessionMode = 'bestLap' | 'best3';
export type Timing = { kind: 'standby' } | { kind: 'running'; refT: Ms };
export interface SessionData {
  mode: SessionMode;
  laps: Lap[];
  bestIdx: number | null;
  /** Fastest 3 consecutive laps: `idx` = first lap of the window. Tracked in both modes. */
  best3: { idx: number; ms: Ms } | null;
  /** Index of the first lap since the last pause; a window never spans a pause. */
  runStart: number;
  timing: Timing;
  phase: 'arming' | 'ready';
}
export type Cue =
  | 'armed'
  | 'go'
  | 'lap'
  | 'best'
  | 'best3'
  | 'paused'
  | 'idleWarning'
  | 'calibrated'
  | 'calibrationFailed';
