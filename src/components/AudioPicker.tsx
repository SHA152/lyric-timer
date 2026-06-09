import { useStore } from '../store';

export function AudioPicker() {
  const setAudio = useStore((s) => s.setAudio);

  return (
    <label className="audio-picker">
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setAudio(f);
        }}
      />
      <span>🎵 Drop or pick an audio file to begin</span>
    </label>
  );
}
