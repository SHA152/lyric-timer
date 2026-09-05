import { useStore } from '../store';
import { SplitButton } from './SplitButton';
import { toJSON, toLRC, toEnhancedLRC, toSRT, toWordSRT, download } from '../export';

/** The save group in the top bar: one plain button and two split families. */
export function ExportActions() {
  const lineCount = useStore((s) => s.lines.length);
  const projJSON = useStore((s) => s.toJSON);
  const audioFile = useStore((s) => s.audioFile);

  const base = audioFile?.name?.replace(/\.[^.]+$/, '') ?? 'lyrics';
  const empty = lineCount === 0;

  return (
    <>
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
    </>
  );
}
