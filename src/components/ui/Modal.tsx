import { useEffect, type ReactNode } from 'react';

/**
 * A centred modal dialog - veil + card, closing on the veil, the ✕ or Escape. Used for short,
 * focus-style flows (a file upload, a single form) where a full-height side drawer is heavier
 * than the task deserves. Same contract as Drawer, so opening components port over unchanged.
 */
export function Modal({
  title,
  description,
  onClose,
  footer,
  wide,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  /** Wider card for content with a table (e.g. a checked users file); 'xl' for a working window (Upload data). */
  wide?: boolean | 'xl';
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-900/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        data-tour="drawer"
        className={`relative flex max-h-full w-full flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl ${wide === 'xl' ? 'max-w-4xl' : wide ? 'max-w-2xl' : 'max-w-lg'}`}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-navy-900">{title}</h2>
            {description && <p className="mt-0.5 text-[12px] text-gray-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-tour="drawer-close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-navy-900"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-gray-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
