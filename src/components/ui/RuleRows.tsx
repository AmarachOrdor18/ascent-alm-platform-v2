import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface RowColumn<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'right';
  render: (row: T, update: (patch: Partial<T>) => void, readOnly: boolean) => ReactNode;
}

interface RuleRowsProps<T> {
  rows: T[];
  columns: RowColumn<T>[];
  rowKey: (row: T, index: number) => string;
  onChange: (rows: T[]) => void;
  createRow?: () => T;
  readOnly: boolean;
  addLabel?: string;
  emptyMessage?: string;
  /** Shown beneath the table — typically an allocation total. */
  footer?: ReactNode;
}

export function RuleRows<T>({
  rows,
  columns,
  rowKey,
  onChange,
  createRow,
  readOnly,
  addLabel = 'Add row',
  emptyMessage = 'No rows yet.',
  footer,
}: RuleRowsProps<T>) {
  const updateRow = (index: number, patch: Partial<T>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400',
                    c.align === 'right' ? 'text-right' : 'text-left',
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
              {!readOnly && <th scope="col" className="w-16 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="py-6 text-center text-[12px] text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((row, index) => (
              <tr key={rowKey(row, index)} className="border-b border-gray-100">
                {columns.map((c) => (
                  <td key={c.key} className={cn('py-1.5 pr-2', c.align === 'right' && 'text-right')}>
                    {c.render(row, (patch) => updateRow(index, patch), readOnly)}
                  </td>
                ))}
                {!readOnly && (
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      className="text-[11px] font-bold text-danger hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between">
        {!readOnly && createRow && (
          <button
            type="button"
            onClick={() => onChange([...rows, createRow()])}
            className="text-[11px] font-bold text-navy-700 hover:text-navy-900"
          >
            {addLabel}
          </button>
        )}
        {footer && <div className="ml-auto text-[11px]">{footer}</div>}
      </div>
    </div>
  );
}

/** Select bound to a row field, sized for the row table. */
export function RowSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
  id,
}: {
  value: T;
  options: readonly T[] | ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled: boolean;
  label: string;
  id: string;
}) {
  const normalised = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
      >
        {normalised.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}

/** Text or number input bound to a row field. */
export function RowInput({
  value,
  onChange,
  disabled,
  label,
  id,
  type = 'text',
  placeholder,
  step,
}: {
  value: string | number;
  onChange: (value: string) => void;
  disabled: boolean;
  label: string;
  id: string;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  step?: string;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50',
          type === 'number' && 'text-right font-mono',
        )}
      />
    </>
  );
}
