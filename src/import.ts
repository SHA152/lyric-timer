import type { Line, LyricProject, Word } from './types';

/**
 * Read back a project we exported. The file comes off the user's disk, so
 * nothing is trusted: every field is re-derived or defaulted, and a line's
 * envelope is recomputed from its words rather than believed.
 */
export function parseProject(text: string): LyricProject {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('not valid JSON');
  }

  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('not a lyric-timer project');
  if (o.version !== '1.0') throw new Error(`unsupported version ${String(o.version ?? '?')}`);
  if (!Array.isArray(o.lines)) throw new Error('no lines in this file');

  const audio = (o.audio ?? {}) as Record<string, unknown>;

  const lines: Line[] = o.lines.map((l, index) => {
    const src = (l ?? {}) as Record<string, unknown>;
    const text = typeof src.text === 'string' ? src.text : '';
    const rawWords = Array.isArray(src.words) ? src.words : [];

    const words: Word[] = rawWords.map((w) => {
      const sw = (w ?? {}) as Record<string, unknown>;
      return {
        text: typeof sw.text === 'string' ? sw.text : '',
        startSec: num(sw.startSec),
        endSec: num(sw.endSec),
      };
    });

    // A line with no word list at all still has to be timeable — fall back to
    // splitting its text the way the lyrics box does.
    const finalWords = words.length
      ? words
      : text
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => ({ text: t, startSec: 0, endSec: 0 }));

    const starts = finalWords.filter((w) => w.startSec > 0).map((w) => w.startSec);
    const ends = finalWords.filter((w) => w.endSec > 0).map((w) => w.endSec);

    return {
      index,
      text: text || finalWords.map((w) => w.text).join(' '),
      startSec: starts.length ? Math.min(...starts) : 0,
      endSec: ends.length ? Math.max(...ends) : 0,
      words: finalWords,
    };
  });

  if (lines.length === 0) throw new Error('no lines in this file');

  return {
    version: '1.0',
    audio: {
      filename: typeof audio.filename === 'string' ? audio.filename : 'unknown.mp3',
      durationSec: num(audio.durationSec),
    },
    lines,
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}
