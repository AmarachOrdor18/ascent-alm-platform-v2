import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/cn';
import type { NavItem } from './navigation';

export function CommandPalette({ items, collapsed }: { items: NavItem[]; collapsed?: boolean }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return items;
    // Every word must appear somewhere in the name, in any order - "affiliate management" and
    // "management affiliate" both find "Group & Affiliate Management" just as readily.
    return items.filter((i) => {
      const name = i.name.toLowerCase();
      return tokens.every((t) => name.includes(t));
    });
  }, [items, query]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Focus after the panel actually mounts, not the trigger click's own tick.
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) go(target.path);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search navigation"
        title={collapsed ? 'Search (⌘K)' : undefined}
        className={cn(
          'mx-2 mb-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg border border-white/10 bg-white/5 py-2 text-left text-[12px] text-white/50 hover:border-white/20 hover:bg-white/10',
          collapsed ? 'justify-center px-2' : 'px-3',
        )}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        {!collapsed && (
          <>
            <span className="flex-1">Search…</span>
            <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40">
              {navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K'}
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
          <button
            type="button"
            aria-label="Close search"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-navy-900/50"
          />
          <div
            role="dialog"
            aria-label="Search navigation"
            className="relative w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search pages, actions…"
                className="flex-1 text-[14px] text-navy-900 placeholder:text-gray-400 focus:outline-none"
              />
              <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-400">ESC</span>
            </div>

            <div className="max-h-80 overflow-y-auto py-1">
              <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Navigate</p>
              {results.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => go(item.path)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2 text-left text-[13px]',
                      i === activeIndex ? 'bg-gray-100 text-navy-900' : 'text-gray-700',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-gray-500" />
                    <span className="flex-1">{item.name}</span>
                    {i === activeIndex && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
              {results.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-gray-400">No matches.</p>}
            </div>

            <div className="flex items-center gap-3 border-t border-gray-100 px-4 py-2 text-[10px] text-gray-400">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-200 px-1 py-0.5 font-mono">↵</kbd> select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-200 px-1 py-0.5 font-mono">↑</kbd>
                <kbd className="rounded border border-gray-200 px-1 py-0.5 font-mono">↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-200 px-1 py-0.5 font-mono">ESC</kbd> close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
