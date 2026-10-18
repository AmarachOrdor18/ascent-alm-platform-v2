// Column mapping for one affiliate's data source: the platform's standard fields in plain words, and which
// column of the affiliate's own file feeds each one. Upload a sample file and its headers are matched
// automatically (by name or a known alternative header); the user confirms or changes each match, and Save
// stores the chosen headers on THIS source, so every later upload from this affiliate matches on its own.
// The standard fields themselves never change here.
import { useMemo, useRef, useState } from 'react';
import { readUploadAsCsvText, UPLOAD_ACCEPT } from '@/lib/fileImport';
import { applyColumnMapping, FIELD_HELP, fieldLabel, fileHeaders, matchHeaders, normHeader } from '@/lib/dataSources';
import { useAuth } from '@/context/AuthContext';
import { useCanMapColumns, useSaveDataSource } from '@/lib/sourceHooks';
import { cn } from '@/lib/cn';
import type { DataSource } from '@/engine/types';
import { btn, Notice } from './sourceUi';

interface Sample {
  fileName: string;
  headers: string[];
  /** What the automatic match found per field, before the user changed anything. */
  auto: Record<string, string | null>;
}

function sampleFrom(headers: string[], fileName: string, source: DataSource): Sample {
  const match = matchHeaders(headers, source.fields);
  return { fileName, headers, auto: Object.fromEntries(match.fields.map((m) => [m.field, m.header])) };
}

export function ColumnMapping({
  source,
  onSaved,
  saveLabel = 'Save mapping',
  showSkip,
  onSkip,
  initialSample,
  inline,
}: {
  source: DataSource;
  /** Called after the mapping is saved, with the source as saved. */
  onSaved?: (saved: DataSource) => void;
  saveLabel?: string;
  /** Onboarding: offer "Skip for now" (use the standard column names). */
  showSkip?: boolean;
  onSkip?: () => void;
  /** Inline at upload: the uploaded file's headers, matched straight away (no sample upload step). */
  initialSample?: { fileName: string; headers: string[] };
  /** Inline at upload: only list the fields that need a decision, and hide the sample-file bar. */
  inline?: boolean;
}) {
  const canEdit = useCanMapColumns(source.affiliateCode);
  const save = useSaveDataSource();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sample, setSample] = useState<Sample | null>(() =>
    initialSample
      ? sampleFrom(
          initialSample.headers.filter((h) => h !== ''),
          initialSample.fileName,
          source,
        )
      : null,
  );
  const [chosen, setChosen] = useState<Record<string, string | null>>(() => sample?.auto ?? {});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const readSample = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSaved(false);
    try {
      const headers = fileHeaders(
        await readUploadAsCsvText(file, { allSheets: source.domain === 'MarketData' }),
      ).filter((h) => h !== '');
      if (headers.length === 0) throw new Error('This file has no header row.');
      const match = matchHeaders(headers, source.fields);
      const auto = Object.fromEntries(match.fields.map((m) => [m.field, m.header]));
      setSample({ fileName: file.name, headers, auto });
      setChosen(auto);
      setSkipped(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This file could not be read.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const used = useMemo(() => new Set(Object.values(chosen).filter((h): h is string => !!h)), [chosen]);
  const required = source.fields.filter((f) => f.required);
  const unmatchedRequired = sample ? required.filter((f) => !chosen[f.name] && !skipped.has(f.name)) : [];
  const ignored = sample ? sample.headers.filter((h) => !used.has(h)) : [];
  const matchedCount = sample ? source.fields.filter((f) => chosen[f.name]).length : 0;

  const pick = (field: string, header: string) => {
    setSaved(false);
    setChosen((prev) => {
      const next = { ...prev };
      // One column feeds one field: taking a column away from another field leaves that field unmatched.
      if (header) for (const k of Object.keys(next)) if (next[k] === header) next[k] = null;
      next[field] = header || null;
      return next;
    });
  };

  const toggleSkip = (field: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });

  const submit = () => {
    if (!sample) return;
    const fields = applyColumnMapping(source.fields, chosen, sample.auto);
    const next: DataSource = {
      ...source,
      fields,
      mappedHeaders: sample.headers.map(normHeader),
      updatedAt: new Date().toISOString(),
      updatedBy: user?.name ?? 'unknown',
    };
    save.mutate(next, {
      onSuccess: () => {
        setSaved(true);
        onSaved?.(next);
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'The mapping could not be saved.'),
    });
  };

  return (
    <div className="space-y-4">
      {canEdit && !inline && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-navy-50 px-4 py-3">
          <p className="text-[13px] text-navy-900">
            {sample ? (
              <>
                Matched <strong>{matchedCount}</strong> of {source.fields.length} fields from{' '}
                <strong>{sample.fileName}</strong>. Check each one below.
              </>
            ) : (
              'Upload a sample of your own file (CSV or Excel) and we will match its columns to these fields for you.'
            )}
          </p>
          <button type="button" className={btn.small} onClick={() => fileRef.current?.click()}>
            {sample ? 'Use a different file' : 'Upload a sample file'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => void readSample(e.target.files?.[0])}
          />
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
        {source.fields
          // Inline: the matched fields are already settled - only the open decisions are listed.
          .filter((f) => !inline || !sample?.auto[f.name] || chosen[f.name] !== sample.auto[f.name])
          .map((f) => {
            const help = FIELD_HELP[f.name];
            const value = chosen[f.name] ?? '';
            const missing = !!sample && f.required && !value;
            return (
              <li
                key={f.name}
                className={cn(
                  'grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1.4fr_1fr] md:items-center',
                  missing && !skipped.has(f.name) && 'bg-danger-bg/40',
                )}
              >
                <div>
                  <p className="text-[13px] font-bold text-navy-900">
                    {fieldLabel(f.name)}{' '}
                    <span
                      className={cn(
                        'ml-1 rounded px-1.5 py-0.5 text-[11px] font-bold',
                        f.required ? 'bg-navy-50 text-navy-700' : 'bg-gray-100 text-gray-500',
                      )}
                    >
                      {f.required ? 'Required' : 'Optional'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-500">{help?.usedFor ?? `Standard column "${f.name}".`}</p>
                  {!sample && f.aliases.length > 0 && (
                    <p className="mt-0.5 text-[12px] text-gray-400">Also recognised as: {f.aliases.join(', ')}</p>
                  )}
                </div>
                {sample ? (
                  <div className="space-y-1">
                    <select
                      aria-label={`File column for ${fieldLabel(f.name)}`}
                      value={value}
                      disabled={!canEdit}
                      onChange={(e) => pick(f.name, e.target.value)}
                      className={cn(
                        'w-full rounded border px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none',
                        missing && !skipped.has(f.name) ? 'border-danger' : 'border-gray-200',
                      )}
                    >
                      <option value="">- not in this file -</option>
                      {sample.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                          {used.has(h) && h !== value ? ' (used for another field)' : ''}
                        </option>
                      ))}
                    </select>
                    {missing && (
                      <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
                        <input type="checkbox" checked={skipped.has(f.name)} onChange={() => toggleSkip(f.name)} />
                        My file does not have this - skip it for now
                      </label>
                    )}
                  </div>
                ) : (
                  <p className="font-mono text-[12px] text-gray-400 md:text-right">{f.name}</p>
                )}
              </li>
            );
          })}
      </ul>

      {sample && ignored.length > 0 && (
        <Notice tone="info">
          These columns in your file are not used and will be ignored:{' '}
          <span className="font-mono">{ignored.join(', ')}</span>
        </Notice>
      )}
      {sample && unmatchedRequired.length > 0 && (
        <Notice tone="warning">
          {unmatchedRequired.length === 1
            ? 'One required field has'
            : `${unmatchedRequired.length} required fields have`}{' '}
          no column yet: {unmatchedRequired.map((f) => fieldLabel(f.name)).join(', ')}. Choose a column, or tick
          &ldquo;skip it for now&rdquo; - files without it will be flagged on upload.
        </Notice>
      )}
      {saved && (
        <Notice tone="success">
          Mapping saved. Future uploads to {source.name} will match these columns automatically.
        </Notice>
      )}

      {canEdit && (sample || showSkip) && (
        <div className="flex flex-wrap justify-end gap-2">
          {showSkip && !saved && (
            <button type="button" className={btn.secondary} onClick={onSkip}>
              Skip for now - my file uses the standard names
            </button>
          )}
          {sample && (
            <button
              type="button"
              className={btn.primary}
              disabled={unmatchedRequired.length > 0 || save.isPending}
              onClick={submit}
            >
              {save.isPending ? 'Saving…' : saveLabel}
            </button>
          )}
        </div>
      )}
      {!canEdit && (
        <p className="text-[12px] text-gray-400">Only an admin of this affiliate can change the column mapping.</p>
      )}
    </div>
  );
}
