// Header bell: unread count, and a popover of the latest notifications (market data loaded, rule approved or
// rejected, run sign-off decided, affiliate Live, ledger committed ...). Opening one marks it read and goes
// to the screen it is about.
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/cn';
import { useMarkNotificationsRead, useMyNotifications } from '@/lib/notificationHooks';
import type { AppNotification } from '@/engine/types';

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function NotificationBell() {
  const [, navigate] = useLocation();
  const { data: list = [] } = useMyNotifications();
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = list.filter((n) => !n.read);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openOne = (n: AppNotification) => {
    if (!n.read) markRead.mutate([n.id]);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        data-tour="notifications"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread.length > 0 ? `Notifications, ${unread.length} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-navy-900 hover:border-navy-700"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <p className="text-[12px] font-bold uppercase tracking-wider text-gray-400">Notifications</p>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate(unread.map((n) => n.id))}
                className="text-[12px] font-bold text-navy-700 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-gray-500">
              Nothing yet. Market data loads, approvals and sign-offs will appear here.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-50 overflow-y-auto">
              {list.slice(0, 30).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openOne(n)}
                    className={cn('block w-full px-4 py-3 text-left hover:bg-gray-50', !n.read && 'bg-navy-50/50')}
                  >
                    <p className="flex items-start justify-between gap-2">
                      <span className={cn('text-[13px] text-navy-900', !n.read && 'font-bold')}>{n.title}</span>
                      <span className="shrink-0 text-[11px] text-gray-400">{ago(n.createdAt)}</span>
                    </p>
                    {n.body && <p className="mt-0.5 text-[12px] leading-relaxed text-gray-500">{n.body}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
