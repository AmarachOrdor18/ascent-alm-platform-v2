// An affiliate's own assumptions: download the Group's current assumptions as the workbook, change what differs
// for the affiliate in Excel, upload it - saved as the affiliate's own rules (the Group's are untouched), which
// runs for that affiliate then prefer. Rules that need approval wait for an approver; until then the Group
// values keep applying.
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { repository } from '@/store/repositoryInstance';
import { readWorkbookSheets } from '@/lib/fileImport';
import { buildAssumptionsWorkbook, downloadWorkbook } from '@/lib/assumptionsWorkbook';
import {
  importGroupAssumptions,
  parseGroupAssumptions,
  type ImportedAssumption,
  type ParsedAssumptions,
} from '@/lib/groupAssumptions';
import { invalidateReadinessInputs } from '@/lib/readinessHooks';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Affiliate, RuleMeta } from '@/engine/types';

const btn =
  'rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40';

export function AffiliateAssumptionsExchange({ affiliate }: { affiliate: Pick<Affiliate, 'code' | 'name'> }) {
  const { user, hasPermission } = useAuth();
  const client = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ fileName: string; result: ParsedAssumptions } | null>(null);
  const [done, setDone] = useState<ImportedAssumption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = hasPermission('rules.edit') || hasPermission('affiliate.manage') || hasPermission('group.manage');

  const download = async () => {
    setError(null);
    const group = (await repository.listRules({ affiliateCode: null })).filter((r) => r.isActive);
    // The latest active Group rule of each kind.
    const latest = new Map<string, RuleMeta>();
    for (const r of group) {
      const cur = latest.get(r.kind);
      if (!cur || (r.updatedAt ?? r.createdAt) > (cur.updatedAt ?? cur.createdAt)) latest.set(r.kind, r);
    }
    downloadWorkbook(buildAssumptionsWorkbook([...latest.values()]), `${affiliate.code}_assumptions_from_Group.xlsx`);
  };

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    try {
      if (!/\.xlsx?$/i.test(file.name)) throw new Error('Choose the Excel workbook downloaded here.');
      setParsed({ fileName: file.name, result: parseGroupAssumptions(await readWorkbookSheets(file)) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This file could not be read.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const save = async () => {
    if (!parsed || !user) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await importGroupAssumptions(parsed.result, user, affiliate));
      setParsed(null);
      invalidateReadinessInputs(client);
      void client.invalidateQueries({ queryKey: ['rules'] });
      void client.invalidateQueries({ queryKey: ['approvals'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assumptions could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit) return null;
  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => void download()}>
          Download Group assumptions
        </button>
        <button type="button" className={btn} onClick={() => inputRef.current?.click()}>
          Upload {affiliate.name}&rsquo;s version
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          aria-label="Assumptions workbook"
          className="hidden"
          onChange={(e) => void read(e.target.files?.[0])}
        />
      </div>

      {error && <p className="text-[12px] text-danger">{error}</p>}

      {parsed && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <p className="font-bold text-navy-900">
            {parsed.fileName} - saved as {affiliate.name}&rsquo;s own assumptions:
          </p>
          <ul className="mt-1 space-y-0.5 text-[12px] text-gray-600">
            {parsed.result.items.map((i) => (
              <li key={i.kind}>
                <span className="font-bold text-navy-900">{i.label}</span> - {i.summary}
              </li>
            ))}
          </ul>
          {parsed.result.warnings.length > 0 && (
            <ul className="mt-1 text-[12px] text-warning">
              {parsed.result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || parsed.result.items.length === 0}
              className="rounded-lg bg-navy-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save as ours'}
            </button>
            <button type="button" onClick={() => setParsed(null)} className="text-[12px] font-bold text-gray-500">
              Cancel
            </button>
          </div>
        </div>
      )}

      {done && (
        <table className="w-full text-[12px]">
          <tbody className="divide-y divide-gray-50">
            {done.map((d) => (
              <tr key={d.kind}>
                <td className="py-1.5 pr-3 font-bold text-navy-900">{d.name}</td>
                <td className="py-1.5 pr-3 text-gray-500">v{d.version}</td>
                <td className="py-1.5">
                  <StatusBadge
                    status={d.status === 'Active' ? 'In use' : 'Waiting for approval'}
                    tone={d.status === 'Active' ? 'success' : 'warning'}
                    className="whitespace-nowrap"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
