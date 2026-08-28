import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface InfoButtonProps {
  children: ReactNode;
  label?: string;
  className?: string;
  panelClassName?: string;
  /** Stops the click from bubbling to an ancestor link/row — for an info button nested inside a clickable card. */
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
  const ref = useRef<HTMLSpanElement>(null);

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
          role="tooltip"
          className={cn(
            'absolute left-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-gray-200 bg-white p-3 text-[11px] leading-relaxed text-gray-600 shadow-lg',
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </span>
  );
}
