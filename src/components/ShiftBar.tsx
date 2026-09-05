import { useState } from 'react';
import { useStore } from '../store';

const MAX_MS = 1000;
const DEFAULT_MS = 100;

/** Nudge the whole take earlier or later — for a track whose timing is right
 *  but offset. Lives as the footer of the timeline block. */
export function ShiftBar() {
  const lineCount = useStore((s) => s.lines.length);
  const shiftAll = useStore((s) => s.shiftAll);
  // Kept as text so the field can be emptied while typing; parsed on use.
  const [raw, setRaw] = useState(String(DEFAULT_MS));

  const ms = Math.min(Math.max(Math.round(Number(raw)) || 0, 0), MAX_MS);
  const disabled = lineCount === 0 || ms <= 0;

  const shift = (dir: 1 | -1) => shiftAll((dir * ms) / 1000);

  return (
    <div className="panel-foot shift-bar">
      <span className="shift-label">Shift all</span>
      <button onClick={() => shift(-1)} disabled={disabled} title={`Move everything ${ms}ms earlier`}>
        ◀
      </button>
      <input
        type="number"
        min={0}
        max={MAX_MS}
        step={10}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => setRaw(String(ms || DEFAULT_MS))}
      />
      <span className="shift-unit">ms</span>
      <button onClick={() => shift(1)} disabled={disabled} title={`Move everything ${ms}ms later`}>
        ▶
      </button>
    </div>
  );
}
