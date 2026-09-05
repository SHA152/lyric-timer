import { useEffect, useState } from 'react';
import { useStore } from './store';
import { AudioPicker } from './components/AudioPicker';
import { Waveform } from './components/Waveform';
import { LyricsPane } from './components/LyricsPane';
import { Timeline } from './components/Timeline';
import { ExportActions } from './components/ExportActions';
import { ResetTiming } from './components/ResetTiming';
import { ProjectDrop } from './components/ProjectDrop';
import { HelpModal } from './components/HelpModal';
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
  const [helpOpen, setHelpOpen] = useState(false);

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
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      // F1 is the desktop convention, "?" the web one — take both. Match the
      // code too, so shift+/ still opens help on a non-latin layout.
      if (e.key === 'F1' || e.key === '?' || (e.code === 'Slash' && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lineCount === 0 || helpOpen) return;
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
    helpOpen,
  ]);

  return (
    <div className="app">
      <ProjectDrop />
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      <header className="app-bar">
        <h1>lyric-timer</h1>
        <span className="panel-spacer" />
        {/* Nothing to save until a track is open, so the group waits for one. */}
        {audioUrl && <ExportActions />}
        <button className="help-btn" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (? or F1)">
          ?
        </button>
      </header>

      {!audioUrl ? (
        // Nothing loaded yet: just the drop target. The shortcuts only make
        // sense once there's a track to press them against.
        <AudioPicker />
      ) : (
        <>
          <Waveform audioUrl={audioUrl} />
          <Timeline />
          <div className="panel lyrics-panel">
            <div className="panel-head">
              <span className="panel-title">Lyrics</span>
              <span className="panel-hint">
                click&nbsp;=&nbsp;select · drag&nbsp;a&nbsp;word&nbsp;=&nbsp;re-order it, timing and all
              </span>
              <span className="panel-spacer" />
              <ResetTiming />
            </div>
            <div className="lyrics-body">
              <LyricsPane />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
