import { useStore } from '../store';
import { wsCtrl } from './Waveform';
import { SplitButton } from './SplitButton';
import { toJSON, toLRC, toEnhancedLRC, toSRT, toWordSRT, download } from '../export';

export function Toolbar({ onShowHelp }: { onShowHelp: () => void }) {
  const isPlaying = useStore((s) => s.isPlaying);
  const lineCount = useStore((s) => s.lines.length);
  const resetTiming = useStore((s) => s.resetTiming);
  const projJSON = useStore((s) => s.toJSON);
  const audioFile = useStore((s) => s.audioFile);

  const play = () => wsCtrl()?.play();
  const pause = () => wsCtrl()?.pause();

  const base = audioFile?.name?.replace(/\.[^.]+$/, '') ?? 'lyrics';
  const empty = lineCount === 0;

  return (
    <div className="toolbar">
      <button onClick={isPlaying ? pause : play} disabled={empty}>
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>
      <button onClick={resetTiming} disabled={empty}>
        ↺ Reset timing
      </button>
      <span className="spacer" />
      <button onClick={() => download(`${base}.json`, toJSON(projJSON()), 'application/json')} disabled={empty}>
        ⬇ JSON
      </button>
      <SplitButton
        label="⬇ LRC"
        disabled={empty}
        options={[
          {
            label: 'LRC',
            hint: 'One timestamp per line',
            onSelect: () => download(`${base}.lrc`, toLRC(projJSON())),
          },
          {
            label: 'Enhanced LRC (A2)',
            hint: 'Per-word timestamps',
            onSelect: () => download(`${base}.word.lrc`, toEnhancedLRC(projJSON())),
          },
        ]}
      />
      <SplitButton
        label="⬇ SRT"
        disabled={empty}
        options={[
          {
            label: 'SRT',
            hint: 'One cue per line',
            onSelect: () => download(`${base}.srt`, toSRT(projJSON())),
          },
          {
            label: 'Word SRT',
            hint: 'One cue per word',
            onSelect: () => download(`${base}.word.srt`, toWordSRT(projJSON())),
          },
        ]}
      />
      <button className="help-btn" onClick={onShowHelp} title="Keyboard shortcuts (? or F1)">
        ?
      </button>
    </div>
  );
}
