import { useLayoutEffect, useRef } from 'react';
import { formatLap } from '../../session/laps.ts';
import type { Lap } from '../../session/types.ts';
import { cx } from '../cx.ts';
import { EASE, prefersReducedMotion } from '../motion.tsx';
import { BestBadge } from './BestBadge.tsx';

export const LIST_CAP = 500;
const ROW_PX = 56;

/**
 * History = every lap but the latest, newest first (spec §3.3). Renders the newest 500
 * rows + "+N older laps". The best row (when not the latest) is green with a badge.
 * Best 3 mode passes `best3` (first index of the best window, null before one): every row
 * gets a gutter and the window's rows an accent bar in it.
 */
export function LapList({
  laps,
  bestIdx,
  best3,
  cap = LIST_CAP,
}: {
  laps: Lap[];
  bestIdx: number | null;
  best3?: number | null;
  cap?: number;
}) {
  const history = Math.max(laps.length - 1, 0);
  const shown = Math.min(history, cap);
  const rows: Lap[] = [];
  for (let i = history - 1; i >= history - shown; i--) rows.push(laps[i] as Lap);

  // New lap: the list slides down one row and the new top row fades in (WAAPI, transform/opacity only).
  const list = useRef<HTMLOListElement>(null);
  const count = useRef(history);
  useLayoutEffect(() => {
    const grew = history > count.current;
    count.current = history;
    const el = list.current;
    if (!grew || !el?.animate || prefersReducedMotion()) return;
    const easing = `cubic-bezier(${EASE.join(',')})`;
    el.animate([{ transform: `translateY(-${ROW_PX}px)` }, { transform: 'none' }], { duration: 180, easing });
    el.firstElementChild?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing });
  }, [history]);

  if (history === 0) return null;
  return (
    <div>
      <ol ref={list} aria-label="Lap history" className="flex flex-col">
        {rows.map((lap) => {
          const best = bestIdx === lap.n - 1;
          const inBest3 = best3 != null && lap.n - 1 >= best3 && lap.n - 1 < best3 + 3;
          return (
            <li
              key={lap.n}
              data-best={best || undefined}
              data-best3={inBest3 || undefined}
              // content-visibility clips paint to the row, so the bar sits in a gutter inside it.
              className={cx(
                'relative flex h-14 shrink-0 items-center gap-4 border-b border-border [contain-intrinsic-size:auto_56px] [content-visibility:auto]',
                best3 !== undefined && 'pl-3',
              )}
            >
              {inBest3 && (
                <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent" />
              )}
              <span className="w-16 shrink-0 text-lg font-semibold text-text-muted">#{lap.n}</span>
              <span className={cx('font-mono text-lap-row font-semibold', best ? 'text-best' : 'text-text')}>
                {formatLap(lap.ms)}
              </span>
              {best && <BestBadge />}
              {inBest3 && <span className="sr-only">, in best 3</span>}
            </li>
          );
        })}
      </ol>
      {history > shown && (
        <p className="py-4 text-center font-semibold text-text-muted">+{history - shown} older laps</p>
      )}
    </div>
  );
}
