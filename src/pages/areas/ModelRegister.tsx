import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { AffiliateSelector } from '@/components/layout/AffiliateSelector';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ModelRunDetail } from '@/components/models/ModelRunDetail';
import { ModelApprovalBadge, ProposePanel } from '@/components/models/ProposePanel';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { resolveSingleAffiliate, useAffiliates } from '@/lib/hooks';
import { accessibleAffiliates } from '@/lib/scope';
import { approvals } from '@/lib/governanceHooks';
import { formatAmount } from '@/lib/format';
import { useModelRuleRows, useModelRuns } from '@/lib/modelHooks';
import { effectiveModelStatus, MODEL_TYPE_LABEL, segmentLabel, type EffectiveModelStatus } from '@/lib/modelRegistry';
import type { StoredModelRun } from '@/store/repository';
import type { ApprovalRequest } from '@/engine/types';

interface Row {
  run: StoredModelRun;
  status: EffectiveModelStatus;
  request: ApprovalRequest | null;
}

const pct = (v: unknown) => (typeof v === 'number' ? `${(v * 100).toFixed(2)}%` : 'n/a');

export function keyParams(run: StoredModelRun): string {
  const p = run.params;
  switch (run.modelType) {
    case 'DepositRunoff':
      return `Core ${pct(p.coreShare)} · λ ${typeof p.lambdaMonthly === 'number' ? p.lambdaMonthly.toFixed(4) : '-'}/month · ${p.decayMethod}`;
    case 'RepricingBeta':
      return `β ${typeof p.beta === 'number' ? p.beta.toFixed(3) : '-'} · lag ${p.lagMonths}m · ${p.behaviouralTag}`;
    case 'Prepayment':
      return `CPR ${pct(p.cpr)} · SMM ${pct(p.smm)}`;
    case 'TermDeposit':
      return `Renewal ${pct(p.renewalRate)} · early withdrawal ${pct(p.earlyWithdrawalRate)}`;
  }
}

function fitSummary(run: StoredModelRun): string {
  const s = run.fitStats;
  const parts: string[] = [];
  if (typeof s.rSquared === 'number') parts.push(`R² ${s.rSquared.toFixed(3)}`);
  if (typeof s.mape === 'number') parts.push(`MAPE ${s.mape.toFixed(1)}%`);
  if (typeof s.pValue === 'number') parts.push(`p ${s.pValue < 0.001 ? '< 0.001' : s.pValue.toFixed(3)}`);
  if (run.modelType === 'DepositRunoff' && typeof s.rmse === 'number')
    parts.push(`RMSE ${formatAmount(s.rmse, run.segment.currency)}`);
  if (typeof s.n === 'number') parts.push(`n ${s.n}`);
  if (typeof s.accountMonths === 'number') parts.push(`${s.accountMonths} account-months`);
  if (typeof s.maturingCount === 'number') parts.push(`${s.maturingCount} maturing`);
  return parts.join(' · ') || '-';
}

/** Every saved calibration - the model inventory a validator or checker reviews. */
export function ModelRegister() {
  const { user, hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const { data: allAffiliates = [] } = useAffiliates();
  const affiliates = accessibleAffiliates(allAffiliates, user, hasPermission);
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const affiliate =
    affiliates.find((a) => a.code === pickedCode) ??
    (affiliateCode === 'GROUP' ? undefined : resolveSingleAffiliate(affiliates, affiliateCode));
  const { data: runs = [], isLoading } = useModelRuns(affiliate?.code);
  const { data: requests = [] } = approvals.useList();
  const ruleRows = useModelRuleRows();
  const [statusFilter, setStatusFilter] = useState<'All' | EffectiveModelStatus>('All');

  const rows: Row[] = useMemo(
    () => runs.map((run) => ({ run, ...effectiveModelStatus(run, requests, ruleRows) })),
    [runs, requests, ruleRows],
  );
  const shown = statusFilter === 'All' ? rows : rows.filter((r) => r.status === statusFilter);
  const count = (s: EffectiveModelStatus) => rows.filter((r) => r.status === s).length;

  const columns: ResultColumn<Row>[] = [
    {
      key: 'model',
      header: 'Model',
      render: (r) => <span className="font-bold">{MODEL_TYPE_LABEL[r.run.modelType]}</span>,
      sortValue: (r) => r.run.modelType,
    },
    {
      key: 'segment',
      header: 'Segment',
      render: (r) => segmentLabel(r.run.segment.key),
      sortValue: (r) => r.run.segment.segmentId,
    },
    {
      key: 'version',
      header: 'Version',
      align: 'right',
      render: (r) => `v${r.run.version}`,
      sortValue: (r) => r.run.version,
    },
    { key: 'window', header: 'Data window', render: (r) => `${r.run.window.from} – ${r.run.window.to}` },
    {
      key: 'params',
      header: 'Key parameters',
      render: (r) => <span className="font-mono text-[12px]">{keyParams(r.run)}</span>,
    },
    { key: 'fit', header: 'Fit', render: (r) => <span className="text-[12px]">{fitSummary(r.run)}</span> },
    {
      key: 'bt',
      header: 'Back-test',
      render: (r) =>
        r.run.backtest ? (
          <StatusBadge
            status={r.run.backtest.passed ? 'Pass' : 'Fail'}
            tone={r.run.backtest.passed ? 'success' : 'danger'}
          />
        ) : (
          <span className="text-[12px] text-gray-400">n/a</span>
        ),
      sortValue: (r) => (r.run.backtest ? (r.run.backtest.passed ? 1 : 0) : -1),
    },
    {
      key: 'status',
      header: 'Approval',
      render: (r) => <ModelApprovalBadge status={r.status} request={r.request} version={r.run.proposedRuleVersion} />,
      sortValue: (r) => r.status,
    },
    {
      key: 'rule',
      header: 'Linked rule',
      render: (r) =>
        r.run.proposedRuleId ? (
          <span className="font-mono text-[12px]">
            {r.run.proposedRuleId} v{r.run.proposedRuleVersion}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (r) => (
        <span className="text-[12px]">
          {r.run.createdBy}, {new Date(r.run.createdAt).toLocaleDateString()}
        </span>
      ),
      sortValue: (r) => r.run.createdAt,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Model register"
        description="Every saved behavioural-model calibration."
        about="Shows what was fitted, to which data, how well, and whether it has been proposed and approved as an assumption. Status is read from the linked rule version's approval, so it cannot drift from what runs actually use."
        asOfDate={null}
        scope={affiliate?.name ?? 'No affiliate selected'}
        metrics={[
          { label: 'Saved runs', value: String(rows.length) },
          { label: 'Draft', value: String(count('Draft')) },
          {
            label: 'Awaiting approval',
            value: String(count('Proposed')),
            tone: count('Proposed') > 0 ? 'warning' : 'neutral',
          },
          { label: 'Approved', value: String(count('Approved')), tone: count('Approved') > 0 ? 'success' : 'neutral' },
        ]}
      />

      <AffiliateSelector affiliates={affiliates} value={affiliate?.code} onChange={setPickedCode}>
        <span className="h-4 w-px bg-gray-200" aria-hidden="true" />
        <label htmlFor="reg-status" className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          Status
        </label>
        <select
          id="reg-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'All' | EffectiveModelStatus)}
          className="rounded border border-gray-200 px-2 py-1.5 text-[13px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none"
        >
          {(['All', 'Draft', 'Proposed', 'Approved', 'Rejected', 'Superseded', 'Retired'] as const).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </AffiliateSelector>

      {!affiliate ? (
        <EmptyState title="No affiliate selected">Pick an affiliate to see its model register.</EmptyState>
      ) : !isLoading && rows.length === 0 ? (
        <EmptyState title="No models saved yet" cta={{ label: 'Open the calibration workbench', href: '/assumptions' }}>
          Fit a model to {affiliate.name}&rsquo;s uploaded history in Assumptions → Behavioural models and save it to
          the register. If no history is uploaded yet, start in Data → History for models.
        </EmptyState>
      ) : (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <ResultTable
            rows={shown}
            columns={columns}
            rowKey={(r) => r.run.id}
            emptyMessage="No runs with this status."
            renderDetail={(r) => (
              <div className="space-y-4 py-2">
                <ProposePanel run={r.run} />
                <div className="rounded-2xl border border-gray-100 bg-white p-4 text-[12px] text-gray-600">
                  <p>
                    <span className="font-bold text-navy-900">Run id:</span>{' '}
                    <span className="font-mono">{r.run.id}</span>
                  </p>
                  <p className="mt-1">
                    <span className="font-bold text-navy-900">Options:</span>{' '}
                    {Object.entries(r.run.calibrationOptions)
                      .filter(([, v]) => v !== null)
                      .map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join('+') || '(none)' : String(v)}`)
                      .join(' · ')}
                  </p>
                  <p className="mt-1">
                    <span className="font-bold text-navy-900">History uploads used:</span>{' '}
                    {r.run.historyUploadIds.length > 0 ? r.run.historyUploadIds.join(', ') : '-'}
                  </p>
                </div>
                <ModelRunDetail run={r.run} chart={r.run.chart} chartUnit={r.run.chartUnit} />
              </div>
            )}
          />
        </section>
      )}
    </>
  );
}
