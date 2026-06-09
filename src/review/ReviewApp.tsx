import { useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { ReviewProject, WordIssue } from './types';
import { detectIssues } from './detectIssues';
import './ReviewApp.css';

interface Props {
  /** Set if we're embedded under a host like /edit and have a token + song id to load from */
  embedded?: {
    songId: string;
    token: string;
    audioUrl: string;
    backToWatch?: string;
  };
}

export default function ReviewApp({ embedded }: Props) {
  const [project, setProject] = useState<ReviewProject | null>(null);
  const [, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selected, setSelected] = useState<{ line: number; word: number } | null>(null);
  const [status, setStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const wsRef = useRef<WaveSurfer | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const issues: WordIssue[] = useMemo(() => (project ? detectIssues(project) : []), [project]);

  // Auto-load if embedded
  useEffect(() => {
    if (!embedded) return;
    const { songId, token, audioUrl } = embedded;
    setAudioUrl(audioUrl);
    fetch(`/api/timing/${songId}?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.version === '1.0') setProject(data);
        else setStatus('Failed to load: ' + (data.error || 'bad response'));
      })
      .catch((e) => setStatus('Load error: ' + e.message));
  }, [embedded]);

  // Set up WaveSurfer when audio is available
  useEffect(() => {
    if (!audioUrl || !waveformRef.current) return;
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#475569',
      progressColor: '#3b82f6',
      cursorColor: '#ef4444',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      height: 80,
      normalize: true,
      minPxPerSec: 100, // zoom: 100px per second so word markers fit
      url: audioUrl,
    });
    wsRef.current = ws;
    ws.on('audioprocess', (t) => setPlayhead(t));
    ws.on('seeking', (t) => setPlayhead(t));
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [audioUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (!project) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (wsRef.current?.isPlaying()) wsRef.current?.pause();
        else wsRef.current?.play();
        return;
      }
      if (!selected) return;
      const { line, word } = selected;
      const w = project.lines[line]?.words[word];
      if (!w) return;
      let delta = 0;
      let setToPlayhead = false;
      if (e.key === '[')          delta = e.shiftKey ? -0.25 : -0.05;
      else if (e.key === ']')     delta = e.shiftKey ?  0.25 :  0.05;
      else if (e.key === 't' || e.key === 'T') setToPlayhead = true;
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newWord = word > 0 ? word - 1 : 0;
        const newLine = newWord === word && line > 0 ? line - 1 : line;
        const newWordIdx = newLine !== line ? project.lines[newLine].words.length - 1 : newWord;
        setSelected({ line: newLine, word: newWordIdx });
        seekTo(project.lines[newLine].words[newWordIdx].startSec);
        return;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const line2 = project.lines[line];
        if (word + 1 < line2.words.length) setSelected({ line, word: word + 1 });
        else if (line + 1 < project.lines.length) setSelected({ line: line + 1, word: 0 });
        const next = (word + 1 < line2.words.length)
          ? line2.words[word + 1]
          : project.lines[line + 1]?.words[0];
        if (next) seekTo(next.startSec);
        return;
      } else return;

      e.preventDefault();
      updateWord(line, word, setToPlayhead ? playhead : w.startSec + delta);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project, selected, playhead]);

  function seekTo(sec: number) {
    if (!wsRef.current) return;
    const dur = wsRef.current.getDuration();
    if (dur) wsRef.current.seekTo(sec / dur);
  }

  function updateWord(lineIdx: number, wordIdx: number, newStart: number) {
    setProject((p) => {
      if (!p) return p;
      const lines = p.lines.map((l, li) => {
        if (li !== lineIdx) return l;
        const words = l.words.map((w, wi) => {
          if (wi !== wordIdx) return w;
          return { ...w, startSec: Math.max(0, newStart) };
        });
        // Adjust prev word's end to new start (no overlap)
        if (wordIdx > 0) {
          const prev = words[wordIdx - 1];
          if (prev.endSec > newStart) words[wordIdx - 1] = { ...prev, endSec: newStart };
        }
        return {
          ...l,
          startSec: words[0].startSec,
          endSec: Math.max(...words.map((w) => w.endSec)),
          words,
        };
      });
      return { ...p, lines };
    });
    setDirty(true);
  }

  async function save() {
    if (!project || !embedded) return;
    setStatus('Saving…');
    const r = await fetch(`/api/timing/${embedded.songId}?token=${encodeURIComponent(embedded.token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    const j = await r.json();
    if (j.ok) { setStatus('✓ Saved'); setDirty(false); }
    else setStatus('Save failed: ' + (j.error || 'unknown'));
  }

  async function rerender() {
    if (!embedded) return;
    setStatus('Queuing render…');
    const r = await fetch(`/api/render/${embedded.songId}?token=${encodeURIComponent(embedded.token)}`, { method: 'POST' });
    const j = await r.json();
    if (j.ok) setStatus(`✓ Render queued (pid ${j.jobPid}). Output: ${j.outFile.split('/').pop()}. Watch the log: ${j.logFile.split('/').pop()}`);
    else setStatus('Render failed: ' + (j.error || 'unknown'));
  }

  return (
    <div className="review">
      <header className="review-header">
        <div>
          <div className="tag">Lyric timing review</div>
          <h1>{project ? project.audio.filename : 'Loading…'}</h1>
        </div>
        <div className="header-actions">
          {embedded?.backToWatch && <a href={embedded.backToWatch} className="btn-link">← watch</a>}
          {dirty && <span className="dirty-flag">● unsaved</span>}
          <button className="btn-primary" onClick={save} disabled={!project || !embedded}>💾 Save</button>
          <button className="btn-secondary" onClick={rerender} disabled={!embedded}>🎬 Re-render</button>
        </div>
      </header>

      {!audioUrl && !embedded && (
        <div className="card">
          <p>Load an audio file to begin:</p>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setAudioFile(f); setAudioUrl(URL.createObjectURL(f)); }
            }}
          />
          <p>Then load a JSON file:</p>
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              try { setProject(JSON.parse(text)); }
              catch (err) { setStatus('Invalid JSON: ' + (err as Error).message); }
            }}
          />
        </div>
      )}

      <div ref={waveformRef} className="waveform" />

      <div className="toolbar">
        <button onClick={() => wsRef.current?.[isPlaying ? 'pause' : 'play']()} disabled={!project}>
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <span className="playhead">⏱ {playhead.toFixed(2)}s</span>
        <span className="hint">
          <kbd>Space</kbd> play/pause &nbsp;
          <kbd>←</kbd>/<kbd>→</kbd> prev/next word &nbsp;
          <kbd>[</kbd>/<kbd>]</kbd> nudge ±50ms &nbsp;
          <kbd>Shift</kbd>+<kbd>[</kbd>/<kbd>]</kbd> nudge ±250ms &nbsp;
          <kbd>T</kbd> set to playhead
        </span>
      </div>

      {project && (
        <>
          {issues.length > 0 && (
            <div className="issues">
              <strong>{issues.length} issue{issues.length === 1 ? '' : 's'} to review:</strong>
              <ul>
                {issues.slice(0, 10).map((iss, i) => (
                  <li key={i}>
                    <button
                      className="issue-link"
                      onClick={() => {
                        setSelected({ line: iss.lineIndex, word: iss.wordIndex });
                        const w = project.lines[iss.lineIndex].words[iss.wordIndex];
                        if (w) seekTo(w.startSec);
                      }}
                    >
                      ▸ {iss.message}
                    </button>
                  </li>
                ))}
                {issues.length > 10 && <li className="more">…and {issues.length - 10} more</li>}
              </ul>
            </div>
          )}

          <div className="lines">
            {project.lines.map((line, li) => {
              const lineActive = playhead >= line.startSec && playhead < line.endSec;
              return (
                <div key={li} className={`line ${lineActive ? 'line-active' : ''}`}>
                  <div className="line-meta">
                    <span className="line-no">{li + 1}</span>
                    <span className="line-section">{line.section || ''}</span>
                    <span className="line-time">{line.startSec.toFixed(2)} – {line.endSec.toFixed(2)}</span>
                  </div>
                  <div className="line-words">
                    {line.words.map((w, wi) => {
                      const active = playhead >= w.startSec && playhead < w.endSec;
                      const past   = playhead >= w.endSec;
                      const isSelected = selected?.line === li && selected?.word === wi;
                      const issueLevel = issues.find((iss) => iss.lineIndex === li && iss.wordIndex === wi);
                      return (
                        <button
                          key={wi}
                          className={`word ${active ? 'word-active' : ''} ${past ? 'word-past' : ''} ${isSelected ? 'word-selected' : ''} ${issueLevel ? 'word-issue' : ''}`}
                          title={`${w.startSec.toFixed(2)}-${w.endSec.toFixed(2)}s${issueLevel ? ' · ' + issueLevel.message : ''}`}
                          onClick={() => {
                            setSelected({ line: li, word: wi });
                            seekTo(w.startSec);
                          }}
                        >
                          {w.text}
                          <span className="word-time">{w.startSec.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {status && <div className="status">{status}</div>}
    </div>
  );
}
