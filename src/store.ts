import { create } from 'zustand';
import type { Line, LyricProject } from './types';

/** What a freshly inserted word says until it's typed over. */
export const NEW_WORD = '<>';

/** A word's place in the take: line index + index within that line. */
export interface WordPos {
  li: number;
  wi: number;
}

interface State {
  audioFile: File | null;
  audioUrl: string | null;
  audioDuration: number;
  lyricsRaw: string;
  lines: Line[];
  currentLine: number;
  currentWord: number;
  isPlaying: boolean;
  playheadSec: number;

  setAudio: (file: File) => void;
  setLyricsRaw: (text: string) => void;
  rebuildLinesFromRaw: () => void;
  setDuration: (sec: number) => void;
  setPlayhead: (sec: number) => void;
  setPlaying: (p: boolean) => void;

  selectWord: (lineIndex: number, wordIndex: number) => void;
  moveWord: (from: WordPos, to: WordPos) => void;
  splitLine: (lineIndex: number, wordIndex: number) => void;
  mergeLineUp: (lineIndex: number) => void;
  setWordText: (lineIndex: number, wordIndex: number, text: string) => void;
  setWordStamps: (lineIndex: number, wordIndex: number, startSec: number, endSec: number) => void;
  insertWord: (lineIndex: number, wordIndex: number) => void;
  deleteWord: (lineIndex: number, wordIndex: number) => void;
  nudgeWord: (dir: 1 | -1) => void;
  stepSelection: (dir: 1 | -1) => void;
  stampNextWord: (timeSec: number) => void;
  setEndAtSelection: (timeSec: number) => void;
  setPrevEnd: (timeSec: number) => void;
  clearAndStepBack: () => void;
  setWordTime: (lineIndex: number, wordIndex: number, startSec: number, endSec: number) => void;
  setLineTimes: (lineIndex: number, times: { startSec: number; endSec: number }[]) => void;
  shiftAll: (deltaSec: number) => void;
  resetTiming: () => void;
  loadProject: (p: LyricProject) => void;
  toJSON: () => LyricProject;
}

function parseLyrics(raw: string): Line[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((text, index) => ({
      index,
      text,
      startSec: 0,
      endSec: 0,
      words: text
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => ({ text: w, startSec: 0, endSec: 0 })),
    }));
}

/** Line envelope follows its words — the exporters read startSec/endSec. */
function syncLine(l: Line) {
  const starts = l.words.filter((w) => w.startSec > 0).map((w) => w.startSec);
  const ends = l.words.filter((w) => w.endSec > 0).map((w) => w.endSec);
  l.startSec = starts.length ? Math.min(...starts) : 0;
  l.endSec = ends.length ? Math.max(...ends) : 0;
}

function cloneLines(lines: Line[]): Line[] {
  return lines.map((l) => ({ ...l, words: l.words.map((w) => ({ ...w })) }));
}

/**
 * Everything that has to be true again once words have moved between lines:
 * numbering, each line's text and envelope, and the raw box that mirrors them.
 * Mutates and returns the patch to hand to set().
 */
function reflow(lines: Line[]) {
  lines.forEach((l, i) => {
    l.index = i;
    l.text = l.words.map((w) => w.text).join(' ');
    syncLine(l);
  });
  return { lines, lyricsRaw: lines.map((l) => l.text).join('\n') };
}

/** Words form one sequence across lines; null means we're at an end of it. */
function seqStep(lines: Line[], li: number, wi: number, dir: 1 | -1) {
  let l = li;
  let w = wi + dir;
  for (;;) {
    if (l < 0 || l >= lines.length) return null;
    if (w >= 0 && w < lines[l].words.length) return { li: l, wi: w };
    l += dir;
    if (l < 0 || l >= lines.length) return null;
    w = dir > 0 ? 0 : lines[l].words.length - 1;
  }
}

/** A word is "closed" once it has both ends; with only a start it's "open". */
function isClosed(w: { startSec: number; endSec: number }) {
  return w.startSec > 0 && w.endSec > w.startSec;
}

export const useStore = create<State>((set, get) => ({
  audioFile: null,
  audioUrl: null,
  audioDuration: 0,
  lyricsRaw: '',
  lines: [],
  currentLine: 0,
  currentWord: 0,
  isPlaying: false,
  playheadSec: 0,

  setAudio: (file) => {
    const url = URL.createObjectURL(file);
    set({ audioFile: file, audioUrl: url });
  },

  setLyricsRaw: (text) => set({ lyricsRaw: text }),

  rebuildLinesFromRaw: () =>
    set((s) => ({
      lines: parseLyrics(s.lyricsRaw),
      currentLine: 0,
      currentWord: 0,
    })),

  setDuration: (sec) => set({ audioDuration: sec }),
  setPlayhead: (sec) => set({ playheadSec: sec }),
  setPlaying: (p) => set({ isPlaying: p }),

  selectWord: (lineIndex, wordIndex) => {
    const { lines } = get();
    if (!lines[lineIndex]?.words[wordIndex]) return;
    set({ currentLine: lineIndex, currentWord: wordIndex });
  },

  /**
   * Pull one word out of its line and drop it back in at `to` — the lyrics
   * pane's drag. The word keeps whatever timing it already carries: the brick
   * is the word *and* its stamps, so fixing a bad line split doesn't cost the
   * work already done on it. `to.wi` is read against the destination as it
   * looks on screen, i.e. before the word is taken out.
   */
  moveWord: (from, to) => {
    const { lines } = get();
    if (!lines[from.li]?.words[from.wi] || !lines[to.li]) return;

    let di = Math.max(0, Math.min(to.wi, lines[to.li].words.length));
    if (to.li === from.li) {
      // Lifting the word first shifts every later slot of this line one left.
      if (di > from.wi) di -= 1;
      if (di === from.wi) return; // dropped back where it came from
    }

    const newLines = cloneLines(lines);
    const [word] = newLines[from.li].words.splice(from.wi, 1);
    newLines[to.li].words.splice(di, 0, word);

    // A line that lost its last word has nothing left to time or export, and
    // an empty row is only in the way — drop it and renumber what follows.
    const emptied = from.li !== to.li && newLines[from.li].words.length === 0;
    const kept = emptied ? newLines.filter((_, i) => i !== from.li) : newLines;
    const landedLine = emptied && to.li > from.li ? to.li - 1 : to.li;

    set({
      ...reflow(kept),
      // The selection rides along with the brick.
      currentLine: landedLine,
      currentWord: di,
    });
  },

  /**
   * Cut one line in two at `wordIndex` — the word at that index opens the new
   * line. Only the grouping changes; every word keeps its own stamps, so a line
   * that was pasted in wrong can be fixed after it has been timed.
   */
  splitLine: (lineIndex, wordIndex) => {
    const { lines, currentLine, currentWord } = get();
    const line = lines[lineIndex];
    // A cut at either end would only buy an empty line.
    if (!line || wordIndex <= 0 || wordIndex >= line.words.length) return;

    const newLines = cloneLines(lines);
    const tail = newLines[lineIndex].words.splice(wordIndex);
    newLines.splice(lineIndex + 1, 0, {
      index: lineIndex + 1,
      text: '',
      startSec: 0,
      endSec: 0,
      words: tail,
    });

    // Keep the same word selected, wherever the cut left it.
    let li = currentLine;
    let wi = currentWord;
    if (currentLine > lineIndex) li += 1;
    else if (currentLine === lineIndex && currentWord >= wordIndex) {
      li += 1;
      wi -= wordIndex;
    }

    set({ ...reflow(newLines), currentLine: li, currentWord: wi });
  },

  /** Glue a line onto the end of the one above it — the undo of a split. */
  mergeLineUp: (lineIndex) => {
    const { lines, currentLine, currentWord } = get();
    if (lineIndex <= 0 || !lines[lineIndex] || !lines[lineIndex - 1]) return;

    const newLines = cloneLines(lines);
    const above = newLines[lineIndex - 1];
    const grown = above.words.length; // where the glued words start
    above.words = above.words.concat(newLines[lineIndex].words);
    newLines.splice(lineIndex, 1);

    let li = currentLine;
    let wi = currentWord;
    if (currentLine === lineIndex) {
      li -= 1;
      wi += grown;
    } else if (currentLine > lineIndex) li -= 1;

    set({ ...reflow(newLines), currentLine: li, currentWord: wi });
  },

  /** Retype one word. Blank is refused — a word with no text is just a gap. */
  setWordText: (lineIndex, wordIndex, text) => {
    const { lines } = get();
    if (!lines[lineIndex]?.words[wordIndex]) return;
    // Spaces would read back as two words on the next parse, so they're the
    // one thing the field can't hold.
    const clean = text.replace(/\s+/g, '');
    if (!clean) return;

    const newLines = cloneLines(lines);
    newLines[lineIndex].words[wordIndex].text = clean;
    set(reflow(newLines));
  },

  /**
   * Write one word's stamps straight from the editor's number fields. Unlike
   * setWordTime — which serves timeline drags — nothing is widened to a minimum
   * here: typed numbers are taken as typed, and a 0 puts the word back to "not
   * stamped".
   */
  setWordStamps: (lineIndex, wordIndex, startSec, endSec) => {
    const { lines, audioDuration } = get();
    if (!lines[lineIndex]?.words[wordIndex]) return;

    const max = audioDuration > 0 ? audioDuration : Number.POSITIVE_INFINITY;
    const clamp = (t: number) => (Number.isFinite(t) ? Math.min(Math.max(t, 0), max) : 0);

    const newLines = cloneLines(lines);
    const w = newLines[lineIndex].words[wordIndex];
    w.startSec = clamp(startSec);
    w.endSec = clamp(endSec);
    syncLine(newLines[lineIndex]);
    set({ lines: newLines });
  },

  /** Drop an untimed placeholder into a line and hand it the selection. */
  insertWord: (lineIndex, wordIndex) => {
    const { lines } = get();
    const line = lines[lineIndex];
    if (!line) return;
    const at = Math.max(0, Math.min(wordIndex, line.words.length));

    const newLines = cloneLines(lines);
    newLines[lineIndex].words.splice(at, 0, { text: NEW_WORD, startSec: 0, endSec: 0 });
    set({ ...reflow(newLines), currentLine: lineIndex, currentWord: at });
  },

  /**
   * Take a word out of the take entirely. The line goes with it if that was its
   * last word, and the selection lands on whatever now sits closest.
   */
  deleteWord: (lineIndex, wordIndex) => {
    const { lines } = get();
    if (!lines[lineIndex]?.words[wordIndex]) return;

    const newLines = cloneLines(lines);
    newLines[lineIndex].words.splice(wordIndex, 1);
    const emptied = newLines[lineIndex].words.length === 0;
    const kept = emptied ? newLines.filter((_, i) => i !== lineIndex) : newLines;

    if (kept.length === 0) {
      set({ ...reflow(kept), currentLine: 0, currentWord: 0 });
      return;
    }

    // Prefer the word that slid into the gap, or the one before it at the end
    // of a line. If the whole line went, the line that took its place — or the
    // last one, when the deleted line was the final one.
    const li = Math.min(lineIndex, kept.length - 1);
    const wi = emptied ? 0 : Math.min(wordIndex, kept[li].words.length - 1);
    set({ ...reflow(kept), currentLine: li, currentWord: wi });
  },

  /**
   * Shuffle the selected word one slot along. At a line's edge it hops to the
   * neighbouring line rather than stopping — words are one sequence, and that's
   * also how a line's first or last word gets re-homed.
   */
  nudgeWord: (dir) => {
    const { lines, currentLine, currentWord, moveWord } = get();
    const line = lines[currentLine];
    if (!line?.words[currentWord]) return;

    if (dir < 0) {
      if (currentWord > 0) moveWord({ li: currentLine, wi: currentWord }, { li: currentLine, wi: currentWord - 1 });
      else if (currentLine > 0)
        moveWord(
          { li: currentLine, wi: currentWord },
          { li: currentLine - 1, wi: lines[currentLine - 1].words.length },
        );
      return;
    }

    // +2, not +1: the drop index is read before the word is lifted out, so
    // landing *after* the next word means pointing past it.
    if (currentWord < line.words.length - 1)
      moveWord({ li: currentLine, wi: currentWord }, { li: currentLine, wi: currentWord + 2 });
    else if (currentLine < lines.length - 1)
      moveWord({ li: currentLine, wi: currentWord }, { li: currentLine + 1, wi: 0 });
  },

  stepSelection: (dir) => {
    const { lines, currentLine, currentWord } = get();
    const next = seqStep(lines, currentLine, currentWord, dir);
    if (next) set({ currentLine: next.li, currentWord: next.wi });
  },

  /**
   * Space on the selected word. A word that is already closed is left alone and
   * just walked past; otherwise its start is (re)stamped. Writing a start also
   * closes the immediately preceding word if that one is still open — but only
   * that one, so stamping after a jump can't glue a distant word shut.
   */
  stampNextWord: (timeSec) => {
    const { lines, currentLine, currentWord } = get();
    const word = lines[currentLine]?.words[currentWord];
    if (!word) return;

    const next = seqStep(lines, currentLine, currentWord, 1);
    const moved = next ? { currentLine: next.li, currentWord: next.wi } : {};

    if (isClosed(word)) {
      set(moved);
      return;
    }

    const newLines = cloneLines(lines);
    newLines[currentLine].words[currentWord].startSec = timeSec;

    const prev = seqStep(lines, currentLine, currentWord, -1);
    if (prev) {
      const p = newLines[prev.li].words[prev.wi];
      if (p.startSec > 0 && p.endSec === 0 && timeSec > p.startSec) {
        p.endSec = timeSec;
        syncLine(newLines[prev.li]);
      }
    }
    syncLine(newLines[currentLine]);

    set({ lines: newLines, ...moved });
  },

  /** "." — pin the end of the selected word at the playhead and move on. */
  setEndAtSelection: (timeSec) => {
    const { lines, currentLine, currentWord } = get();
    const word = lines[currentLine]?.words[currentWord];
    // Nothing to close without a start, and an end before the start is nonsense.
    if (!word || word.startSec <= 0 || timeSec <= word.startSec) return;

    const newLines = cloneLines(lines);
    newLines[currentLine].words[currentWord].endSec = timeSec;
    syncLine(newLines[currentLine]);

    const next = seqStep(lines, currentLine, currentWord, 1);
    set({ lines: newLines, ...(next ? { currentLine: next.li, currentWord: next.wi } : {}) });
  },

  /**
   * "," — pin the end of the word *before* the selection, so a tail can be
   * closed without leaving the spot you're working at. Only touches a word that
   * already has a start; the selection doesn't move.
   */
  setPrevEnd: (timeSec) => {
    const { lines, currentLine, currentWord } = get();
    const prev = seqStep(lines, currentLine, currentWord, -1);
    if (!prev) return;
    const word = lines[prev.li].words[prev.wi];
    if (word.startSec <= 0 || timeSec <= word.startSec) return;

    const newLines = cloneLines(lines);
    newLines[prev.li].words[prev.wi].endSec = timeSec;
    syncLine(newLines[prev.li]);
    set({ lines: newLines });
  },

  /**
   * Backspace: wipe whatever the selected word holds and step back. Neighbours
   * are left untouched — an end written earlier stays where the user put it.
   */
  clearAndStepBack: () => {
    const { lines, currentLine, currentWord } = get();
    const word = lines[currentLine]?.words[currentWord];
    const prev = seqStep(lines, currentLine, currentWord, -1);
    const moved = prev ? { currentLine: prev.li, currentWord: prev.wi } : {};

    if (word && (word.startSec > 0 || word.endSec > 0)) {
      const newLines = cloneLines(lines);
      newLines[currentLine].words[currentWord].startSec = 0;
      newLines[currentLine].words[currentWord].endSec = 0;
      syncLine(newLines[currentLine]);
      set({ lines: newLines, ...moved });
      return;
    }
    set(moved);
  },

  /**
   * Move/resize a single word from the timeline. Times are clamped to the track
   * and to a minimum width; the line envelope is recomputed because the
   * exporters read line.startSec/endSec.
   */
  setWordTime: (lineIndex, wordIndex, startSec, endSec) => {
    const { lines, audioDuration } = get();
    const line = lines[lineIndex];
    if (!line || !line.words[wordIndex]) return;

    const MIN = 0.02;
    const max = audioDuration > 0 ? audioDuration : Number.POSITIVE_INFINITY;
    let s = Math.min(Math.max(startSec, 0), max);
    let e = Math.min(Math.max(endSec, s + MIN), max);
    if (e - s < MIN) s = Math.max(0, e - MIN);

    const newLines = cloneLines(lines);
    newLines[lineIndex].words[wordIndex].startSec = s;
    newLines[lineIndex].words[wordIndex].endSec = e;
    syncLine(newLines[lineIndex]);

    set({ lines: newLines });
  },

  /**
   * Absolute rewrite of one line's word times — used when the whole line is
   * dragged on the timeline. Absolute (not a delta) so a drag can be replayed
   * from its starting snapshot without accumulating rounding error.
   */
  setLineTimes: (lineIndex, times) => {
    const { lines } = get();
    const line = lines[lineIndex];
    if (!line) return;

    const newLines = cloneLines(lines);
    newLines[lineIndex].words.forEach((w, i) => {
      const t = times[i];
      if (!t) return;
      w.startSec = t.startSec;
      w.endSec = t.endSec;
    });
    syncLine(newLines[lineIndex]);

    set({ lines: newLines });
  },

  /**
   * Nudge every stamped word by the same delta. The delta is clamped as a whole
   * (rather than per word) so the relative timing of the take survives a nudge
   * that would otherwise push the first word past 0 or the last past the track.
   * A 0 means "not stamped yet", so untimed words are left alone.
   */
  shiftAll: (deltaSec) => {
    const { lines, audioDuration } = get();
    if (!deltaSec) return;

    const stamped = lines.flatMap((l) => l.words).filter((w) => w.startSec > 0 || w.endSec > 0);
    if (stamped.length === 0) return;

    const MIN = 0.001; // stay above 0, which would read back as "not stamped"
    const times = stamped.flatMap((w) => [w.startSec, w.endSec].filter((t) => t > 0));
    const earliest = Math.min(...times);
    const latest = Math.max(...times);

    // The room clamps are floored at 0: a take that already sits outside the
    // track shouldn't have a nudge flipped into the opposite direction.
    let d = deltaSec;
    if (d < 0) d = Math.max(d, Math.min(0, MIN - earliest));
    if (d > 0 && audioDuration > 0) d = Math.min(d, Math.max(0, audioDuration - latest));
    if (d === 0) return;

    const newLines = cloneLines(lines);
    newLines.forEach((l) => {
      l.words.forEach((w) => {
        if (w.startSec > 0) w.startSec += d;
        if (w.endSec > 0) w.endSec += d;
      });
      syncLine(l);
    });

    set({ lines: newLines });
  },

  resetTiming: () =>
    set((s) => ({
      lines: s.lines.map((l) => ({
        ...l,
        startSec: 0,
        endSec: 0,
        words: l.words.map((w) => ({ ...w, startSec: 0, endSec: 0 })),
      })),
      currentLine: 0,
      currentWord: 0,
    })),

  /**
   * Replace the whole take with a saved project. A duration already measured
   * from the loaded audio wins over the one in the file — that one may have
   * been written against a different cut, and the timeline scales by it.
   */
  loadProject: (p) =>
    set((s) => ({
      lines: p.lines,
      audioDuration: s.audioDuration > 0 ? s.audioDuration : p.audio.durationSec,
      lyricsRaw: p.lines.map((l) => l.text).join('\n'),
      currentLine: 0,
      currentWord: 0,
    })),

  toJSON: () => {
    const { audioFile, audioDuration, lines } = get();
    return {
      version: '1.0',
      audio: {
        filename: audioFile?.name ?? 'unknown.mp3',
        durationSec: audioDuration,
      },
      lines,
    };
  },
}));
