// Lap semantics (spec §3.3). Pure.
import type { Ms, VoicePrecision } from '../engine/types.ts';
import type { Cue, Lap, SessionData, SessionMode } from './types.ts';

export function newSession(mode: SessionMode = 'bestLap'): SessionData {
  return {
    mode,
    laps: [],
    bestIdx: null,
    best3: null,
    runStart: 0,
    timing: { kind: 'standby' },
    phase: 'arming',
  };
}

/** "Has data" guard for the leave/end confirmations (spec §3.2). */
export function hasData(s: SessionData | null): boolean {
  return s !== null && (s.laps.length > 0 || s.timing.kind === 'running');
}

export interface PassResult {
  session: SessionData;
  cue: 'go' | 'lap' | 'best';
  /** This lap closed a new fastest 3-lap window. */
  best3: boolean;
}

/**
 * Accepted pass at `t` (backdated startT). standby → running (no lap, "go");
 * running → append lap (`lap` or `best`) and check the 3-lap window ending at it (O(1)).
 */
export function applyPass(s: SessionData, t: Ms): PassResult {
  if (s.timing.kind === 'standby') {
    return { session: { ...s, timing: { kind: 'running', refT: t } }, cue: 'go', best3: false };
  }
  const lap: Lap = { n: s.laps.length + 1, ms: t - s.timing.refT, at: t };
  const laps = [...s.laps, lap];
  const prevBest = s.bestIdx === null ? undefined : s.laps[s.bestIdx];
  // Strictly smaller: ties keep the earlier lap.
  const isBest = prevBest === undefined || lap.ms < prevBest.ms;
  // Strictly smaller: ties keep the earlier window.
  const win = window3(laps, s.runStart);
  const isBest3 = win !== null && (s.best3 === null || win.ms < s.best3.ms);
  return {
    session: {
      ...s,
      laps,
      bestIdx: isBest ? laps.length - 1 : s.bestIdx,
      best3: isBest3 ? win : s.best3,
      timing: { kind: 'running', refT: t },
    },
    cue: isBest ? 'best' : 'lap',
    best3: isBest3,
  };
}

/** The 3 laps ending at the latest one, if all were flown since `runStart`. */
function window3(laps: Lap[], runStart: number): { idx: number; ms: Ms } | null {
  const n = laps.length;
  if (n - runStart < 3) return null;
  const ms = (laps[n - 3]?.ms ?? 0) + (laps[n - 2]?.ms ?? 0) + (laps[n - 1]?.ms ?? 0);
  return { idx: n - 3, ms };
}

/** STOP: the in-progress lap is dropped, laps are kept; the next 3-lap window starts after the pause. */
export function stop(s: SessionData): SessionData {
  if (s.timing.kind === 'standby') {
    return s.runStart === s.laps.length ? s : { ...s, runStart: s.laps.length };
  }
  return { ...s, timing: { kind: 'standby' }, runStart: s.laps.length };
}

function split(ms: Ms): { min: number; sec: number; cs: number } {
  const totalCs = Math.round(ms / 10);
  return { min: Math.floor(totalCs / 6000), sec: Math.floor(totalCs / 100) % 60, cs: totalCs % 100 };
}

/** `ss.cc` below 60 s, `m:ss.cc` above; rounded to 10 ms. */
export function formatLap(ms: Ms): string {
  const { min, sec, cs } = split(ms);
  const cc = String(cs).padStart(2, '0');
  return min === 0 ? `${sec}.${cc}` : `${min}:${String(sec).padStart(2, '0')}.${cc}`;
}

/** Tenths round the displayed centiseconds half up, so 12.35 on screen is heard as 12.4. */
function spokenTime(ms: Ms, precision: VoicePrecision): string {
  if (precision === 'hundredths') {
    const { min, sec, cs } = split(ms);
    return minutes(min, `${sec}.${String(cs).padStart(2, '0')}`);
  }
  const totalDs = Math.floor((Math.round(ms / 10) + 5) / 10);
  return minutes(Math.floor(totalDs / 600), `${Math.floor(totalDs / 10) % 60}.${totalDs % 10}`);
}

function minutes(min: number, s: string): string {
  return min === 0 ? s : `${min} ${min === 1 ? 'minute' : 'minutes'} ${s}`;
}

/** Spoken phrase per cue (D9). `armed` is a tone only. `totalMs` is the 3-lap total of `best3`. */
export function speechText(
  cue: Cue,
  lapMs?: Ms,
  precision: VoicePrecision = 'hundredths',
  totalMs?: Ms,
): string {
  switch (cue) {
    case 'go':
      return 'Go';
    case 'paused':
      return 'Paused';
    case 'idleWarning':
      return 'No laps. Pausing in 15 seconds.';
    case 'calibrated':
      return 'Calibrated';
    case 'calibrationFailed':
      return 'Calibration failed';
    case 'lap':
      return lapMs === undefined ? '' : spokenTime(lapMs, precision);
    case 'best':
      return lapMs === undefined ? '' : `Best, ${spokenTime(lapMs, precision)}`;
    case 'best3':
      if (lapMs === undefined) return '';
      return totalMs === undefined
        ? spokenTime(lapMs, precision)
        : `${spokenTime(lapMs, precision)}, best three, ${spokenTime(totalMs, precision)}`;
    case 'armed':
      return '';
  }
}
