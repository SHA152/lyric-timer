import { useStore } from '../store';
import { wsCtrl } from './Waveform';
import { toJSON, toLRC, toEnhancedLRC, toSRT, toWordSRT, download } from '../export';

export function Toolbar() {
  const isPlaying = useStore((s) => s.isPlaying);
  const lineCount = useStore((s) => s.lines.length);
  const resetTiming = useStore((s) => s.resetTiming);
  const projJSON = useStore((s) => s.toJSON);
  const audioFile = useStore((s) => s.audioFile);

  const play = () => wsCtrl()?.play();
  const pause = () => wsCtrl()?.pause();

  const base = audioFile?.name?.replace(/\.[^.]+$/, '') ?? 'lyrics';

  return (
    <div className="toolbar">
      <button onClick={isPlaying ? pause : play} disabled={lineCount === 0}>
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>
      <button onClick={resetTiming} disabled={lineCount === 0}>
        ↺ Reset timing
      </button>
      <span className="spacer" />
      <button onClick={() => download(`${base}.json`, toJSON(projJSON()), 'application/json')} disabled={lineCount === 0}>
        ⬇ JSON
      </button>
      <button onClick={() => download(`${base}.lrc`, toLRC(projJSON()))} disabled={lineCount === 0}>
        ⬇ LRC
      </button>
      <button
        onClick={() => download(`${base}.word.lrc`, toEnhancedLRC(projJSON()))}
        disabled={lineCount === 0}
        title="Enhanced LRC (A2) — per-word timestamps"
      >
        ⬇ LRC<sup>+</sup>
      </button>
      <button onClick={() => download(`${base}.srt`, toSRT(projJSON()))} disabled={lineCount === 0}>
        ⬇ SRT
      </button>
      <button
        onClick={() => download(`${base}.word.srt`, toWordSRT(projJSON()))}
        disabled={lineCount === 0}
        title="SRT with one cue per word"
      >
        ⬇ SRT<sup>+</sup>
      </button>
    </div>
  );
}
