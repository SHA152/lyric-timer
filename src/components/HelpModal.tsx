import { useEffect, useRef } from 'react';

/** Keys as they're shown, paired with what they do. */
const SHORTCUTS: { keys: string[]; sep?: string; action: string }[] = [
  { keys: ['Space'], action: 'Stamp the selected word and move to the next one — starts playback if paused' },
  { keys: ['.'], action: "Pin the end of the selected word" },
  { keys: [','], action: "Pin the end of the previous word" },
  { keys: ['Backspace'], action: 'Clear the stamp and step back one word' },
  { keys: ['Q', 'E'], sep: '/', action: 'Move the selection back / forward without touching the timing' },
  { keys: ['Enter'], action: 'Play / pause' },
  { keys: ['←', '→'], sep: '/', action: 'Seek 1 second' },
  { keys: ['⌥', 'Ctrl'], sep: 'or', action: 'Held with ← / → — seek 0.1 second' },
  { keys: ['Shift'], action: 'Held with ← / → — seek 5 seconds' },
  { keys: ['⌘', 'Ctrl'], sep: 'or', action: 'Held with the wheel over the timeline — zoom' },
  { keys: ['?', 'F1'], sep: '/', action: 'Open or close this help' },
];

/**
 * The shortcut reference, out of the way until asked for. The caller owns the
 * open flag so it can also mute the app's global shortcuts while we're up.
 */
export function HelpModal({ onClose }: { onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);

  // Focus the card, not the close button: the dialog needs to own the keyboard
  // (so Escape and tabbing start here) without a focus ring shouting at us.
  useEffect(() => {
    card.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        // The backdrop closes on click; the card itself must not pass its own
        // clicks up to it.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="help-title">Keyboard shortcuts</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <table className="help-table">
          <thead>
            <tr>
              <th>Keys</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys.join()}>
                <td className="help-keys">
                  {s.keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && <span className="help-sep"> {s.sep ?? '+'} </span>}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </td>
                <td>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
