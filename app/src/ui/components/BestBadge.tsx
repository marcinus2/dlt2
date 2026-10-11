import { Star } from 'lucide-react';
import { cx } from '../cx.ts';

/** BEST label: text + icon, never colour alone (spec §3.3). */
export function BestBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-best px-2.5 py-0.5 text-sm font-extrabold tracking-wider text-best-ink uppercase',
        className,
      )}
    >
      <Star aria-hidden size={14} strokeWidth={0} fill="currentColor" />
      Best
    </span>
  );
}

/** Best 3 label: accent outline pill with text, so colour is not the only cue. */
export function Best3Badge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-full border-2 border-accent px-2.5 py-px text-sm font-extrabold tracking-wider text-accent uppercase',
        className,
      )}
    >
      Best 3
    </span>
  );
}
