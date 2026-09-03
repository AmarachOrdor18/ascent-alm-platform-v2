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
  /** Shown beneath the table - typically an allocation total. */
  footer?: ReactNode;
  /** Gates the per-row Remove control - defaults to always removable. Use to protect a fixed row, e.g. an open-ended terminal bucket. */
  canRemove?: (row: T, index: number, rows: T[]) => boolean;
  /** Overrides the default append-to-end Add behaviour - use when a new row must be inserted somewhere other than the end. */
  onAdd?: () => void;
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
  canRemove = () => true,
  onAdd,
}: RuleRowsProps<T>) {
  const updateRow = (index: number, patch: Partial<T>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <div>
      <div className="overflow-x-auto">
        {/* min-w-full, not w-full: a row with many narrow columns (Product Characteristics has 9) needs to be
            free to grow past the card's width and scroll horizontally, rather than every input being forced
            to shrink to fit - which is what made typed values invisible inside their own field. */}
        <table className="min-w-full text-[12px]">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'py-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400',
                    c.align === 'right' ? 'text-right' : 'text-left',
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
              {!readOnly && <th scope="col" className="w-16 py-1.5 px-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="py-6 px-3 text-center text-[12px] text-gray-400">
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
                  <td className="py-1.5 px-3 text-right">
                    {canRemove(row, index, rows) && (
                      <button
                        type="button"
                        onClick={() => onChange(rows.filter((_, i) => i !== index))}
                        className="text-[11px] font-bold text-danger hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between">
        {!readOnly && (onAdd || createRow) && (
          <button
            type="button"
            onClick={() => (onAdd ? onAdd() : onChange([...rows, createRow!()]))}
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
  // A value with no matching option (a stale code from a copied rule, a deleted dimension member) would
  // otherwise make the browser silently render the first real option instead - the field would then look
  // like it says one thing while actually still holding another, and saving would keep the stale value
  // without the row ever having visibly changed. Surfacing it as its own selected option makes that honest.
  const hasMatch = normalised.some((o) => o.value === value);
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
        className={cn(
          'w-full min-w-[7rem] rounded border px-2 py-1 text-[11px] focus:outline-none focus:ring-1 disabled:bg-gray-50',
          hasMatch || !value
            ? 'border-gray-200 focus:border-navy-700 focus:ring-navy-700'
            : 'border-danger text-danger focus:border-danger focus:ring-danger',
        )}
      >
        {!hasMatch && value && <option value={value}>⚠ {value} - not in the current list</option>}
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
          'w-full min-w-[4.5rem] rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50',
          type === 'number' && 'text-right font-mono',
        )}
      />
    </>
  );
}
