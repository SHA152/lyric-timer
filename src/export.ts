import type { LyricProject } from './types';

function fmtLrcTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function fmtSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
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

export function toJSON(p: LyricProject): string {
  return JSON.stringify(p, null, 2);
}

export function download(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
