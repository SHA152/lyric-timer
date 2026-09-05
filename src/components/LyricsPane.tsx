import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function LyricsPane() {
  // Selected field by field: a bare useStore() re-renders every word span on
  // each playhead tick, which is pure overhead here — nothing below uses it.
  const lines = useStore((s) => s.lines);
  const currentLine = useStore((s) => s.currentLine);
  const currentWord = useStore((s) => s.currentWord);
  const selectWord = useStore((s) => s.selectWord);
  const lyricsRaw = useStore((s) => s.lyricsRaw);
  const setLyricsRaw = useStore((s) => s.setLyricsRaw);
  const rebuildLinesFromRaw = useStore((s) => s.rebuildLinesFromRaw);
  const activeRef = useRef<HTMLDivElement>(null);

  // Keep the line being timed inside the scrollable pane.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentLine, currentWord]);

  if (lines.length === 0) {
    return (
      <div className="lyrics-empty">
        <p>Paste your lyrics (one line per line):</p>
        <textarea
          value={lyricsRaw}
          onChange={(e) => setLyricsRaw(e.target.value)}
          placeholder="Freedom is the goal&#10;Capabilities are the means&#10;..."
          rows={20}
        />
        <button onClick={rebuildLinesFromRaw} disabled={!lyricsRaw.trim()}>
          Load lyrics
        </button>
      </div>
    );
  }

  return (
    <div className="lyrics-pane">
      {lines.map((line, li) => (
        <div
          key={li}
          ref={li === currentLine ? activeRef : undefined}
          className={`line ${li === currentLine ? 'line-active' : ''}`}
        >
          <span className="line-no">{li + 1}</span>
          <span className="line-text">
            {line.words.map((w, wi) => {
              const stamped = w.startSec > 0;
              // started but never closed — the one "." is for
              const open = stamped && !(w.endSec > w.startSec);
              const selected = li === currentLine && wi === currentWord;
              return (
                <span
                  key={wi}
                  className={`word ${stamped ? 'word-stamped' : ''} ${open ? 'word-open' : ''} ${
                    selected ? 'word-current' : ''
                  }`}
                  title={
                    stamped
                      ? `${w.startSec.toFixed(2)}s → ${open ? 'open' : `${w.endSec.toFixed(2)}s`}`
                      : 'not stamped'
                  }
                  onClick={() => selectWord(li, wi)}
                >
                  {w.text}
                </span>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
