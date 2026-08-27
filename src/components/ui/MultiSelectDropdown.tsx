import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface MultiSelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelectDropdown({ options, selected, onChange, placeholder = 'Select…', className }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

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

  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  );

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const selectedLabels = options.filter((o) => selected.includes(o.value));

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-[12px] text-navy-900 hover:border-navy-700 focus:border-navy-700 focus:outline-none"
      >
        <span className={cn('truncate', selected.length === 0 && 'text-gray-400')}>
          {selected.length === 0
            ? placeholder
            : selected.length <= 2
              ? selectedLabels.map((o) => o.label).join(', ')
              : `${selected.length} selected`}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('shrink-0 text-gray-400 transition-transform', open && 'rotate-180')}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-full min-w-[240px] rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-gray-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            <span>{selected.length} of {options.length} selected</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => onChange(options.map((o) => o.value))} className="text-navy-700 hover:underline">
                All
              </button>
              <button type="button" onClick={() => onChange([])} className="text-navy-700 hover:underline">
                None
              </button>
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {filtered.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() => toggle(o.value)}
                    className="accent-gold-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-navy-900">{o.label}</span>
                    {o.hint && <span className="block truncate text-[10px] text-gray-400">{o.hint}</span>}
                  </span>
                </label>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-2 py-3 text-center text-[11px] text-gray-400">No matches.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
