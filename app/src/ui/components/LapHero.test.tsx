import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { applyPass, newSession, stop } from '../../session/laps.ts';
import type { SessionData, SessionMode } from '../../session/types.ts';
import { LapHero } from './LapHero.tsx';

/** Session in `mode` from lap times in seconds. */
function session(mode: SessionMode, ...secs: number[]): SessionData {
  let s = applyPass(newSession(mode), 0).session;
  let t = 0;
  for (const sec of secs) {
    t += Math.round(sec * 1000);
    s = applyPass(s, t).session;
  }
  return s;
}

const summary = () => screen.getByTestId('lap-summary').textContent;
const label = () => screen.getByRole('region', { name: 'Latest lap' });
const live = () => label().querySelector('[aria-live]')?.textContent;

describe('LapHero (AC6)', () => {
  it('bestLap mode: Laps · Best, no Best 3 anywhere', () => {
    render(<LapHero session={session('bestLap', 14.02, 13.4, 11.98, 12.87, 12.34)} />);
    expect(summary()).toBe('Laps 5·Best 11.98');
    expect(label().textContent).not.toContain('Best 3');
    expect(live()).toBe('Lap 5, 12.34 seconds');
  });

  it('best3 mode before a window: Best 3 --.--, no badge', () => {
    render(<LapHero session={session('best3', 14.02, 13.4)} />);
    expect(summary()).toBe('Laps 2·Best 3 --.--');
    expect(screen.queryByText('Best 3', { selector: 'span' })).toBeNull();
  });

  it('best3 mode: total in the summary; badge and live text on the lap that set it', () => {
    render(<LapHero session={session('best3', 14.02, 13.4, 11.98, 12.87, 12.34)} />);
    expect(summary()).toBe('Laps 5·Best 3 37.19');
    expect(screen.getByText('Best 3', { selector: 'span' })).toBeTruthy();
    expect(live()).toBe('Lap 5, 12.34 seconds, best 3 laps 37.19');
  });

  it('best3 mode: both badges on a lap that is best and closes the best window', () => {
    render(<LapHero session={session('best3', 14, 13, 12)} />);
    expect(screen.getByText('Best', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('Best 3', { selector: 'span' })).toBeTruthy();
    expect(live()).toBe('Lap 3, 12.00 seconds, best lap, best 3 laps 39.00');
  });

  it('best3 mode: no badge on a lap that did not set the window; paused keeps the total', () => {
    render(<LapHero session={stop(session('best3', 10, 10, 10, 15))} />);
    expect(summary()).toBe('Laps 4·Best 3 30.00');
    expect(screen.queryByText('Best 3', { selector: 'span' })).toBeNull();
  });
});
