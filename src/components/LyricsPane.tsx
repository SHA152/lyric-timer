import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from '../store';
import type { WordPos } from '../store';

/** Pointer travel before a press on a word turns into a drag instead of a click. */
const DRAG_SLOP = 4;
/** How close to a pane edge the cursor has to get before the pane scrolls itself. */
const EDGE = 44;
const EDGE_SPEED = 12; // px per frame at the very edge

export function LyricsPane() {
  // Selected field by field: a bare useStore() re-renders every word span on
  // each playhead tick, which is pure overhead here — nothing below uses it.
  const lines = useStore((s) => s.lines);
  const currentLine = useStore((s) => s.currentLine);
  const currentWord = useStore((s) => s.currentWord);
  const selectWord = useStore((s) => s.selectWord);
  const moveWord = useStore((s) => s.moveWord);
  const splitLine = useStore((s) => s.splitLine);
  const mergeLineUp = useStore((s) => s.mergeLineUp);
  const lyricsRaw = useStore((s) => s.lyricsRaw);
  const setLyricsRaw = useStore((s) => s.setLyricsRaw);
  const rebuildLinesFromRaw = useStore((s) => s.rebuildLinesFromRaw);
  const activeRef = useRef<HTMLDivElement>(null);

  const paneRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  // The live drag. It's a ref, not state: it changes on every pointermove and
  // nothing on screen reads it directly.
  const dragRef = useRef<{ from: WordPos; x0: number; y0: number; moved: boolean } | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dropRef = useRef<WordPos | null>(null);
  const rafRef = useRef(0);
  // Only these two drive rendering, and both change at most once per hovered slot.
  const [dragFrom, setDragFrom] = useState<WordPos | null>(null);
  const [dropAt, setDropAt] = useState<WordPos | null>(null);

  // Keep the line being timed inside the scrollable pane.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentLine, currentWord]);

  const paintGhost = useCallback(() => {
    const g = ghostRef.current;
    if (!g) return;
    // Held just above-left of the cursor so the caret underneath stays visible.
    g.style.transform = `translate3d(${posRef.current.x + 12}px, ${posRef.current.y - 14}px, 0)`;
  }, []);
  // The ghost only exists from the render that follows the first move, so its
  // opening position has to be written once it's actually in the DOM.
  useLayoutEffect(() => {
    if (dragFrom) paintGhost();
  }, [dragFrom, paintGhost]);

  /**
   * Which slot the cursor is over: the nearest line, then the nearest word in
   * it, dropping before or after that word depending on which half we're on.
   * Read from the DOM rather than from cached rects — lines wrap, and a wrapped
   * line's words sit on several visual rows.
   */
  const hitTest = useCallback((x: number, y: number): WordPos | null => {
    const pane = paneRef.current;
    if (!pane) return null;

    let row: HTMLElement | null = null;
    let rowDist = Infinity;
    for (const el of pane.querySelectorAll<HTMLElement>('.line')) {
      const b = el.getBoundingClientRect();
      const d = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
      if (d < rowDist) {
        rowDist = d;
        row = el;
      }
    }
    if (!row) return null;

    const li = Number(row.dataset.li);
    let wi = 0;
    let best = Infinity;
    for (const el of row.querySelectorAll<HTMLElement>('.word')) {
      const b = el.getBoundingClientRect();
      const cx = (b.left + b.right) / 2;
      const dy = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
      // The row distance has to dominate the column one, or a wrapped line
      // would hand the cursor a word from the visual row above or below.
      const d = dy * 10000 + Math.abs(x - cx);
      if (d < best) {
        best = d;
        wi = Number(el.dataset.wi) + (x > cx ? 1 : 0);
      }
    }
    return { li, wi };
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    dropRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setDragFrom(null);
    setDropAt(null);
  }, []);

  // A drag that reaches past the top or bottom of the pane scrolls it, so a
  // word can be carried to a line that wasn't on screen when it was picked up.
  const startAutoScroll = useCallback(() => {
    const step = () => {
      rafRef.current = 0;
      if (!dragRef.current?.moved) return;
      const box = paneRef.current?.closest<HTMLElement>('.lyrics-body');
      if (box) {
        const b = box.getBoundingClientRect();
        const { x, y } = posRef.current;
        const over =
          y < b.top + EDGE ? y - (b.top + EDGE) : y > b.bottom - EDGE ? y - (b.bottom - EDGE) : 0;
        if (over) {
          box.scrollTop += Math.max(-EDGE_SPEED, Math.min(EDGE_SPEED, (over / EDGE) * EDGE_SPEED));
          // The slot under a still cursor changes as the pane slides past it.
          const t = hitTest(x, y);
          dropRef.current = t;
          setDropAt((p) => (p && t && p.li === t.li && p.wi === t.wi ? p : t));
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(step);
  }, [hitTest]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Escape drops the word back where it was — nothing is committed until the
  // pointer comes up.
  useEffect(() => {
    if (!dragFrom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      endDrag();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dragFrom, endDrag]);

  const onWordDown = (e: ReactPointerEvent<HTMLElement>, li: number, wi: number) => {
    if (e.button !== 0) return;
    selectWord(li, wi);
    dragRef.current = { from: { li, wi }, x0: e.clientX, y0: e.clientY, moved: false };
    posRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onWordMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    posRef.current = { x: e.clientX, y: e.clientY };

    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_SLOP) return;
      d.moved = true;
      setDragFrom(d.from);
      startAutoScroll();
    }

    paintGhost();
    const t = hitTest(e.clientX, e.clientY);
    dropRef.current = t;
    setDropAt((p) => (p && t && p.li === t.li && p.wi === t.wi ? p : t));
  };

  const onWordUp = () => {
    const d = dragRef.current;
    const target = dropRef.current;
    if (d?.moved && target) moveWord(d.from, target);
    endDrag();
  };

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

  const dragged = dragFrom ? lines[dragFrom.li]?.words[dragFrom.wi] : null;

  /**
   * The gap between two words. It is both the split handle — a generous strip
   * to aim at, lit on hover, cut by a double click — and, mid-drag, the mark
   * showing where the carried word would land. One element for both so the line
   * doesn't reflow the moment a drag starts.
   */
  const slot = (li: number, i: number, last: number) => {
    const inner = i > 0 && i < last;
    return (
      <span
        key={`s${i}`}
        className={`slot ${inner ? 'slot-split' : ''} ${
          dropAt?.li === li && dropAt.wi === i ? 'slot-drop' : ''
        }`}
        onDoubleClick={inner ? () => splitLine(li, i) : undefined}
        title={inner ? 'Double-click to split the line here' : undefined}
      />
    );
  };

  return (
    <div className={`lyrics-pane ${dragFrom ? 'lyrics-pane-dragging' : ''}`} ref={paneRef}>
      {lines.map((line, li) => (
        <div
          key={li}
          data-li={li}
          ref={li === currentLine ? activeRef : undefined}
          className={`line ${li === currentLine ? 'line-active' : ''}`}
        >
          <span
            className={`line-no ${li > 0 ? 'line-no-merge' : ''}`}
            onDoubleClick={li > 0 ? () => mergeLineUp(li) : undefined}
            title={li > 0 ? `Double-click to glue this line onto line ${li}` : undefined}
          >
            {li + 1}
          </span>
          <span className="line-text">
            {line.words.map((w, wi) => {
              const stamped = w.startSec > 0;
              // started but never closed — the one "." is for
              const open = stamped && !(w.endSec > w.startSec);
              const selected = li === currentLine && wi === currentWord;
              const lifted = dragFrom?.li === li && dragFrom.wi === wi;
              return (
                <span key={wi} className="slot-word">
                  {slot(li, wi, line.words.length)}
                  <span
                    data-wi={wi}
                    className={`word ${stamped ? 'word-stamped' : ''} ${open ? 'word-open' : ''} ${
                      selected ? 'word-current' : ''
                    } ${lifted ? 'word-lifted' : ''}`}
                    title={
                      stamped
                        ? `${w.startSec.toFixed(2)}s → ${open ? 'open' : `${w.endSec.toFixed(2)}s`}`
                        : 'not stamped'
                    }
                    onPointerDown={(e) => onWordDown(e, li, wi)}
                    onPointerMove={onWordMove}
                    onPointerUp={onWordUp}
                    onPointerCancel={endDrag}
                  >
                    {w.text}
                  </span>
                </span>
              );
            })}
            {/* the gap past the last word — a drop target, never a cut */}
            {slot(li, line.words.length, line.words.length)}
          </span>
        </div>
      ))}

      {dragged && (
        <div className="word-ghost" ref={ghostRef}>
          {dragged.text}
        </div>
      )}
    </div>
  );
}
