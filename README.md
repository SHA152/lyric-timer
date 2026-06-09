# lyric-timer

A clean, fast, **open-source** per-word lyric timing tool. Drop in an audio file and your lyrics, scrub the waveform, tap to stamp each word's start time, export to JSON, LRC, or SRT.

Built because every existing tool is either paywalled, abandoned, or designed around per-line timing when modern karaoke/lyric videos need per-word.

## Features

- 🎵 Waveform-based audio scrubbing (WaveSurfer.js v7)
- ⌨️ Tap-to-stamp keyboard workflow — press a key when you hear each word
- ✏️ Edit any timestamp by dragging it on the waveform
- 📦 Export to **JSON** (with word-level timing), **LRC** (line-level), or **SRT** (subtitle)
- 💾 Auto-saves to your browser; no server, no account, no tracking
- 🤖 (Coming) Optional WhisperX auto-alignment for a first-pass draft

## Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints.

## Usage

1. Drop or pick an audio file (mp3, wav, m4a, ogg)
2. Paste lyrics into the right pane (one line per line, words separated by spaces)
3. Hit **Start**, then tap the **space bar** as each word plays
4. Adjust any word by dragging it on the waveform
5. **Export** as JSON / LRC / SRT

## Output format (JSON)

```json
{
  "version": "1.0",
  "audio": {"filename": "track.mp3", "durationSec": 213.4},
  "lines": [
    {
      "index": 0,
      "text": "Freedom is the goal",
      "startSec": 12.4,
      "endSec": 15.1,
      "words": [
        {"text": "Freedom", "startSec": 12.4, "endSec": 13.0},
        {"text": "is",      "startSec": 13.0, "endSec": 13.2},
        {"text": "the",     "startSec": 13.2, "endSec": 13.4},
        {"text": "the goal","startSec": 13.4, "endSec": 15.1}
      ]
    }
  ]
}
```

This format is consumed by [Remotion](https://www.remotion.dev/)-based lyric video pipelines (a reference implementation lives at the author's `shakil-music-studio`).

## Roadmap

- [ ] WhisperX integration for auto-alignment first pass
- [ ] Multi-language support (Bengali, Hindi, etc.)
- [ ] Keyboard-only editing (no mouse needed)
- [ ] Collaborative editing
- [ ] Export to Remotion-ready format directly

## License

MIT — see [LICENSE](./LICENSE)

## Contributing

PRs welcome. This is built for personal use but designed to be useful to anyone making lyric/karaoke content.
