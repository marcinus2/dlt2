import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AppEvent, initialState, reduce } from '../../app/machine.ts';
import { renderWithStore, testStore } from '../../test/ui.tsx';
import { TAP_GUARD_MS } from '../useTapGuard.ts';
import { Summary } from './Summary.tsx';

const pass = (t: number): AppEvent => ({
  type: 'PASS',
  pass: { t: t + 200, startT: t, endT: t + 200, peakT: t + 100, peakRatio: 0.1 },
});

function setup(mode: 'bestLap' | 'best3', lapSecs: number[]) {
  const starts = [0];
  for (const s of lapSecs) starts.push((starts.at(-1) ?? 0) + s * 1000);
  const events: AppEvent[] = [
    { type: 'GET_READY' },
    { type: 'CHOOSE_MODE', mode },
    { type: 'CAMERA_LIVE' },
    { type: 'START' },
    { type: 'ARMED' },
    ...starts.map(pass),
    { type: 'STOP' },
    { type: 'END' },
    { type: 'CONFIRM' },
  ];
  const state = events.reduce((st, e) => reduce(st, e).state, initialState);
  expect(state.screen).toBe('summary');
  return renderWithStore(<Summary />, testStore({ state }));
}

const FIVE = [14.02, 13.4, 11.98, 12.87, 12.34];

describe('Summary screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['bestLap', 'best3'] as const)('shows both bests in %s mode (AC3, AC4)', (mode) => {
    setup(mode, FIVE);
    expect(screen.getByRole('heading', { name: 'Session complete' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Best lap' }).textContent).toContain('11.98');
    expect(screen.getByRole('region', { name: 'Best lap' }).textContent).toContain('Lap 3');
    const b3 = screen.getByRole('region', { name: 'Best 3 laps' });
    expect(b3.textContent).toContain('37.19');
    expect(b3.textContent).toContain('Laps 3–5');
    expect(screen.getByText('5 laps')).toBeTruthy();
  });

  it('two laps: best lap set, best 3 shows --.-- (AC4)', () => {
    setup('best3', [14.02, 13.4]);
    expect(screen.getByRole('region', { name: 'Best lap' }).textContent).toContain('13.40');
    const b3 = screen.getByRole('region', { name: 'Best 3 laps' });
    expect(b3.textContent).toContain('--.--');
    expect(b3.textContent).toContain('Needs 3 laps in a row');
  });

  it('New session is guarded for 300 ms, then opens Welcome (AC5)', () => {
    const { store } = setup('bestLap', FIVE);
    const btn = screen.getAllByRole('button', { name: 'New session' }).at(-1) as HTMLElement;
    fireEvent.click(btn);
    expect(store.getState().state.screen).toBe('summary');
    act(() => vi.advanceTimersByTime(TAP_GUARD_MS));
    fireEvent.click(btn);
    expect(store.getState().state).toMatchObject({ screen: 'welcome', session: null });
  });
});
