// Load the Group assumptions setup file (Group_assumptions_setup_values.xlsx): one workbook, a sheet per
// assumption, creating the Group-default rules in one go. Shows what the file holds before saving, then what
// was created - approval-gated rules wait for a second person; FTP rules are in use straight away.
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { readWorkbookSheets } from '@/lib/fileImport';
import {
  importGroupAssumptions,
  parseGroupAssumptions,
  type ImportedAssumption,
  type ParsedAssumptions,
} from '@/lib/groupAssumptions';
import { invalidateReadinessInputs } from '@/lib/readinessHooks';
import { cn } from '@/lib/cn';

export function GroupAssumptionsUpload({ className }: { className?: string }) {
  const { user, hasPermission } = useAuth();
  const client = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedAssumptions | null>(null);
  const [done, setDone] = useState<ImportedAssumption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canLoad = hasPermission('group.manage');

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    try {
      if (!/\.xlsx?$/i.test(file.name))
        throw new Error('Choose the Excel workbook (Group_assumptions_setup_values.xlsx).');
      const result = parseGroupAssumptions(await readWorkbookSheets(file));
      setFileName(file.name);
      setParsed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This file could not be read.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const save = async () => {
    if (!parsed || !user) return;
    setSaving(true);
    setError(null);
    try {
      const out = await importGroupAssumptions(parsed, user);
      setDone(out);
      setParsed(null);
      invalidateReadinessInputs(client);
      void client.invalidateQueries({ queryKey: ['auditEvents'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assumptions could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (!canLoad) return null;
  const pending = done?.filter((d) => d.status === 'Pending approval').length ?? 0;

  return (
    <section className={cn('rounded-2xl border border-gray-100 bg-white p-5 shadow-sm', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-navy-900">Load the Group assumptions file</h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-gray-500">
            One workbook with a sheet per assumption (transfer pricing, add-ons, cost allocation, credit loss, capital,
            product characteristics) sets the Group defaults every affiliate inherits. Rules that need approval wait for
            a second person; transfer pricing rules are used straight away.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-navy-900 hover:border-navy-700"
        >
          {parsed ? 'Choose another file' : 'Upload assumptions file'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => void read(e.target.files?.[0])}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[12px] text-danger">
          {error}
        </p>
      )}

      {parsed && (
        <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p className="text-[13px] font-bold text-navy-900">
            {fileName}: {parsed.items.length} assumption{parsed.items.length === 1 ? '' : 's'} found
          </p>
          <ul className="mt-2 space-y-1 text-[12px] text-navy-900">
            {parsed.items.map((i) => (
              <li key={i.kind}>
                <span className="font-bold">{i.label}</span> - {i.name}.{' '}
                <span className="text-gray-500">{i.summary}</span>
              </li>
            ))}
          </ul>
          {parsed.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12px] text-warning">
              {parsed.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || parsed.items.length === 0}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {saving
                ? 'Saving…'
                : `Create ${parsed.items.length} Group default${parsed.items.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => setParsed(null)}
              className="rounded-lg px-3 py-2 text-[13px] font-bold text-gray-500 hover:text-navy-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {done && (
        <div role="status" className="mt-4 rounded-lg bg-success-bg p-4 text-[12px] text-navy-900">
          <p className="font-bold text-success">
            Standard Group assumptions loaded ({done.length - pending} active, {pending} waiting for approval).
          </p>
          <ul className="mt-2 space-y-1">
            {done.map((d) => (
              <li key={d.kind}>
                <span className="font-bold">{d.label}</span>: {d.name} v{d.version} -{' '}
                {d.status === 'Active' ? 'in use now' : 'waiting for approval'}.
              </li>
            ))}
          </ul>
          {pending > 0 && (
            <p className="mt-2">
              A different user with approval rights approves them in{' '}
              <Link href="/controls" className="font-bold underline">
                Approvals
              </Link>
              . Until then runs use the previous approved version, or leave those outputs blank.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
