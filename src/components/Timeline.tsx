import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from '../store';
import { wsCtrl } from './Waveform';
import type { Line } from '../types';
import './Timeline.css';

const MIN_PPS = 8;
const MAX_PPS = 600;
/** Label spacing candidates, in seconds — the first one wide enough wins. */
const TICK_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

/** Vertical pitch of one stacking row, and where the word sits inside it. */
const ROW_H = 44;
const LABEL_H = 15;
const WORD_H = 22;
/** Sub-millisecond slack: blocks that merely share a boundary don't collide. */
const EPS = 1e-4;

interface Span {
  start: number;
  end: number;
  /** How many rows the item needs (a line is as tall as its own word stack). */
  height: number;
}

/**
 * Greedy first-fit: every item goes to the topmost row band where nothing it
 * overlaps already sits, so the track stays as short as the data allows and
 * only genuine collisions push anything down.
 */
function packRows<T extends Span>(items: T[]): { rows: number; rowOf: Map<T, number> } {
  const occupied: { start: number; end: number }[][] = [];
  const rowOf = new Map<T, number>();

  for (const it of [...items].sort((a, b) => a.start - b.start || a.end - b.end)) {
    let row = 0;
    for (;;) {
      while (occupied.length < row + it.height) occupied.push([]);
      const free = occupied
        .slice(row, row + it.height)
        .every((r) => r.every((iv) => it.start >= iv.end - EPS || it.end <= iv.start + EPS));
      if (free) break;
      row++;
    }
    for (let i = row; i < row + it.height; i++) occupied[i].push({ start: it.start, end: it.end });
    rowOf.set(it, row);
  }
  return { rows: occupied.length, rowOf };
}

type DragMode = 'move' | 'start' | 'end' | 'line';

interface Drag {
  li: number;
  wi: number;
  mode: DragMode;
  x0: number;
  s0: number;
  e0: number;
  moved: boolean;
  /** 'line' drags replay from this snapshot of the whole line. */
  base?: { startSec: number; endSec: number }[];
  lo?: number;
  hi?: number;
}

function fmtTick(sec: number, decimals: boolean): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const ss = decimals ? s.toFixed(1).padStart(4, '0') : String(Math.round(s)).padStart(2, '0');
  return `${m}:${ss}`;
}

/**
 * Visual end of a word. Words are stamped start-first, so the last one of a
 * take has no endSec yet — fall back to the next word, then the line, then a
 * short tail so the block is still grabbable.
 */
function effEnd(line: Line, i: number): number {
  const w = line.words[i];
  if (w.endSec > w.startSec) return w.endSec;
  const next = line.words[i + 1];
  if (next && next.startSec > w.startSec) return next.startSec;
  if (line.endSec > w.startSec) return line.endSec;
  return w.startSec + 0.4;
}

export const Timeline = memo(function Timeline() {
  const lines = useStore((s) => s.lines);
  const duration = useStore((s) => s.audioDuration);
  const setWordTime = useStore((s) => s.setWordTime);
  const setLineTimes = useStore((s) => s.setLineTimes);
  const selectWord = useStore((s) => s.selectWord);
  const currentLine = useStore((s) => s.currentLine);
  const currentWord = useStore((s) => s.currentWord);

  const [pps, setPps] = useState(80);
  const [view, setView] = useState({ left: 0, width: 0 });
  const ready = lines.length > 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const scrubRef = useRef(false);
  const rafRef = useRef(0);
  const jobRef = useRef<(() => void) | null>(null);
  // scrollLeft to restore right after a zoom, so the anchored time stays put.
  const keepRef = useRef<number | null>(null);

  // Coalesce drag updates to one store write per frame.
  const schedule = useCallback((fn: () => void) => {
    jobRef.current = fn;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const job = jobRef.current;
      jobRef.current = null;
      job?.();
    });
  }, []);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Track the visible window so the ruler only renders the ticks in it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const read = () => setView({ left: el.scrollLeft, width: el.clientWidth });
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; read(); });
    };
    read();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', read);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', read);
    };
  }, [ready]);

  const zoom = useCallback((factor: number, clientX?: number) => {
    const el = scrollRef.current;
    setPps((prev) => {
      const next = Math.min(MAX_PPS, Math.max(MIN_PPS, prev * factor));
      if (el && next !== prev) {
        const px = clientX == null ? el.clientWidth / 2 : clientX - el.getBoundingClientRect().left;
        const anchor = (el.scrollLeft + px) / prev;
        keepRef.current = anchor * next - px;
      }
      return next;
    });
  }, []);

  const fit = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !duration) return;
    keepRef.current = 0;
    setPps(Math.min(MAX_PPS, Math.max(MIN_PPS, (el.clientWidth - 8) / duration)));
  }, [duration]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && keepRef.current != null) el.scrollLeft = Math.max(0, keepRef.current);
    keepRef.current = null;
    setView((v) => (el ? { left: el.scrollLeft, width: el.clientWidth } : v));
  }, [pps]);

  // React attaches wheel passively, so preventDefault needs a native listener.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, ready]);

  useEffect(() => {
    const el = scrollRef.current;
    const blk = selRef.current;
    if (!el || !blk) return;
    blk.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // scrollIntoView leaves the block flush against the edge; keep some track
    // visible on either side of it.
    const PAD = 60;
    const left = blk.offsetLeft;
    const right = left + blk.offsetWidth;
    if (left - el.scrollLeft < PAD) el.scrollLeft = Math.max(0, left - PAD);
    else if (el.scrollLeft + el.clientWidth - right < PAD)
      el.scrollLeft = right + PAD - el.clientWidth;
  }, [currentLine, currentWord]);

  const timeAtX = useCallback((clientX: number) => {
    const el = canvasRef.current;
    if (!el) return 0;
    const t = (clientX - el.getBoundingClientRect().left) / pps;
    return Math.min(Math.max(t, 0), duration || 0);
  }, [pps, duration]);

  // Clicking/dragging anywhere that isn't a word block scrubs the playhead.
  const onCanvasDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    scrubRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    wsCtrl()?.setTime(timeAtX(e.clientX));
  };
  const onCanvasMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubRef.current) return;
    const x = e.clientX;
    schedule(() => wsCtrl()?.setTime(timeAtX(x)));
  };
  const onCanvasUp = () => { scrubRef.current = false; };

  const onBlockDown = (e: ReactPointerEvent<HTMLElement>, li: number, wi: number, mode: DragMode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const line = lines[li];
    if (!line) return;

    if (mode === 'line') {
      const stamped = line.words.map((w, i) => ({ w, i })).filter(({ w }) => w.startSec > 0);
      if (stamped.length === 0) return;
      dragRef.current = {
        li,
        wi,
        mode,
        x0: e.clientX,
        s0: 0,
        e0: 0,
        moved: false,
        base: line.words.map((w) => ({ startSec: w.startSec, endSec: w.endSec })),
        lo: Math.min(...stamped.map(({ w }) => w.startSec)),
        hi: Math.max(...stamped.map(({ i }) => effEnd(line, i))),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      selectWord(li, stamped[0].i);
      return;
    }

    const w = line.words[wi];
    if (!w) return;
    dragRef.current = { li, wi, mode, x0: e.clientX, s0: w.startSec, e0: effEnd(line, wi), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    selectWord(li, wi);
  };

  const onBlockMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const x = e.clientX;
    if (Math.abs(x - d.x0) > 2) d.moved = true;
    schedule(() => {
      const raw = (x - d.x0) / pps;
      if (d.mode === 'line') {
        // The container is a handle, not a resizer: the line moves rigidly.
        let dt = Math.max(raw, -(d.lo ?? 0));
        if (duration) dt = Math.min(dt, duration - (d.hi ?? 0));
        setLineTimes(
          d.li,
          (d.base ?? []).map((t) =>
            t.startSec > 0
              ? { startSec: t.startSec + dt, endSec: t.endSec > 0 ? t.endSec + dt : 0 }
              : t,
          ),
        );
      } else if (d.mode === 'move') {
        // Shift both edges by the same amount so the word keeps its length.
        let dt = Math.max(raw, -d.s0);
        if (duration) dt = Math.min(dt, duration - d.e0);
        setWordTime(d.li, d.wi, d.s0 + dt, d.e0 + dt);
      } else if (d.mode === 'start') {
        setWordTime(d.li, d.wi, d.s0 + raw, d.e0);
      } else {
        setWordTime(d.li, d.wi, d.s0, d.e0 + raw);
      }
    });
  };

  const onBlockUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    // Selection happened on pointerdown; a click that never moved does nothing
    // else — picking an element deliberately leaves the playhead where it is.
    dragRef.current = null;
  };

  // One shared track: every stamped word sits on the same row, and each line is
  // drawn as a container around its own words so the grouping stays readable.
  // Overlapping items are stacked downwards, nothing else moves.
  const layout = useMemo(() => {
    const groups = lines
      .map((line, li) => {
        const stamped = line.words
          .map((w, wi) => ({ w, wi, start: w.startSec, end: effEnd(line, wi), height: 1 }))
          .filter(({ w }) => w.startSec > 0);
        if (stamped.length === 0) return null;

        // Words of one line normally never collide; they only do after a drag
        // pushes one past its neighbour — then the line itself grows taller.
        const packed = packRows(stamped);
        return {
          li,
          line,
          start: Math.min(...stamped.map((x) => x.start)),
          end: Math.max(...stamped.map((x) => x.end)),
          height: packed.rows,
          words: stamped.map((x) => ({ ...x, sub: packed.rowOf.get(x) ?? 0 })),
        };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);

    const packed = packRows(groups);
    return {
      rows: packed.rows,
      groups: groups.map((g) => ({ ...g, row: packed.rowOf.get(g) ?? 0 })),
    };
  }, [lines]);

  if (!ready) return null;

  const width = Math.max(duration * pps, 1);
  const step = TICK_STEPS.find((s) => s * pps >= 60) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const decimals = step < 1;
  const from = Math.max(0, Math.floor((view.left - 120) / pps / step));
  const to = Math.min(Math.ceil(duration / step), Math.ceil((view.left + view.width + 120) / pps / step));
  const ticks: number[] = [];
  for (let i = from; i <= to; i++) ticks.push(i * step);

  return (
    <div className="timeline">
      <div className="timeline-head">
        <span className="tl-title">Timeline</span>
        <span className="tl-hint">
          click&nbsp;=&nbsp;select · drag&nbsp;=&nbsp;move, edges&nbsp;=&nbsp;resize · orange&nbsp;box&nbsp;=&nbsp;whole line · ⌘/Ctrl+wheel&nbsp;=&nbsp;zoom
        </span>
        <span className="tl-spacer" />
        <button onClick={() => zoom(1 / 1.5)} title="Zoom out" disabled={pps <= MIN_PPS}>−</button>
        <span className="tl-zoom">{pps < 100 ? pps.toFixed(1) : Math.round(pps)} px/s</span>
        <button onClick={() => zoom(1.5)} title="Zoom in" disabled={pps >= MAX_PPS}>+</button>
        <button onClick={fit} title="Fit the whole track" disabled={!duration}>Fit</button>
      </div>

      <div className="timeline-scroll" ref={scrollRef}>
        <div
          className="tl-canvas"
          ref={canvasRef}
          style={{ width }}
          onPointerDown={onCanvasDown}
          onPointerMove={onCanvasMove}
          onPointerUp={onCanvasUp}
          onPointerCancel={onCanvasUp}
        >
          <div className="tl-ruler">
            {ticks.map((t) => (
              <div key={t} className="tl-tick" style={{ left: t * pps }}>
                <span className="tl-tick-label">{fmtTick(t, decimals)}</span>
              </div>
            ))}
          </div>

          <div className="tl-body">
            {ticks.map((t) => (
              <div key={t} className="tl-grid" style={{ left: t * pps }} />
            ))}

            {layout.groups.length === 0 && (
              <div className="tl-empty">No stamped words yet — hit <kbd>Space</kbd> along with the track.</div>
            )}

            <div className="tl-track" style={{ height: layout.rows * ROW_H + 2 }}>
              {layout.groups.map((g) => (
                <div
                  key={g.li}
                  className={`tl-group${g.li === currentLine ? ' tl-group-sel' : ''}`}
                  style={{
                    left: g.start * pps,
                    width: Math.max((g.end - g.start) * pps, 8),
                    top: g.row * ROW_H,
                    height: g.height * ROW_H - 6,
                  }}
                  title={`${g.li + 1}. ${g.line.text} — drag to move the whole line`}
                  onPointerDown={(e) => onBlockDown(e, g.li, 0, 'line')}
                  onPointerMove={onBlockMove}
                  onPointerUp={onBlockUp}
                  onPointerCancel={onBlockUp}
                >
                  <span className="tl-group-label">{g.li + 1}. {g.line.text}</span>
                </div>
              ))}

              {layout.groups.map((g) =>
                g.words.map(({ w, wi, end, sub }) => {
                  const open = !(w.endSec > w.startSec);
                  const isSel = g.li === currentLine && wi === currentWord;
                  return (
                    <div
                      key={`${g.li}:${wi}`}
                      ref={isSel ? selRef : undefined}
                      className={`tl-word${open ? ' tl-word-open' : ''}${isSel ? ' tl-word-sel' : ''}`}
                      style={{
                        left: w.startSec * pps,
                        width: Math.max((end - w.startSec) * pps, 6),
                        top: (g.row + sub) * ROW_H + LABEL_H,
                        height: WORD_H,
                      }}
                      title={`${w.text} — ${w.startSec.toFixed(2)}s → ${end.toFixed(2)}s${open ? ' (open end)' : ''}`}
                      onPointerDown={(e) => onBlockDown(e, g.li, wi, 'move')}
                      onPointerMove={onBlockMove}
                      onPointerUp={onBlockUp}
                      onPointerCancel={onBlockUp}
                    >
                      <span
                        className="tl-handle tl-handle-l"
                        onPointerDown={(e) => onBlockDown(e, g.li, wi, 'start')}
                      />
                      <span className="tl-word-text">{w.text}</span>
                      <span
                        className="tl-handle tl-handle-r"
                        onPointerDown={(e) => onBlockDown(e, g.li, wi, 'end')}
                      />
                    </div>
                  );
                }),
              )}
            </div>
          </div>

          <Playhead pps={pps} scrollRef={scrollRef} />
        </div>
      </div>
    </div>
  );
});

/** Split out so the per-frame playhead updates don't re-render every block. */
function Playhead({
  pps,
  scrollRef,
}: {
  pps: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useStore((s) => s.playheadSec);
  const playing = useStore((s) => s.isPlaying);
  const x = t * pps;

  useEffect(() => {
    if (!playing) return;
    const el = scrollRef.current;
    if (!el) return;
    // Only jump when the playhead has actually left the window, so manual
    // scrolling isn't fought while the track plays.
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
    }
  }, [x, playing, scrollRef]);

  return (
    <div className="tl-playhead" style={{ transform: `translateX(${x}px)` }}>
      <span className="tl-playhead-grip" />
    </div>
  );
}
