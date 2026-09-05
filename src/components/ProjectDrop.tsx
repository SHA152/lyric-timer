import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { parseProject } from '../import';

/**
 * Drop a previously exported .json anywhere on the page to reload that take.
 * Listens on the window rather than a box, so there's nothing to aim at.
 */
export function ProjectDrop() {
  const loadProject = useStore((s) => s.loadProject);
  const lines = useStore((s) => s.lines);
  const audioFile = useStore((s) => s.audioFile);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // dragenter/leave also fire for every child element the cursor crosses, so
  // the overlay is driven by a depth count instead of the last event seen.
  const depth = useRef(0);

  // The toast is informational; don't make the user dismiss it.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onEnter = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth.current += 1;
      setOver(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault(); // without this the browser just opens the file
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);

      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
        setError(`${file.name} isn't a project .json`);
        return;
      }

      try {
        const project = parseProject(await file.text());

        // Timing lives in memory only — replacing it is unrecoverable, so a
        // take that's already been worked on gets one confirm first.
        const stamped = lines.some((l) => l.words.some((w) => w.startSec > 0 || w.endSec > 0));
        if (stamped && !window.confirm('Replace the current timing with this file?')) return;

        loadProject(project);

        const loaded = audioFile?.name;
        setError(
          loaded && project.audio.filename !== loaded
            ? `Loaded — note it was timed against "${project.audio.filename}"`
            : null,
        );
      } catch (err) {
        setError(`Couldn't load ${file.name}: ${(err as Error).message}`);
      }
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [loadProject, lines, audioFile]);

  return (
    <>
      {over && (
        <div className="drop-overlay">
          <div className="drop-overlay-card">📄 Drop a project .json to replace the timing</div>
        </div>
      )}
      {error && (
        <div className="drop-toast" onClick={() => setError(null)} role="status">
          {error}
        </div>
      )}
    </>
  );
}
