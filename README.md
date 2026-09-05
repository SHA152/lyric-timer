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

## Install

### Desktop app (no Node, no npm)

Grab an installer from the [Releases](https://github.com/abesmon/lyric-timer/releases) page:

| OS | File |
|---|---|
| macOS 10.15+ (Intel & Apple Silicon) | `Lyric Timer_x.y.z_universal.dmg` |
| Windows 10/11 x64 | `Lyric Timer_x.y.z_x64-setup.exe` (or the `.msi`) |

The builds are **not code-signed**, so the OS will warn you on first launch:

- **macOS** — right-click the app → *Open* → *Open*, or run once:
  ```bash
  xattr -cr "/Applications/Lyric Timer.app"
  ```
- **Windows** — SmartScreen → *More info* → *Run anyway*

### Browser

The app is pure client-side, so it also runs as a static page — nothing is uploaded anywhere.

## Development

```bash
npm install
npm run dev        # browser, http://localhost:5173
npm run app:dev    # desktop app (needs Rust: https://rustup.rs)
npm run app:build  # installers for the current OS, into src-tauri/target/release/bundle
```

npm and Rust are **build-time** requirements only — end users need neither.

Tagging a commit `vX.Y.Z` and pushing the tag builds macOS + Windows installers in CI and
attaches them to a draft GitHub release (`.github/workflows/release.yml`). Bump the version in
both `package.json` and `src-tauri/tauri.conf.json` before tagging.

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
