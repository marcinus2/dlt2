import { useEffect, useId, useRef } from 'react';
import type { SessionMode } from '../../session/types.ts';
import { ActionButton } from '../components/ActionBar.tsx';
import { TopBar } from '../components/TopBar.tsx';
import { useApp } from '../store.tsx';

const MODES: { mode: SessionMode; label: string; caption: string }[] = [
  { mode: 'bestLap', label: 'Best lap', caption: 'Fastest single lap' },
  { mode: 'best3', label: 'Best 3 laps', caption: 'Fastest 3 laps in a row' },
];

/** Mode (spec §3.1): what the session headlines. The choice tap starts the camera (gesture-bound). */
export function Mode() {
  const dispatch = useApp((s) => s.dispatch);
  const id = useId();
  const choices = useRef<HTMLDivElement>(null);
  useEffect(() => {
    choices.current?.querySelector('button')?.focus();
  }, []);

  return (
    <>
      <TopBar />
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center gap-8 px-safe py-8 short:gap-4 short:py-4">
        <h1 className="text-center text-sm font-bold tracking-[0.2em] text-text-muted uppercase">
          Choose mode
        </h1>
        <div
          ref={choices}
          className="flex flex-col gap-6 md:flex-row md:gap-4 landscape:flex-row landscape:gap-4"
        >
          {MODES.map(({ mode, label, caption }) => (
            <div key={mode} className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex min-h-28">
                <ActionButton
                  label={label}
                  tone="accent"
                  describedBy={`${id}-${mode}`}
                  onPress={() => dispatch({ type: 'CHOOSE_MODE', mode })}
                />
              </div>
              <p id={`${id}-${mode}`} className="text-center text-text-muted">
                {caption}
              </p>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
