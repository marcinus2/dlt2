import { describe, expect, it } from 'vitest';
import { playTone, TONES } from './cues.ts';

describe('TONES.armed', () => {
  it('is a 440 Hz 200 ms tone at gain 0.5', () => {
    expect(TONES.armed).toEqual({ from: 440, to: 440, ms: 200, gain: 0.5 });
  });

  it('is the loudest cue, at least 4× the old 0.1', () => {
    const others = [TONES.go, TONES.lap, TONES.best, TONES.paused].map((t) => t.gain);
    expect(TONES.armed.gain).toBeGreaterThanOrEqual(Math.max(...others));
    expect(TONES.armed.gain).toBeGreaterThanOrEqual(0.4);
  });

  it('stays short and cannot clip', () => {
    expect(TONES.armed.gain).toBeLessThanOrEqual(1);
    expect(TONES.armed.ms).toBeLessThanOrEqual(250);
  });

  it('leaves the other cues unchanged', () => {
    expect(TONES.go).toEqual({ from: 660, to: 990, ms: 180, gain: 0.2 });
    expect(TONES.lap).toEqual({ from: 880, to: 880, ms: 60, gain: 0.2 });
    expect(TONES.best).toEqual({ from: 880, to: 880, ms: 60, gain: 0.2 });
    expect(TONES.paused).toEqual({ from: 990, to: 495, ms: 300, gain: 0.2 });
  });
});

describe('calibration tones', () => {
  it('rise on success, fall on failure, loud', () => {
    expect(TONES.calibrated).toEqual({ from: 660, to: 990, ms: 180, gain: 0.5 });
    expect(TONES.calibrationFailed).toEqual({ from: 495, to: 330, ms: 300, gain: 0.5 });
  });
});

function fakeContext() {
  const log: string[] = [];
  const param = (name: string) => ({
    setValueAtTime: (v: number, t: number) => log.push(`${name}.set ${v} @${t}`),
    linearRampToValueAtTime: (v: number, t: number) => log.push(`${name}.linear ${v} @${t}`),
    exponentialRampToValueAtTime: (v: number, t: number) => log.push(`${name}.exp ${v} @${t}`),
  });
  const node = { connect: (n: unknown) => n };
  const ctx = {
    currentTime: 0,
    destination: {},
    createOscillator: () => ({
      ...node,
      frequency: param('freq'),
      start: (t: number) => log.push(`start @${t}`),
      stop: (t: number) => log.push(`stop @${t}`),
    }),
    createGain: () => ({ ...node, gain: param('gain') }),
  };
  return { ctx: ctx as unknown as AudioContext, log };
}

describe('playTone', () => {
  it('armed: ramps to 0.5 after the 5 ms attack, stops at t0 + 0.2 s', () => {
    const { ctx, log } = fakeContext();
    playTone(ctx, TONES.armed);
    expect(log).toEqual([
      'freq.set 440 @0',
      'gain.set 0 @0',
      'gain.linear 0.5 @0.005',
      'gain.linear 0 @0.2',
      'start @0',
      'stop @0.2',
    ]);
  });
});
