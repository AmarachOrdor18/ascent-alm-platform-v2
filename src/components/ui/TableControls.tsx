/**
 * Search, pagination and export for a hand-rolled table.
 *
 * `ResultTable` renders every row it's given — fine for a run's fixed
 * metric list, wrong for a register that grows without bound (approvals,
 * audit events, users). This is the client-side search/page/export layer
 * those screens compose around a plain `<table>`, matched to the pattern
 * already proven in the sibling Ecobank platform build.
 */

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { SearchIcon, RefreshIcon, DownloadIcon } from '@/components/icons/Icons';

export type Density = 'compact' | 'default' | 'tall';

export function useTableControls<T extends object>(data: T[], pageSize = 10, searchableFields?: (keyof T)[]) {
  const [search, setSearchRaw] = useState('');
  const [page, setPage] = useState(1);
  const [density, setDensity] = useState<Density>('default');

  const filtered = search.trim()
    ? data.filter((row) => {
        const q = search.toLowerCase();
        const fields = searchableFields ?? (Object.keys(row) as (keyof T)[]);
        return fields.some((f) => String(row[f] ?? '').toLowerCase().includes(q));
      })
    : data;

  const setSearch = (v: string) => {
    setSearchRaw(v);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    search,
    setSearch,
    page: safePage,
    setPage,
    density,
    setDensity,
    filtered,
    paged,
    totalItems: filtered.length,
    pageSize,
  };
}

interface TablePaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function TablePagination({ currentPage, totalItems, pageSize, onPageChange }: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  const getPages = (): Array<number | '...'> => {
    const pages: Array<number | '...'> = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-gray-50/30 px-6 py-4 backdrop-blur-sm">
      <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
        Showing <span className="text-navy-900">{start}</span>
        {'–'}
        <span className="text-navy-900">{end}</span> of <span className="text-navy-900">{totalItems}</span>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="shrink-0 rounded-lg border border-gray-100 bg-white p-2 text-[10px] font-bold uppercase transition-all hover:bg-gray-50 disabled:opacity-30"
        >
          {'< Prev'}
        </button>
        {getPages().map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-gray-300">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={cn(
                'h-8 w-8 rounded-lg text-[11px] font-bold transition-all',
                currentPage === p
                  ? 'bg-navy-900 text-white shadow-lg'
                  : 'border border-gray-100 bg-white text-gray-500 hover:border-navy-900/20',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="shrink-0 rounded-lg border border-gray-100 bg-white p-2 text-[10px] font-bold uppercase transition-all hover:bg-gray-50 disabled:opacity-30"
        >
          {'Next >'}
        </button>
      </div>
    </div>
  );
}

interface TableToolbarProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  onRefresh?: () => void;
  exportData?: () => object[];
  exportFilename?: string;
  density: Density;
  onDensityChange: (d: Density) => void;
  children?: React.ReactNode;
}

function toCsv(rows: object[]): string {
  const [first] = rows;
  if (!first) return '';
  const headers = Object.keys(first);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(','))].join('\n');
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function TableToolbar({
  searchValue,
  onSearchChange,
  onRefresh,
  exportData,
  exportFilename = 'export',
  density,
  onDensityChange,
  children,
}: TableToolbarProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const handleRefresh = () => {
    if (!onRefresh) return;
    setRefreshing(true);
    onRefresh();
    window.setTimeout(() => setRefreshing(false), 800);
  };

  const handleExportCsv = () => {
    if (!exportData) return;
    downloadBlob(toCsv(exportData()), `${exportFilename}.csv`, 'text/csv');
    setExportOpen(false);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter records..."
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-7 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            >
              ×
            </button>
          )}
        </div>
        {children}
      </div>

      <div className="flex items-center gap-1.5">
        <select
          value={density}
          onChange={(e) => onDensityChange(e.target.value as Density)}
          aria-label="Row density"
          className="rounded-lg border border-gray-100 bg-white px-2 py-1.5 text-[10px] font-bold uppercase text-gray-500 focus:border-navy-700 focus:outline-none"
        >
          <option value="compact">Compact</option>
          <option value="default">Default</option>
          <option value="tall">Tall</option>
        </select>

        {onRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh"
            className="rounded-lg border border-gray-100 bg-white p-2 hover:bg-gray-50"
          >
            <RefreshIcon className={cn('h-3.5 w-3.5 text-gray-500', refreshing && 'animate-spin')} />
          </button>
        )}

        {exportData && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              aria-label="Export"
              className="rounded-lg border border-gray-100 bg-white p-2 hover:bg-gray-50"
            >
              <DownloadIcon className="h-3.5 w-3.5 text-gray-500" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                >
                  Export CSV
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
