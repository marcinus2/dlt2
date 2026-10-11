import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, reduce } from '../../app/machine.ts';
import { noopEffects, renderWithStore, testStore } from '../../test/ui.tsx';
import { TAP_GUARD_MS } from '../useTapGuard.ts';
import { Mode } from './Mode.tsx';

function setup() {
  const fx = noopEffects();
  const calls: string[] = [];
  fx.audio.unlock = () => calls.push('audio.unlock');
  fx.camera.start = () => {
    calls.push('camera.start');
    return new Promise(() => {});
  };
  const store = testStore({ effects: fx, state: reduce(initialState, { type: 'GET_READY' }).state });
  renderWithStore(<Mode />, store);
  return { store, calls };
}

const button = (name: string) => screen.getByRole('button', { name });

describe('Mode screen (AC5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the heading, both choices with captions, and focuses Best lap', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Choose mode' })).toBeTruthy();
    expect(button('Best lap').getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Fastest single lap')).toBeTruthy();
    expect(screen.getByText('Fastest 3 laps in a row')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Best 3 laps', description: 'Fastest 3 laps in a row' }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(button('Best lap'));
    expect(screen.getByRole('button', { name: 'New session' }).getAttribute('aria-current')).toBe('page');
  });

  it('ignores taps for 300 ms after mount', () => {
    const { store, calls } = setup();
    expect(button('Best 3 laps').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button('Best 3 laps'));
    expect(store.getState().state.screen).toBe('mode');
    expect(calls).toEqual([]);
    act(() => vi.advanceTimersByTime(TAP_GUARD_MS));
    expect(button('Best 3 laps').getAttribute('aria-disabled')).toBeNull();
  });

  it('Best 3 laps → Get Ready in best3 with the camera starting inside the tap', () => {
    const { store, calls } = setup();
    act(() => vi.advanceTimersByTime(TAP_GUARD_MS));
    fireEvent.click(button('Best 3 laps'));
    expect(store.getState().state).toMatchObject({ screen: 'getReady', mode: 'best3', camera: 'starting' });
    expect(calls).toEqual(['audio.unlock', 'camera.start']);
  });

  it('Best lap → Get Ready in bestLap', () => {
    const { store } = setup();
    act(() => vi.advanceTimersByTime(TAP_GUARD_MS));
    fireEvent.click(button('Best lap'));
    expect(store.getState().state).toMatchObject({ screen: 'getReady', mode: 'bestLap' });
  });
});
