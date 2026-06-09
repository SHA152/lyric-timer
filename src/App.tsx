import { useEffect } from 'react';
import { useStore } from './store';
import { AudioPicker } from './components/AudioPicker';
import { Waveform } from './components/Waveform';
import { LyricsPane } from './components/LyricsPane';
import { Toolbar } from './components/Toolbar';
import { wsCtrl } from './components/Waveform';
import './App.css';

export default function App() {
  const { audioUrl, playheadSec, stampNextWord, lines } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && lines.length > 0 && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const ws = wsCtrl();
        if (!ws) return;
        if (!ws.isPlaying()) ws.play();
        stampNextWord(playheadSec);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playheadSec, stampNextWord, lines.length]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>lyric-timer</h1>
        <p className="tagline">Per-word lyric timing. Press <kbd>Space</kbd> on each word as it plays.</p>
      </header>

      {!audioUrl ? (
        <AudioPicker />
      ) : (
        <>
          <Waveform audioUrl={audioUrl} />
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
