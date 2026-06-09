import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useStore } from '../store';

interface Props {
  audioUrl: string;
}

export function Waveform({ audioUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const { setDuration, setPlayhead, setPlaying } = useStore();

  useEffect(() => {
    if (!containerRef.current) return;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#6b7280',
      progressColor: '#3b82f6',
      cursorColor: '#ef4444',
      cursorWidth: 2,
      barWidth: 2,
      barRadius: 1,
      barGap: 1,
      height: 120,
      normalize: true,
      url: audioUrl,
    });
    wsRef.current = ws;

    ws.on('ready', () => setDuration(ws.getDuration()));
    ws.on('audioprocess', (t) => setPlayhead(t));
    ws.on('seeking', (t) => setPlayhead(t));
    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => setPlaying(false));
    ws.on('finish', () => setPlaying(false));

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [audioUrl, setDuration, setPlayhead, setPlaying]);

  // expose controls via window for the toolbar (cheap MVP — refactor later)
  useEffect(() => {
    (window as unknown as { __ws?: WaveSurfer | null }).__ws = wsRef.current;
  });

  return <div ref={containerRef} className="waveform" />;
}

export function wsCtrl() {
  return (window as unknown as { __ws?: WaveSurfer | null }).__ws ?? null;
}
