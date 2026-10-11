import type { ReactNode } from 'react';
import { formatLap } from '../../session/laps.ts';
import { ActionButton } from '../components/ActionBar.tsx';
import { TopBar } from '../components/TopBar.tsx';
import { lapsText } from '../copy.ts';
import { useApp } from '../store.tsx';

function Stat({
  label,
  value,
  note,
  best,
}: {
  label: string;
  value: string;
  note: ReactNode;
  best?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-6"
    >
      <h2 className="text-sm font-bold tracking-[0.2em] text-text-muted uppercase">{label}</h2>
      <p className={`font-mono text-6xl font-bold ${best ? 'text-best' : 'text-text'}`}>{value}</p>
      <p className="text-text-muted">{note}</p>
    </section>
  );
}

/** Summary (spec §3.1): the best lap and best 3 consecutive laps of the session just ended. Static. */
export function Summary() {
  const session = useApp((s) => s.state.session);
  const dispatch = useApp((s) => s.dispatch);
  const laps = session?.laps ?? [];
  const best = session?.bestIdx != null ? session.bestIdx : null;
  const best3 = session?.best3 ?? null;

  return (
    <>
      <TopBar />
      <main className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col items-center justify-center gap-8 px-safe py-8 short:gap-4 short:py-4">
        <h1 className="text-center text-sm font-bold tracking-[0.2em] text-text-muted uppercase">
          Session complete
        </h1>
        <div className="flex w-full max-w-[480px] flex-col gap-4 md:max-w-[984px] md:flex-row landscape:max-w-[984px] landscape:flex-row">
          <Stat
            label="Best lap"
            value={best === null ? '--.--' : formatLap(laps[best]?.ms ?? 0)}
            note={best === null ? '' : `Lap ${best + 1}`}
            best
          />
          <Stat
            label="Best 3 laps"
            value={best3 ? formatLap(best3.ms) : '--.--'}
            note={best3 ? `Laps ${best3.idx + 1}–${best3.idx + 3}` : 'Needs 3 laps in a row'}
            best={best3 !== null}
          />
        </div>
        <p className="text-text-muted">{lapsText(laps.length)}</p>
        <div className="flex min-h-24 w-full max-w-[480px]">
          <ActionButton
            label="New session"
            tone="accent"
            onPress={() => dispatch({ type: 'NAV_NEW_SESSION' })}
          />
        </div>
      </main>
    </>
  );
}
