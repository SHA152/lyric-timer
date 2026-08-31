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
