import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function LyricsPane() {
  const { lines, currentLine, currentWord, lyricsRaw, setLyricsRaw, rebuildLinesFromRaw } = useStore();
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
              const isCurrent = li === currentLine && wi === currentWord;
              return (
                <span
                  key={wi}
                  className={`word ${stamped ? 'word-stamped' : ''} ${isCurrent ? 'word-current' : ''}`}
                  title={stamped ? `${w.startSec.toFixed(2)}s` : 'not stamped'}
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
