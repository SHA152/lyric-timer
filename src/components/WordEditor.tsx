import { useState } from 'react';
import { useStore } from '../store';

/**
 * A field shows the store's value until it is focused, and the raw text the
 * user is typing while it is. Without that, an intermediate "1." would be
 * parsed, written back and re-formatted under the cursor; with it, edits from
 * elsewhere (a timeline drag on this very word) still show up live.
 */
function useDraft() {
  return useState<string | null>(null);
}

const fmt = (t: number) => t.toFixed(2);

/**
 * The selected word, up close: its text, its two stamps, and the handful of
 * edits that are awkward to do by dragging bricks around. Sits between the
 * timeline and the lyrics because it belongs to both.
 */
export function WordEditor() {
  const lines = useStore((s) => s.lines);
  const li = useStore((s) => s.currentLine);
  const wi = useStore((s) => s.currentWord);
  const setWordText = useStore((s) => s.setWordText);
  const setWordStamps = useStore((s) => s.setWordStamps);
  const insertWord = useStore((s) => s.insertWord);
  const deleteWord = useStore((s) => s.deleteWord);
  const nudgeWord = useStore((s) => s.nudgeWord);

  const [textDraft, setTextDraft] = useDraft();
  const [startDraft, setStartDraft] = useDraft();
  const [endDraft, setEndDraft] = useDraft();

  const word = lines[li]?.words[wi];
  if (!word) return null;

  // A comma is what half the world's keyboards put on the numeric row.
  const commit = (raw: string, which: 'start' | 'end') => {
    const t = raw.trim() === '' ? 0 : Number(raw.replace(',', '.'));
    if (!Number.isFinite(t)) return;
    setWordStamps(li, wi, which === 'start' ? t : word.startSec, which === 'end' ? t : word.endSec);
  };

  const firstOfTake = li === 0 && wi === 0;
  const lastOfTake = li === lines.length - 1 && wi === lines[li].words.length - 1;

  return (
    <div className="panel word-editor">
      <div className="panel-head">
        <span className="panel-title">Word</span>

        <input
          className="we-text"
          value={textDraft ?? word.text}
          spellCheck={false}
          // Blank is not a word, so the store keeps the last good text while the
          // field shows whatever is being typed.
          onChange={(e) => {
            setTextDraft(e.target.value);
            setWordText(li, wi, e.target.value);
          }}
          onBlur={() => setTextDraft(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
          title="The word as it will be exported — no spaces, split the line instead"
        />

        <input
          className="we-num"
          inputMode="decimal"
          value={startDraft ?? fmt(word.startSec)}
          onChange={(e) => {
            setStartDraft(e.target.value);
            commit(e.target.value, 'start');
          }}
          onBlur={() => setStartDraft(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
          title="Start, in seconds — 0 means not stamped"
        />
        <span className="we-arrow">→</span>
        <input
          className="we-num"
          inputMode="decimal"
          value={endDraft ?? fmt(word.endSec)}
          onChange={(e) => {
            setEndDraft(e.target.value);
            commit(e.target.value, 'end');
          }}
          onBlur={() => setEndDraft(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
          title="End, in seconds — 0 means not stamped"
        />
        <span className="we-unit">s</span>

        <button onClick={() => nudgeWord(-1)} disabled={firstOfTake} title="Move the word one slot back">
          ←
        </button>
        <button onClick={() => nudgeWord(1)} disabled={lastOfTake} title="Move the word one slot on">
          →
        </button>
        <button onClick={() => insertWord(li, wi)} title="Insert an empty word before this one">
          +←
        </button>
        <button onClick={() => insertWord(li, wi + 1)} title="Insert an empty word after this one">
          +→
        </button>
        <button className="we-del" onClick={() => deleteWord(li, wi)} title="Delete this word">
          ✕
        </button>
      </div>
    </div>
  );
}
