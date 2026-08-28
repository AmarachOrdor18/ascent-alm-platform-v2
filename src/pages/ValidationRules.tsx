import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { AffiliateSelector } from '@/components/layout/AffiliateSelector';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { InfoButton } from '@/components/ui/InfoButton';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { resolveSingleAffiliate, useAffiliates, usePositions } from '@/lib/hooks';
import { DEFAULT_VALIDATION_RULES, validatePositions, type ValidationRule } from '@/engine/validation';
import type { Severity } from '@/engine/types';

const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];

const SEVERITY_TONE = { Low: 'neutral', Medium: 'warning', High: 'danger', Critical: 'danger' } as const;

const CHECK_EXPLANATION: Record<string, string> = {
  Completeness: 'Required fields are present on every row.',
  ReferentialIntegrity: 'Referenced entities exist — an unknown affiliate cannot be loaded against.',
  Range: 'Amounts sit inside a plausible range, catching unit and decimal errors.',
  CrossField: 'Fields agree with each other, such as a maturity date after the as-of date.',
  Duplicate: 'Position identifiers are unique within the batch.',
  BalanceSheetIntegrity: 'Assets equal liabilities plus capital, within tolerance.',
  FactorCoverage: 'Basel factors are present where the classification requires them.',
};

export function ValidationRules() {
  const { hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const canEdit = hasPermission('data.configure');

  const [rules, setRules] = useState<ValidationRule[]>(DEFAULT_VALIDATION_RULES);
  const [asOfDate, setAsOfDate] = useState('2026-07-31');
  const [lastRun, setLastRun] = useState<{ at: string; by: string } | null>(null);

  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const affiliate = affiliates.find((a) => a.code === pickedCode) ?? resolveSingleAffiliate(affiliates, affiliateCode);
  const { data: positions = [] } = usePositions(affiliate?.code, asOfDate);

  const result = useMemo(
    () =>
      positions.length > 0
        ? validatePositions(positions, { asOfDate, knownAffiliateCodes: affiliates.map((a) => a.code) }, rules)
        : null,
    [positions, asOfDate, affiliates, rules],
  );

  const update = (id: string, patch: Partial<ValidationRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const columns: ResultColumn<ValidationRule>[] = [
    { key: 'id', header: 'Rule', render: (r) => <span className="font-mono text-[11px]">{r.id}</span> },
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-navy-900">{r.name}</span> },
    { key: 'type', header: 'Check type', render: (r) => <span className="text-gray-600">{r.checkType}</span> },
    {
      key: 'severity',
      header: 'Severity',
      render: (r) =>
        canEdit ? (
          <>
            <label htmlFor={`sev-${r.id}`} className="sr-only">
              {r.name} severity
            </label>
            <select
              id={`sev-${r.id}`}
              value={r.severity}
              onChange={(e) => update(r.id, { severity: e.target.value as Severity })}
              className="rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        ) : (
          <StatusBadge status={r.severity} tone={SEVERITY_TONE[r.severity]} />
        ),
    },
    {
      key: 'blocks',
      header: 'Blocks commit',
      render: (r) => (
        <label className="flex items-center gap-2 text-[11px] text-gray-600">
          <input
            type="checkbox"
            checked={r.blocksCommit}
            disabled={!canEdit}
            onChange={(e) => update(r.id, { blocksCommit: e.target.checked })}
            className="accent-gold-500"
          />
          {r.blocksCommit ? 'Blocking' : 'Advisory'}
        </label>
      ),
    },
    {
      key: 'active',
      header: 'Active',
      render: (r) => (
        <label className="flex items-center gap-2 text-[11px] text-gray-600">
          <input
            type="checkbox"
            checked={r.isActive}
            disabled={!canEdit}
            onChange={(e) => update(r.id, { isActive: e.target.checked })}
            className="accent-gold-500"
          />
          {r.isActive ? 'Active' : 'Disabled'}
        </label>
      ),
    },
    {
      key: 'findings',
      header: 'Findings',
      align: 'right',
      render: (r) => {
        const n = result?.exceptions.filter((e) => e.ruleId === r.id).length ?? 0;
        return n > 0 ? (
          <span className="font-mono font-bold text-danger">{n}</span>
        ) : result ? (
          <span className="font-mono text-success">0</span>
        ) : (
          <span className="text-gray-300">—</span>
        );
      },
    },
  ];

  const blocking = rules.filter((r) => r.isActive && r.blocksCommit).length;

  return (
    <>
      <ModuleHeader
        title="Validation Rules"
        description="Data-quality checks run as a gate before any calculation. Rules are configuration, so a bank adds its own without a release."
        asOfDate={asOfDate}
        scope={affiliate?.name ?? 'No affiliate selected'}
        metrics={[
          { label: 'Rules', value: String(rules.length), about: 'Data-quality checks configured for this scope, covering completeness, referential integrity, ranges and more.' },
          { label: 'Active', value: String(rules.filter((r) => r.isActive).length), about: 'Rules currently enforced — a disabled rule is kept on file but not evaluated.' },
          { label: 'Blocking', value: String(blocking), tone: 'warning', about: 'Active rules that prevent a batch being committed if it fails them, rather than just flagging the finding.' },
          {
            label: 'Last run',
            value: result ? (result.blocked ? 'Blocked' : 'Passed') : 'Not run',
            tone: result ? (result.blocked ? 'danger' : 'success') : 'neutral',
            about: 'The outcome of the most recent check against this affiliate’s staged positions.',
          },
        ]}
        actions={
          <>
            <label htmlFor="vr-asof" className="sr-only">
              As-of date
            </label>
            <input
              id="vr-asof"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded border border-gray-200 px-2 py-2 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
            <button
              type="button"
              onClick={() => setLastRun({ at: new Date().toISOString(), by: 'current-user' })}
              disabled={positions.length === 0}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              Run checks
            </button>
          </>
        }
      />

      <AffiliateSelector affiliates={affiliates} value={affiliate?.code} onChange={setPickedCode} />

      {result && (
        <div
          role="status"
          className={
            result.blocked
              ? 'mb-6 rounded-lg bg-danger-bg px-4 py-3 text-[12px] leading-relaxed text-danger'
              : 'mb-6 rounded-lg bg-success-bg px-4 py-3 text-[12px] leading-relaxed text-success'
          }
        >
          <span className="font-bold">
            {result.blocked ? 'Commit would be blocked.' : 'All blocking checks passed.'}
          </span>{' '}
          {result.rowsChecked} row{result.rowsChecked === 1 ? '' : 's'} checked, {result.exceptions.length} exception
          {result.exceptions.length === 1 ? '' : 's'} across {result.rowsWithExceptions} row
          {result.rowsWithExceptions === 1 ? '' : 's'}.
          {lastRun && (
            <span className="ml-1 opacity-80">
              Last run by {lastRun.by} at {new Date(lastRun.at).toLocaleTimeString()}.
            </span>
          )}
        </div>
      )}

      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Rules</h2>
        <ResultTable
          rows={rules}
          columns={columns}
          rowKey={(r) => r.id}
          renderDetail={(r) => (
            <div className="space-y-2 text-[11px] leading-relaxed text-gray-600">
              <p>{CHECK_EXPLANATION[r.checkType] ?? 'Custom check.'}</p>
              <p>
                <span className="font-bold">{r.blocksCommit ? 'Blocking: ' : 'Advisory: '}</span>
                {r.blocksCommit
                  ? 'a batch failing this rule cannot be committed, so the data never reaches a calculation or a report.'
                  : 'findings are recorded and surfaced, but do not prevent the batch being committed.'}
              </p>
              {result && result.exceptions.filter((e) => e.ruleId === r.id).length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                  {result.exceptions
                    .filter((e) => e.ruleId === r.id)
                    .slice(0, 8)
                    .map((e, i) => (
                      <li key={`${e.positionId}-${i}`} className="text-gray-700">
                        <span className="font-mono">{e.positionId ?? 'batch'}</span> — {e.description}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        />
      </section>

      <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
        Why blocking rules exist
        <InfoButton label="Why blocking rules exist">
          Oracle runs Cash Flow Edits before any engine processing for the same reason: a calculation on data that
          does not balance produces a confident, wrong answer, and a confident wrong answer is worse than a refusal.
          Marking a rule blocking is what turns a data-quality report into a control.
        </InfoButton>
      </p>
    </>
  );
}
