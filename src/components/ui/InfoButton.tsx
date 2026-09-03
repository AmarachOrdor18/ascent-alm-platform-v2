import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface InfoButtonProps {
  children: ReactNode;
  label?: string;
  className?: string;
  panelClassName?: string;
  /** Stops the click from bubbling to an ancestor link/row - for an info button nested inside a clickable card. */
  stopClickPropagation?: boolean;
}

export function InfoButton({
  children,
  label = 'More information',
  className,
  panelClassName,
  stopClickPropagation = false,
}: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const ref = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Flips the panel to hang off the right edge of the button instead of the left
  // when it would otherwise run past the viewport - a fixed left-0 offset overflows
  // whenever the button sits in the right half of the screen (e.g. a card's top-right corner).
  useLayoutEffect(() => {
    if (!open) {
      setAlign('left');
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (rect.right > window.innerWidth) setAlign('right');
  }, [open]);

  return (
    <span ref={ref} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={(e) => {
          if (stopClickPropagation) {
            e.preventDefault();
            e.stopPropagation();
          }
          setOpen((v) => !v);
        }}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors',
          open ? 'border-navy-700 text-navy-700' : 'border-gray-300 text-gray-400 hover:border-navy-700 hover:text-navy-700',
        )}
      >
        i
      </button>
      {open && (
        <div
          ref={panelRef}
          role="tooltip"
          className={cn(
            'absolute top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-gray-600 shadow-lg',
            align === 'left' ? 'left-0' : 'right-0',
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </span>
  );
}
