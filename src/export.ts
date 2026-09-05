import type { Line, LyricProject } from './types';

function fmtLrcTime(sec: number): string {
  // Round to centiseconds up front: rounding after the split turns 59.999 into
  // a "00:60.00" that no parser accepts.
  const cs = Math.round(Math.max(sec, 0) * 100);
  const m = Math.floor(cs / 6000);
  const rest = (cs % 6000) / 100;
  return `${String(m).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

function fmtSrtTime(sec: number): string {
  // Work in whole milliseconds: flooring the float remainder rendered 12.34 as
  // 12,339 because (12.34 - 12) * 1000 is 339.999…
  const total = Math.round(Math.max(sec, 0) * 1000);
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * End time for a word: its own endSec if stamped, otherwise the next word's
 * start, otherwise the line end. Falls back to a short fixed tail so a cue is
 * never zero-length.
 */
function wordEnd(line: Line, i: number): number {
  const w = line.words[i];
  if (w.endSec > 0) return w.endSec;
  const next = line.words[i + 1];
  if (next && next.startSec > 0) return next.startSec;
  if (line.endSec > 0) return line.endSec;
  return w.startSec + 0.5;
}

/** First stamped word's start, falling back to the line's own start. */
function lineStart(line: Line): number {
  const first = line.words.find((w) => w.startSec > 0);
  return first ? first.startSec : line.startSec;
}

export function toLRC(p: LyricProject): string {
  const header = [
    `[ti:${p.audio.filename.replace(/\.[^.]+$/, '')}]`,
    `[length:${fmtLrcTime(p.audio.durationSec)}]`,
    '[tool:lyric-timer]',
    '',
  ];
  const body = p.lines.map((l) => `[${fmtLrcTime(l.startSec)}]${l.text}`);
  return [...header, ...body].join('\n');
}

export function toSRT(p: LyricProject): string {
  return p.lines
    .map((l, i) => {
      const end = l.endSec > 0 ? l.endSec : l.startSec + 3;
      return `${i + 1}\n${fmtSrtTime(l.startSec)} --> ${fmtSrtTime(end)}\n${l.text}\n`;
    })
    .join('\n');
}

/**
 * Enhanced LRC (the "A2" extension): a line timestamp followed by a per-word
 * `<mm:ss.xx>` tag. Players that don't understand A2 generally fall back to
 * showing the whole line at its line timestamp.
 */
export function toEnhancedLRC(p: LyricProject): string {
  const header = [
    `[ti:${p.audio.filename.replace(/\.[^.]+$/, '')}]`,
    `[length:${fmtLrcTime(p.audio.durationSec)}]`,
    '[tool:lyric-timer]',
    '',
  ];
  const body = p.lines.map((l) => {
    // An unstamped word gets no tag of its own — it just continues the
    // previous word's segment, which beats emitting a bogus <00:00.00>.
    const words = l.words
      .map((w) => (w.startSec > 0 ? `<${fmtLrcTime(w.startSec)}>${w.text}` : w.text))
      .join(' ');
    const tail = l.endSec > 0 ? ` <${fmtLrcTime(l.endSec)}>` : '';
    return `[${fmtLrcTime(lineStart(l))}]${words}${tail}`;
  });
  return [...header, ...body].join('\n');
}

/** SRT with one cue per word, for players/tools that consume word-level timing. */
export function toWordSRT(p: LyricProject): string {
  const cues: string[] = [];
  for (const l of p.lines) {
    l.words.forEach((w, i) => {
      if (w.startSec <= 0) return;
      cues.push(
        `${cues.length + 1}\n${fmtSrtTime(w.startSec)} --> ${fmtSrtTime(wordEnd(l, i))}\n${w.text}\n`,
      );
    });
  }
  return cues.join('\n');
}

export function toJSON(p: LyricProject): string {
  return JSON.stringify(p, null, 2);
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function saveViaTauri(filename: string, content: string) {
  const [{ save }, { writeTextFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);
  const ext = filename.split('.').pop() ?? '';
  const path = await save({
    defaultPath: filename,
    filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [],
  });
  if (path) await writeTextFile(path, content);
}

function saveViaBrowser(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function download(filename: string, content: string, mime = 'text/plain') {
  // In the desktop build an <a download> never reaches the OS, so ask Tauri for a
  // real save dialog; in the browser keep the plain blob download.
  if (isTauri()) {
    void saveViaTauri(filename, content);
    return;
  }
  saveViaBrowser(filename, content, mime);
}
