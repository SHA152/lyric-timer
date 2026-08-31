import { create } from 'zustand';
import type { Line, LyricProject } from './types';

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

  stampNextWord: (timeSec: number) => void;
  undoLastStamp: () => void;
  setWordTime: (lineIndex: number, wordIndex: number, startSec: number, endSec: number) => void;
  setLineTimes: (lineIndex: number, times: { startSec: number; endSec: number }[]) => void;
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

  stampNextWord: (timeSec) => {
    const { lines, currentLine, currentWord } = get();
    if (currentLine >= lines.length) return;
    const newLines = lines.map((l) => ({ ...l, words: l.words.map((w) => ({ ...w })) }));
    const line = newLines[currentLine];
    const word = line.words[currentWord];
    word.startSec = timeSec;

    // Close the previous word's end time
    if (currentWord > 0) {
      line.words[currentWord - 1].endSec = timeSec;
    } else if (currentLine > 0) {
      const prevLine = newLines[currentLine - 1];
      const last = prevLine.words[prevLine.words.length - 1];
      if (last && last.endSec === 0) last.endSec = timeSec;
      prevLine.endSec = timeSec;
    }
    if (currentWord === 0) {
      line.startSec = timeSec;
    }

    let nextLine = currentLine;
    let nextWord = currentWord + 1;
    if (nextWord >= line.words.length) {
      nextLine = currentLine + 1;
      nextWord = 0;
    }
    set({ lines: newLines, currentLine: nextLine, currentWord: nextWord });
  },

  undoLastStamp: () => {
    const { lines, currentLine, currentWord } = get();

    // The last stamped word is the one right before the cursor.
    let targetLine = currentLine;
    let targetWord = currentWord - 1;
    if (targetWord < 0) {
      targetLine = currentLine - 1;
      if (targetLine < 0) return;
      targetWord = lines[targetLine].words.length - 1;
      if (targetWord < 0) return;
    }
    if (targetLine >= lines.length) return;

    const newLines = lines.map((l) => ({ ...l, words: l.words.map((w) => ({ ...w })) }));
    const line = newLines[targetLine];
    line.words[targetWord].startSec = 0;
    line.words[targetWord].endSec = 0;
    if (targetWord === 0) line.startSec = 0;

    // Re-open the end time that stamping this word had closed.
    if (targetWord > 0) {
      line.words[targetWord - 1].endSec = 0;
    } else if (targetLine > 0) {
      const prevLine = newLines[targetLine - 1];
      const last = prevLine.words[prevLine.words.length - 1];
      if (last) last.endSec = 0;
      prevLine.endSec = 0;
    }

    set({ lines: newLines, currentLine: targetLine, currentWord: targetWord });
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

    const newLines = lines.map((l) => ({ ...l, words: l.words.map((w) => ({ ...w })) }));
    const nl = newLines[lineIndex];
    nl.words[wordIndex].startSec = s;
    nl.words[wordIndex].endSec = e;

    const starts = nl.words.filter((w) => w.startSec > 0).map((w) => w.startSec);
    const ends = nl.words.filter((w) => w.endSec > 0).map((w) => w.endSec);
    nl.startSec = starts.length ? Math.min(...starts) : 0;
    nl.endSec = ends.length ? Math.max(...ends) : 0;

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

    const newLines = lines.map((l) => ({ ...l, words: l.words.map((w) => ({ ...w })) }));
    const nl = newLines[lineIndex];
    nl.words.forEach((w, i) => {
      const t = times[i];
      if (!t) return;
      w.startSec = t.startSec;
      w.endSec = t.endSec;
    });

    const starts = nl.words.filter((w) => w.startSec > 0).map((w) => w.startSec);
    const ends = nl.words.filter((w) => w.endSec > 0).map((w) => w.endSec);
    nl.startSec = starts.length ? Math.min(...starts) : 0;
    nl.endSec = ends.length ? Math.max(...ends) : 0;

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

  loadProject: (p) =>
    set({
      lines: p.lines,
      audioDuration: p.audio.durationSec,
      lyricsRaw: p.lines.map((l) => l.text).join('\n'),
      currentLine: 0,
      currentWord: 0,
    }),

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
