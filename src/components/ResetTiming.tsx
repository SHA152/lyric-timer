import { useEffect, useState } from 'react';
import { useStore } from '../store';

/** How long an armed confirm waits before giving up on an answer. */
const DISARM_MS = 6000;

/**
 * Wiping the timing can't be undone and the take only lives in memory, so the
 * button asks first: one click arms it, a second one on the explicit "yes"
 * does the deed. Inline rather than window.confirm — a native dialog steals
 * the keyboard, and this one disarms itself if the answer never comes.
 */
export function ResetTiming() {
  const lines = useStore((s) => s.lines);
  const resetTiming = useStore((s) => s.resetTiming);
  const [armed, setArmed] = useState(false);

  const stamped = lines.reduce(
    (n, l) => n + l.words.filter((w) => w.startSec > 0 || w.endSec > 0).length,
    0,
  );
  // Derived: if the timing vanishes from under an armed confirm (a project
  // load, say), the question goes away with it.
  const asking = armed && stamped > 0;

  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setArmed(false), DISARM_MS);
    return () => clearTimeout(t);
  }, [asking]);

  if (!asking) {
    return (
      <button
        onClick={() => setArmed(true)}
        disabled={stamped === 0}
        title={stamped === 0 ? 'Nothing is stamped yet' : 'Clear every stamp in the take'}
      >
        ↺ Reset timing
      </button>
    );
  }

  return (
    <span className="confirm">
      <span className="confirm-q">
        Clear {stamped} stamp{stamped === 1 ? '' : 's'}? This can't be undone.
      </span>
      <button
        className="confirm-yes"
        onClick={() => {
          setArmed(false);
          resetTiming();
        }}
      >
        Yes, reset
      </button>
      <button onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}
