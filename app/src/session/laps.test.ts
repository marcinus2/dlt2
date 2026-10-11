import { describe, expect, it } from 'vitest';
import { applyPass, formatLap, hasData, newSession, speechText, stop } from './laps.ts';
import type { SessionData } from './types.ts';

function passes(s: SessionData, ...ts: number[]): SessionData {
  return ts.reduce((acc, t) => applyPass(acc, t).session, s);
}

describe('applyPass', () => {
  it('first pass starts the reference without a lap and says go', () => {
    const { session, cue } = applyPass(newSession(), 1000);
    expect(cue).toBe('go');
    expect(session.laps).toEqual([]);
    expect(session.timing).toEqual({ kind: 'running', refT: 1000 });
  });

  it('later passes record laps from the previous pass', () => {
    const s = passes(newSession(), 1000, 13340, 25000);
    expect(s.laps).toEqual([
      { n: 1, ms: 12340, at: 13340 },
      { n: 2, ms: 11660, at: 25000 },
    ]);
    expect(s.timing).toEqual({ kind: 'running', refT: 25000 });
  });

  it('marks the first lap and every faster lap as best', () => {
    let s = passes(newSession(), 0);
    let r = applyPass(s, 12000);
    expect(r.cue).toBe('best');
    s = r.session;
    r = applyPass(s, 25000); // 13 s
    expect(r.cue).toBe('lap');
    expect(r.session.bestIdx).toBe(0);
    r = applyPass(r.session, 36000); // 11 s
    expect(r.cue).toBe('best');
    expect(r.session.bestIdx).toBe(2);
  });

  it('ties keep the earlier lap as best', () => {
    const r = applyPass(passes(newSession(), 0, 10000), 20000);
    expect(r.cue).toBe('lap');
    expect(r.session.bestIdx).toBe(0);
  });

  it('does not mutate the input', () => {
    const s = passes(newSession(), 0, 10000);
    const before = structuredClone(s);
    applyPass(s, 20000);
    expect(s).toEqual(before);
  });
});

/** Session from a list of lap times (ms), starting at t = 0. */
function lapsOf(s: SessionData, ...ms: number[]): SessionData {
  let t = s.timing.kind === 'running' ? s.timing.refT : 0;
  let acc = s.timing.kind === 'running' ? s : applyPass(s, t).session;
  for (const m of ms) {
    t += m;
    acc = applyPass(acc, t).session;
  }
  return acc;
}

describe('best 3 consecutive (AC3)', () => {
  it('newSession takes the mode; bestLap by default; no window yet', () => {
    expect(newSession()).toMatchObject({ mode: 'bestLap', best3: null, runStart: 0 });
    expect(newSession('best3').mode).toBe('best3');
  });

  it('tracks the fastest window: 14.02 13.40 11.98 12.87 12.34 → idx 2, 37.19', () => {
    const s = lapsOf(newSession('best3'), 14020, 13400, 11980, 12870, 12340);
    expect(s.best3).toEqual({ idx: 2, ms: 37190 });
  });

  it('no window before 3 laps', () => {
    expect(lapsOf(newSession(), 10000, 10000).best3).toBeNull();
  });

  it('the flag is true only on the lap that sets a new best window', () => {
    let s = applyPass(newSession(), 0).session;
    const flags: boolean[] = [];
    let t = 0;
    for (const ms of [14020, 13400, 11980, 12870, 12340, 15000]) {
      t += ms;
      const r = applyPass(s, t);
      flags.push(r.best3);
      s = r.session;
    }
    // Windows: 39.40 (new), 38.25 (new), 37.19 (new), 40.21 (no).
    expect(flags).toEqual([false, false, true, true, true, false]);
    expect(applyPass(newSession(), 0).best3).toBe(false); // go
  });

  it('ties keep the earlier window', () => {
    const s = lapsOf(newSession(), 10000, 11000, 12000); // 33.00 at idx 0, ref at 33000
    const r = applyPass(s, 43000); // 11 + 12 + 10 = 33.00
    expect(r.best3).toBe(false);
    expect(r.session.best3).toEqual({ idx: 0, ms: 33000 });
  });

  it('a window never spans a pause: 2 laps, stop, 1 lap → no best 3', () => {
    const paused = stop(lapsOf(newSession(), 10000, 10000));
    expect(paused.runStart).toBe(2);
    const after = lapsOf(paused, 10000); // go, then one lap
    expect(after.laps).toHaveLength(3);
    expect(after.best3).toBeNull();
    expect(lapsOf(after, 10000, 10000).best3).toEqual({ idx: 2, ms: 30000 });
  });

  it('stop in standby still moves runStart to the end', () => {
    const s = stop(stop(lapsOf(newSession(), 10000, 10000, 10000)));
    expect(s.runStart).toBe(3);
    expect(s.best3).toEqual({ idx: 0, ms: 30000 }); // kept while paused
    const standby = { ...s, runStart: 0 };
    expect(stop(standby).runStart).toBe(3);
  });

  it('keeps the mode across stop', () => {
    expect(stop(lapsOf(newSession('best3'), 10000)).mode).toBe('best3');
  });
});

describe('stop / continue boundary', () => {
  it('drops the in-progress lap and keeps laps', () => {
    const s = stop(passes(newSession(), 0, 10000));
    expect(s.timing).toEqual({ kind: 'standby' });
    expect(s.laps).toHaveLength(1);
  });

  it('no lap spans a pause: the first pass after it only sets the reference', () => {
    const paused = stop(passes(newSession(), 0, 10000, 15000)); // 2 laps, lap 3 dropped
    const first = applyPass(paused, 100000);
    expect(first.cue).toBe('go');
    expect(first.session.laps).toHaveLength(2);
    const second = applyPass(first.session, 112000);
    expect(second.session.laps.at(-1)).toEqual({ n: 3, ms: 12000, at: 112000 });
  });

  it('stop in standby is a no-op', () => {
    const s = newSession();
    expect(stop(s)).toBe(s);
  });
});

describe('hasData', () => {
  it('is true with laps or running timing', () => {
    expect(hasData(null)).toBe(false);
    expect(hasData(newSession())).toBe(false);
    expect(hasData(passes(newSession(), 0))).toBe(true);
    expect(hasData(stop(passes(newSession(), 0, 5000)))).toBe(true);
    expect(hasData(stop(passes(newSession(), 0)))).toBe(false);
  });
});

describe('formatLap', () => {
  it.each([
    [0, '0.00'],
    [1234, '1.23'],
    [12340, '12.34'],
    [12345, '12.35'],
    [12344.9, '12.34'],
    [59990, '59.99'],
    [59994, '59.99'],
    [59995, '1:00.00'],
    [60000, '1:00.00'],
    [65340, '1:05.34'],
    [125004, '2:05.00'],
    [3600000, '60:00.00'],
  ])('%d ms → %s', (ms, text) => {
    expect(formatLap(ms)).toBe(text);
  });
});

describe('speechText', () => {
  it.each([
    ['go', undefined, 'Go'],
    ['paused', undefined, 'Paused'],
    ['calibrated', undefined, 'Calibrated'],
    ['calibrationFailed', undefined, 'Calibration failed'],
    ['armed', undefined, ''],
    ['lap', 12340, '12.34'],
    ['best', 12340, 'Best, 12.34'],
    ['lap', 65340, '1 minute 5.34'],
    ['best', 59995, 'Best, 1 minute 0.00'],
    ['lap', 125000, '2 minutes 5.00'],
    ['lap', undefined, ''],
    ['best', undefined, ''],
    ['best3', undefined, ''],
  ] as const)('%s %s → %s', (cue, ms, text) => {
    expect(speechText(cue, ms)).toBe(text);
    expect(speechText(cue, ms, 'hundredths')).toBe(text);
  });

  it.each([
    ['go', undefined, 'Go'],
    ['paused', undefined, 'Paused'],
    ['calibrated', undefined, 'Calibrated'],
    ['calibrationFailed', undefined, 'Calibration failed'],
    ['armed', undefined, ''],
    ['lap', 12340, '12.3'],
    ['best', 12340, 'Best, 12.3'],
    ['lap', 12345, '12.4'], // shown 12.35, rounded half up
    ['lap', 12349, '12.4'], // shown 12.35 (rounding the raw ms would give 12.3)
    ['lap', 12344, '12.3'], // shown 12.34
    ['lap', 65340, '1 minute 5.3'],
    ['best', 59950, 'Best, 1 minute 0.0'],
    ['lap', 125000, '2 minutes 5.0'],
    ['lap', 12000, '12.0'],
    ['lap', undefined, ''],
  ] as const)('tenths: %s %s → %s', (cue, ms, text) => {
    expect(speechText(cue, ms, 'tenths')).toBe(text);
  });

  it('best3: lap, "best three", total; precision applies to both (AC4)', () => {
    expect(speechText('best3', 12340, 'hundredths', 36120)).toBe('12.34, best three, 36.12');
    expect(speechText('best3', 12340, 'tenths', 36120)).toBe('12.3, best three, 36.1');
    expect(speechText('best3', 20000, 'hundredths', 60120)).toBe('20.00, best three, 1 minute 0.12');
    expect(speechText('best3', 12340, 'hundredths')).toBe('12.34'); // no total → plain lap
  });
});
