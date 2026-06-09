// LyricProject extended with studio's section markers + per-word confidence.
export interface ReviewWord {
  text: string;
  startSec: number;
  endSec: number;
  /** Optional confidence (0..1) if available from the aligner. */
  confidence?: number;
  /** Set true if this word was interpolated, not directly matched. */
  interpolated?: boolean;
}

export interface ReviewLine {
  index: number;
  text: string;
  startSec: number;
  endSec: number;
  section?: string;
  words: ReviewWord[];
}

export interface SectionMarker {
  text: string;
  startSec: number;
  endSec: number;
}

export interface ReviewProject {
  version: '1.0';
  audio: {
    filename: string;
    durationSec: number;
  };
  sections?: SectionMarker[];
  lines: ReviewLine[];
}

export interface WordIssue {
  lineIndex: number;
  wordIndex: number;
  kind: 'collapsed-line' | 'zero-duration' | 'reverse-order' | 'unanchored';
  message: string;
}
