import React, { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatDelta, formatPct } from '@/lib/format';
import { Amount } from './Amount';
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
}

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
}: ResultTableProps<T>) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  if (rows.length === 0) {
    return <p className="rounded-lg bg-gray-50 p-6 text-center text-[12px] text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[12px]">
        {caption && <caption className="mb-2 text-left text-[11px] text-gray-500">{caption}</caption>}
        <thead>
          <tr className="border-b border-gray-200">
            {renderDetail && <th scope="col" className="w-8 py-2" />}
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400',
                  col.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {col.header}
              </th>
            ))}
            {comparing &&
              columns
                .filter((c) => c.compareValue)
                .map((col) => (
                  <th
                    key={`${col.key}-delta`}
                    scope="col"
                    className="py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    {col.header} {priorLabel}
                  </th>
                ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const prior = priorByKey.get(key);
            const isOpen = expanded.has(key);
            return (
              <React.Fragment key={key}>
                <tr className={cn('border-b border-gray-100', renderDetail && 'hover:bg-gray-50')}>
                  {renderDetail && (
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? `Collapse detail for ${key}` : `Expand detail for ${key}`}
                        className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-navy-700"
                      >
                        <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
                      </button>
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('py-2', col.align === 'right' ? 'text-right' : 'text-left', col.className)}
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
                          <td key={`${col.key}-delta`} className="py-2 text-right">
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
  if (delta === null) return <span className="text-gray-400">—</span>;
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
