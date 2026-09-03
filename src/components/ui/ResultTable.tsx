import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatDelta, formatPct } from '@/lib/format';
import { Amount } from './Amount';
import { ChevronRightIcon } from '@/components/icons/Icons';
import type { CurrencyCode } from '@/engine/types';

export type ColumnAlign = 'left' | 'right';

export interface ResultColumn<T> {
  key: string;
  header: string;
  align?: ColumnAlign;
  /** Rendered value. Return a node for full control. */
  render: (row: T) => React.ReactNode;
  /** Numeric value used for the prior-period variance column, when comparison is on. */
  compareValue?: (row: T) => number | null;
  /** How the variance reads: percentage points, percent, or a plain number. */
  compareUnit?: 'pp' | 'pct' | 'plain';
  className?: string;
  /** Enables click-to-sort on this column's header. Falls back to `compareValue` when not set,
   * so a column already wired for variance display sorts for free. */
  sortValue?: (row: T) => string | number | null;
}

interface ResultTableProps<T> {
  rows: T[];
  columns: ResultColumn<T>[];
  rowKey: (row: T) => string;
  /** Prior-period rows, keyed the same way; enables variance columns. */
  priorRows?: T[];
  priorLabel?: string;
  /** Drill-through: what a row expands into. Absence of this disables expansion. */
  renderDetail?: (row: T) => React.ReactNode;
  emptyMessage?: string;
  caption?: string;
  className?: string;
  /** Soft background tint for a row that needs attention - purely visual, never changes row order
   * or content. Sorting (if enabled) and this are independent of the pagination/filtering a caller
   * applies before `rows` reaches this component - neither touches that. */
  rowTone?: (row: T) => 'danger' | 'warning' | 'success' | null;
}

const ROW_TONE_CLASS: Record<'danger' | 'warning' | 'success', string> = {
  danger: 'bg-danger/5',
  warning: 'bg-warning/5',
  success: 'bg-success/5',
};

export function ResultTable<T>({
  rows,
  columns,
  rowKey,
  priorRows,
  priorLabel = 'vs prior',
  renderDetail,
  emptyMessage = 'No data for this selection.',
  caption,
  className,
  rowTone,
}: ResultTableProps<T>) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const priorByKey = new Map((priorRows ?? []).map((r) => [rowKey(r), r]));
  const comparing = priorRows !== undefined;

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sortKeyFor = (col: ResultColumn<T>) => col.sortValue ?? col.compareValue ?? null;

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const keyFn = col ? sortKeyFor(col) : null;
    if (!keyFn) return rows;
    return [...rows].sort((a, b) => {
      const va = keyFn(a);
      const vb = keyFn(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb)) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sortKeyFor is a plain closure over columns, already a dep
  }, [rows, sort, columns]);

  if (rows.length === 0) {
    return <p className="rounded-lg bg-gray-50 p-6 text-center text-[12px] text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[12px]">
        {caption && <caption className="mb-2 text-left text-[11px] text-gray-500">{caption}</caption>}
        <thead>
          <tr className="border-b border-gray-200">
            {renderDetail && <th scope="col" className="w-8 py-2 px-3" />}
            {columns.map((col) => {
              const keyFn = sortKeyFor(col);
              const isSortable = !!keyFn;
              const isActive = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={isActive ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                  onClick={
                    isSortable
                      ? () =>
                          setSort((s) =>
                            s?.key === col.key ? { key: col.key, dir: s.dir === 1 ? -1 : 1 } : { key: col.key, dir: 1 },
                          )
                      : undefined
                  }
                  className={cn(
                    'py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400',
                    col.align === 'right' ? 'text-right' : 'text-left',
                    isSortable && 'cursor-pointer select-none hover:text-navy-700',
                  )}
                >
                  {col.header}
                  {isActive && (
                    <span aria-hidden="true" className="ml-0.5">
                      {sort!.dir === 1 ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              );
            })}
            {comparing &&
              columns
                .filter((c) => c.compareValue)
                .map((col) => (
                  <th
                    key={`${col.key}-delta`}
                    scope="col"
                    className="py-2 px-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    {col.header} {priorLabel}
                  </th>
                ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const key = rowKey(row);
            const prior = priorByKey.get(key);
            const isOpen = expanded.has(key);
            const tone = rowTone?.(row) ?? null;
            return (
              <React.Fragment key={key}>
                <tr
                  className={cn(
                    'border-b border-gray-100',
                    renderDetail && 'hover:bg-gray-50',
                    tone && ROW_TONE_CLASS[tone],
                  )}
                >
                  {renderDetail && (
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? `Collapse detail for ${key}` : `Expand detail for ${key}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-transform hover:border-navy-700 hover:text-navy-700"
                      >
                        <ChevronRightIcon
                          className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')}
                          aria-hidden="true"
                        />
                      </button>
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('py-2 px-3', col.align === 'right' ? 'text-right' : 'text-left', col.className)}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                  {comparing &&
                    columns
                      .filter((c) => c.compareValue)
                      .map((col) => {
                        const now = col.compareValue?.(row) ?? null;
                        const then = prior ? (col.compareValue?.(prior) ?? null) : null;
                        const delta = now !== null && then !== null ? now - then : null;
                        return (
                          <td key={`${col.key}-delta`} className="py-2 px-3 text-right">
                            <VarianceCell delta={delta} unit={col.compareUnit ?? 'plain'} />
                          </td>
                        );
                      })}
                </tr>
                {renderDetail && isOpen && (
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td colSpan={columns.length + 1 + (comparing ? columns.filter((c) => c.compareValue).length : 0)}>
                      <div className="p-4">{renderDetail(row)}</div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VarianceCell({ delta, unit }: { delta: number | null; unit: 'pp' | 'pct' | 'plain' }) {
  if (delta === null) return <span className="text-gray-400">-</span>;
  const improving = delta > 0;
  const flat = Math.abs(delta) < 0.05;
  const text = unit === 'pp' ? `${formatDelta(delta)}pp` : unit === 'pct' ? formatPct(delta) : formatDelta(delta);
  return (
    <span className={cn('font-mono tabular-nums', flat ? 'text-gray-400' : improving ? 'text-success' : 'text-danger')}>
      {text}
    </span>
  );
}

/** Convenience column builder for money, so callers never hand-format an amount. */
export function moneyColumn<T>(
  key: string,
  header: string,
  value: (row: T) => number | null,
  currency: (row: T) => CurrencyCode,
): ResultColumn<T> {
  return {
    key,
    header,
    align: 'right',
    render: (row) => <Amount value={value(row)} currency={currency(row)} />,
    compareValue: value,
    compareUnit: 'plain',
  };
}
