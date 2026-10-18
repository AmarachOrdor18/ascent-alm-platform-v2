// A source's fields: the platform's column names, which are required, which identify a row, and the
// other file headers accepted for each ("also accept these file headers"). Editing is for whoever may
// configure sources; everyone else sees the read-only list.
import { useRef, useState } from 'react';
import { readUploadAsCsvText, UPLOAD_ACCEPT } from '@/lib/fileImport';
import { fileHeaders, matchHeaders, suggestAliases } from '@/lib/dataSources';
import { btn, inputCls, Notice } from './sourceUi';
import type { SourceField, SourceFieldType } from '@/engine/types';

const TYPES: SourceFieldType[] = ['Text', 'Number', 'Date', 'YesNo'];

export function FieldsList({ fields, businessDateField }: { fields: SourceField[]; businessDateField?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-[12px]">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-2 py-1.5 font-bold">Field</th>
            <th className="px-2 py-1.5 font-bold">Type</th>
            <th className="px-2 py-1.5 font-bold">Required</th>
            <th className="px-2 py-1.5 font-bold">Also accept these file headers</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {fields.map((f) => (
            <tr key={f.name}>
              <td className="px-2 py-1 font-mono text-navy-900">
                {f.name}
                {f.key && <span className="ml-1 rounded bg-navy-50 px-1 text-[10px] font-bold text-navy-700">KEY</span>}
                {businessDateField === f.name && (
                  <span className="ml-1 rounded bg-navy-50 px-1 text-[10px] font-bold text-navy-700">AS-OF DATE</span>
                )}
              </td>
              <td className="px-2 py-1 text-gray-600">{f.type}</td>
              <td className="px-2 py-1">
                {f.required ? (
                  <span className="font-bold text-navy-900">Yes</span>
                ) : (
                  <span className="text-gray-400">No</span>
                )}
              </td>
              <td className="px-2 py-1 text-gray-600">
                {f.aliases.length > 0 ? f.aliases.join(', ') : <span className="text-gray-300">-</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FieldsEditor({
  initial,
  initialBusinessDateField,
  onSave,
  onCancel,
  saving,
}: {
  initial: SourceField[];
  initialBusinessDateField?: string;
  onSave: (fields: SourceField[], businessDateField: string | undefined) => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [fields, setFields] = useState<SourceField[]>(initial);
  const [aliasText, setAliasText] = useState<string[]>(initial.map((f) => f.aliases.join(', ')));
  const [dateField, setDateField] = useState(initialBusinessDateField ?? '');
  const [sample, setSample] = useState<{ name: string; unmatched: string[] } | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (i: number, p: Partial<SourceField>) =>
    setFields((prev) => prev.map((f, n) => (n === i ? { ...f, ...p } : f)));
  const withAliases = (): SourceField[] =>
    fields.map((f, i) => ({
      ...f,
      name: f.name.trim(),
      aliases: (aliasText[i] ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    }));

  const names = fields.map((f) => f.name.trim());
  const error = names.some((n) => !n)
    ? 'Every field needs a name.'
    : new Set(names.map((n) => n.toLowerCase())).size !== names.length
      ? 'Two fields have the same name.'
      : null;

  const takeSample = async (file: File | undefined) => {
    if (!file) return;
    setSampleError(null);
    try {
      const headers = fileHeaders(await readUploadAsCsvText(file));
      const suggested = suggestAliases(headers, withAliases());
      setFields(suggested);
      setAliasText(suggested.map((f) => f.aliases.join(', ')));
      setSample({ name: file.name, unmatched: matchHeaders(headers, suggested).ignored });
    } catch (err) {
      setSampleError(err instanceof Error ? err.message : 'This file could not be read.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const attach = (header: string, fieldIndex: number) => {
    setAliasText((prev) => prev.map((t, i) => (i === fieldIndex ? [t, header].filter(Boolean).join(', ') : t)));
    setSample((s) => (s ? { ...s, unmatched: s.unmatched.filter((h) => h !== header) } : s));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 px-3 py-2">
        <p className="text-[12px] text-navy-900">
          Have a file from this source? Use it to fill in which of its headers mean which field.
        </p>
        <button type="button" className={btn.small} onClick={() => fileRef.current?.click()}>
          Start from a sample file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="hidden"
          onChange={(e) => void takeSample(e.target.files?.[0])}
        />
      </div>
      {sampleError && <Notice tone="danger">{sampleError}</Notice>}
      {sample && (
        <Notice tone="info">
          Read the headers of {sample.name}.{' '}
          {sample.unmatched.length === 0
            ? 'Every header now maps to a field.'
            : 'These headers still match no field - attach any that mean the same thing:'}
          {sample.unmatched.length > 0 && (
            <ul className="mt-1 space-y-1">
              {sample.unmatched.map((h) => (
                <li key={h} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{h}</span>
                  <select
                    className="rounded border border-gray-200 px-1 py-0.5 text-[12px]"
                    defaultValue=""
                    onChange={(e) => e.target.value !== '' && attach(h, Number(e.target.value))}
                  >
                    <option value="">means… (leave ignored)</option>
                    {fields.map((f, i) => (
                      <option key={f.name} value={i}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </Notice>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-2 py-1.5 font-bold">Field</th>
              <th className="px-2 py-1.5 font-bold">Type</th>
              <th className="px-2 py-1.5 font-bold">Required</th>
              <th className="px-2 py-1.5 font-bold">Key</th>
              <th className="px-2 py-1.5 font-bold">Also accept these file headers (comma-separated)</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {fields.map((f, i) => (
              <tr key={i}>
                <td className="px-2 py-1">
                  <input
                    aria-label="Field name"
                    className={`${inputCls} font-mono`}
                    value={f.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    aria-label="Type"
                    className={inputCls}
                    value={f.type}
                    onChange={(e) => patch(i, { type: e.target.value as SourceFieldType })}
                  >
                    {TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1 text-center">
                  <input
                    aria-label="Required"
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => patch(i, { required: e.target.checked })}
                  />
                </td>
                <td className="px-2 py-1 text-center">
                  <input
                    aria-label="Key"
                    type="checkbox"
                    checked={!!f.key}
                    onChange={(e) => patch(i, { key: e.target.checked })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    aria-label="Also accepted headers"
                    className={inputCls}
                    value={aliasText[i] ?? ''}
                    onChange={(e) => setAliasText((prev) => prev.map((t, n) => (n === i ? e.target.value : t)))}
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    type="button"
                    className="text-[12px] font-bold text-danger hover:underline"
                    onClick={() => {
                      setFields((prev) => prev.filter((_, n) => n !== i));
                      setAliasText((prev) => prev.filter((_, n) => n !== i));
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className={btn.small}
          onClick={() => {
            setFields((prev) => [...prev, { name: '', type: 'Text', required: false, aliases: [] }]);
            setAliasText((prev) => [...prev, '']);
          }}
        >
          Add a field
        </button>
        <label className="flex items-center gap-2 text-[12px] text-gray-600">
          As-of date is read from
          <select
            className="rounded border border-gray-200 px-1 py-0.5 text-[12px]"
            value={dateField}
            onChange={(e) => setDateField(e.target.value)}
          >
            <option value="">(not in the file - chosen on upload)</option>
            {fields
              .filter((f) => f.type === 'Date' && f.name.trim())
              .map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btn.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={btn.primary}
          disabled={!!error || saving}
          onClick={() => onSave(withAliases(), dateField || undefined)}
        >
          {saving ? 'Saving…' : 'Save fields'}
        </button>
      </div>
    </div>
  );
}
