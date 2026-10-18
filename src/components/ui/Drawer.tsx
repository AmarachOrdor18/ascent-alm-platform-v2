import type { ReactNode } from 'react';
import { InfoButton } from '@/components/ui/InfoButton';

/**
 * A slide-in side panel - veil + panel, closing on either. Used where a flow (onboarding, a
 * quick edit) shouldn't feel like leaving the page behind it, just like the drawers already used
 * for editable snapshots and row detail elsewhere in the app, generalized into one component.
 */
export function Drawer({
  title,
  description,
  about,
  onClose,
  footer,
  wide,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Extra explanation kept out of the drawer's header line - shown behind an ⓘ next to the description. */
  about?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  /** Wider panel for content that needs more room (e.g. a multi-step wizard). */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/40" onClick={onClose} aria-hidden="true" />
      <aside
        data-tour="drawer"
        role="dialog"
        aria-modal="true"
        className={`relative flex h-full w-full flex-col bg-white shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-md'}`}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-navy-900">{title}</h2>
            {description && (
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-gray-500">
                <span>{description}</span>
                {about && (
                  <InfoButton label={`About ${typeof title === 'string' ? title : 'this panel'}`}>{about}</InfoButton>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-tour="drawer-close"
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-navy-900"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-gray-100 px-6 py-4">{footer}</div>}
      </aside>
    </div>
  );
}
