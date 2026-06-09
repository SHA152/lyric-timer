export interface Word {
  text: string;
  startSec: number;
  endSec: number;
}

export interface Line {
  index: number;
  text: string;
  startSec: number;
  endSec: number;
  words: Word[];
}

export interface LyricProject {
  version: '1.0';
  audio: {
    filename: string;
    durationSec: number;
  };
  lines: Line[];
}
