import { useStore } from '../store';
import { wsCtrl } from './Waveform';
import { toJSON, toLRC, toSRT, download } from '../export';

export function Toolbar() {
  const { isPlaying, lines, resetTiming, toJSON: projJSON, audioFile } = useStore();

  const play = () => wsCtrl()?.play();
  const pause = () => wsCtrl()?.pause();

  const base = audioFile?.name?.replace(/\.[^.]+$/, '') ?? 'lyrics';

  return (
    <div className="toolbar">
      <button onClick={isPlaying ? pause : play} disabled={lines.length === 0}>
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>
      <button onClick={resetTiming} disabled={lines.length === 0}>
        ↺ Reset timing
      </button>
      <span className="spacer" />
      <button onClick={() => download(`${base}.json`, toJSON(projJSON()), 'application/json')} disabled={lines.length === 0}>
        ⬇ JSON
      </button>
      <button onClick={() => download(`${base}.lrc`, toLRC(projJSON()))} disabled={lines.length === 0}>
        ⬇ LRC
      </button>
      <button onClick={() => download(`${base}.srt`, toSRT(projJSON()))} disabled={lines.length === 0}>
        ⬇ SRT
      </button>
    </div>
  );
}
