import { useEffect } from 'react';
import { useStore } from './store';
import { AudioPicker } from './components/AudioPicker';
import { Waveform } from './components/Waveform';
import { LyricsPane } from './components/LyricsPane';
import { Timeline } from './components/Timeline';
import { Toolbar } from './components/Toolbar';
import { ShiftBar } from './components/ShiftBar';
import { ProjectDrop } from './components/ProjectDrop';
import { wsCtrl } from './components/Waveform';
import './App.css';

/**
 * The audio clock at this instant. Every stamp goes through here rather than
 * through the store's playheadSec, which is only ever as fresh as the last
 * committed React render — under load that ran 100ms+ behind the audio, and
 * always behind, so the error was a systematic offset rather than jitter.
 */
function stampTime(): number | null {
  const ws = wsCtrl();
  return ws ? ws.getCurrentTime() : null;
}

/** Own subscription, so the per-frame playhead doesn't re-render the app. */
function PlayheadReadout() {
  const t = useStore((s) => s.playheadSec);
  return <strong>{t.toFixed(2)}s</strong>;
}

export default function App() {
  // Selectors, not a bare useStore(): an unselected subscription re-renders this
  // whole tree on every playhead tick (~60/s), which is what put the render
  // queue — and with it the stamped times — behind the audio.
  const audioUrl = useStore((s) => s.audioUrl);
  const stampNextWord = useStore((s) => s.stampNextWord);
  const setEndAtSelection = useStore((s) => s.setEndAtSelection);
  const setPrevEnd = useStore((s) => s.setPrevEnd);
  const clearAndStepBack = useStore((s) => s.clearAndStepBack);
  const stepSelection = useStore((s) => s.stepSelection);
  const lineCount = useStore((s) => s.lines.length);
  const lyricsRaw = useStore((s) => s.lyricsRaw);

  // Timing lives in memory only, so a stray back gesture or a closed tab throws
  // the whole take away. Arm the browser's own confirm as soon as there's work.
  useEffect(() => {
    if (lineCount === 0 && lyricsRaw.trim().length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // older browsers only prompt when this is set
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [lineCount, lyricsRaw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lineCount === 0) return;
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

      // Q/E walk the selection without touching anything. Matched on code so
      // they still work on a non-latin layout.
      if (e.code === 'KeyQ' || e.code === 'KeyE') {
        e.preventDefault();
        stepSelection(e.code === 'KeyQ' ? -1 : 1);
        return;
      }

      // "." and "," live on Slash in the russian layout, so accept either signal.
      if (e.code === 'Period' || e.key === '.') {
        e.preventDefault();
        const t = stampTime();
        if (t !== null) setEndAtSelection(t);
        return;
      }

      if (e.code === 'Comma' || e.key === ',') {
        e.preventDefault();
        const t = stampTime();
        if (t !== null) setPrevEnd(t);
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        const ws = wsCtrl();
        if (!ws) return;
        // Read the clock before play(): the stamp is where the audio was when
        // the key went down, not wherever it has got to by the time we return.
        const t = ws.getCurrentTime();
        if (!ws.isPlaying()) ws.play();
        stampNextWord(t);
      } else if (e.code === 'Backspace') {
        e.preventDefault();
        clearAndStepBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    stampNextWord,
    setEndAtSelection,
    setPrevEnd,
    clearAndStepBack,
    stepSelection,
    lineCount,
  ]);

  return (
    <div className="app">
      <ProjectDrop />
      <header className="app-header">
        <h1>lyric-timer</h1>
        <p className="tagline">
          Per-word lyric timing. <kbd>Space</kbd> stamps the selected word and moves on,{' '}
          <kbd>.</kbd> pins its end and <kbd>,</kbd> the previous word's,{' '}
          <kbd>Backspace</kbd> clears it and steps back,{' '}
          <kbd>Q</kbd>/<kbd>E</kbd> move the selection. <kbd>Enter</kbd> plays/pauses,{' '}
          <kbd>←</kbd>/<kbd>→</kbd> seek 1s — <kbd>⌥</kbd>/<kbd>Ctrl</kbd> for 0.1s,{' '}
          <kbd>Shift</kbd> for 5s.
        </p>
      </header>

      {!audioUrl ? (
        <AudioPicker />
      ) : (
        <>
          <Waveform audioUrl={audioUrl} />
          <Timeline />
          <Toolbar />
          <ShiftBar />
          <div className="main-grid">
            <LyricsPane />
          </div>
          <footer className="app-footer">
            Playhead: <PlayheadReadout />
          </footer>
        </>
      )}
    </div>
  );
}
