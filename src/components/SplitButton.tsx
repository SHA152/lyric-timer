import { useEffect, useRef, useState } from 'react';

export type SplitOption = {
  label: string;
  /** Second line in the menu — what this variant actually produces. */
  hint?: string;
  onSelect: () => void;
};

/**
 * A button split in two: the wide half fires the default action, the caret
 * opens the rest. `options[0]` is the default — the menu still lists it, so
 * the menu is a complete picture of the group rather than "the other ones".
 */
export function SplitButton({
  label,
  disabled,
  options,
}: {
  label: React.ReactNode;
  disabled?: boolean;
  options: SplitOption[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLButtonElement>(null);

  const primary = options[0];
  // Derived, not stored: a toolbar that goes disabled under an open menu
  // closes it without a render pass of its own.
  const isOpen = open && !disabled;

  useEffect(() => {
    if (!isOpen) return;
    // mousedown, not click: closing on the press means a click aimed at the
    // page underneath lands where the user aimed it.
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [isOpen]);

  // Move focus into the menu so the keyboard has somewhere to be, and so
  // Escape/arrows are handled by the menu's own handler below.
  useEffect(() => {
    if (isOpen) menu.current?.querySelector('button')?.focus();
  }, [isOpen]);

  const choose = (opt: SplitOption) => {
    setOpen(false);
    caret.current?.focus();
    opt.onSelect();
  };

  return (
    <div className={`split-button${isOpen ? ' open' : ''}`} ref={root}>
      <button
        className="split-main"
        onClick={() => primary.onSelect()}
        disabled={disabled}
        title={primary.hint ? `${primary.label} — ${primary.hint}` : primary.label}
      >
        {label}
      </button>
      <button
        className="split-caret"
        ref={caret}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`More ${primary.label} options`}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <polygon points="4,7 14,7 9,12" fill="currentColor" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="split-menu"
          role="menu"
          ref={menu}
          // The app's global shortcuts listen on window — Space and the arrows
          // would stamp and seek behind the open menu if these got through.
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              setOpen(false);
              caret.current?.focus();
              return;
            }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const items = Array.from(menu.current?.querySelectorAll('button') ?? []);
            const at = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {options.map((opt) => (
            <button key={opt.label} role="menuitem" onClick={() => choose(opt)}>
              {opt.label}
              {opt.hint && <span className="opt-hint">{opt.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
