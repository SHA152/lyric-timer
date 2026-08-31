import { useEffect } from 'react';
import { useStore } from './store';
import { AudioPicker } from './components/AudioPicker';
import { Waveform } from './components/Waveform';
import { LyricsPane } from './components/LyricsPane';
import { Timeline } from './components/Timeline';
import { Toolbar } from './components/Toolbar';
import { wsCtrl } from './components/Waveform';
import './App.css';

export default function App() {
  const { audioUrl, playheadSec, stampNextWord, undoLastStamp, lines } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lines.length === 0) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        const ws = wsCtrl();
        if (!ws) return;
        // fine (x0.1) = alt/ctrl — macOS eats ctrl+arrow for Spaces, so alt is the
        // one that actually reaches us there. shift = coarse (x5), plain = 1s.
        const step = e.altKey || e.ctrlKey ? 0.1 : e.shiftKey ? 5 : 1;
        const dir = e.code === 'ArrowLeft' ? -1 : 1;
        const duration = ws.getDuration();
        const next = Math.min(Math.max(ws.getCurrentTime() + dir * step, 0), duration || 0);
        ws.setTime(next);
        return;
      }

      if (e.code === 'Enter') {
        e.preventDefault();
        wsCtrl()?.playPause();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        const ws = wsCtrl();
        if (!ws) return;
        if (!ws.isPlaying()) ws.play();
        stampNextWord(playheadSec);
      } else if (e.code === 'Backspace') {
        e.preventDefault();
        undoLastStamp();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playheadSec, stampNextWord, undoLastStamp, lines.length]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>lyric-timer</h1>
        <p className="tagline">Per-word lyric timing. Press <kbd>Space</kbd> on each word as it plays, <kbd>Backspace</kbd> to undo,{' '}
          <kbd>Enter</kbd> to play/pause. <kbd>←</kbd>/<kbd>→</kbd> seek 1s —{' '}
          <kbd>⌥</kbd>/<kbd>Ctrl</kbd> for 0.1s, <kbd>Shift</kbd> for 5s.</p>
      </header>

      {!audioUrl ? (
        <AudioPicker />
      ) : (
        <>
          <Waveform audioUrl={audioUrl} />
          <Timeline />
          <Toolbar />
          <div className="main-grid">
            <LyricsPane />
          </div>
          <footer className="app-footer">
            Playhead: <strong>{playheadSec.toFixed(2)}s</strong>
          </footer>
        </>
      )}
    </div>
  );
}
