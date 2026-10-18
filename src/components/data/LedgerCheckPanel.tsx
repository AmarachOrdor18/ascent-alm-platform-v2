// The general-ledger source's check: the admitted trial balance for a date against the same date's
// admitted positions (engine/reconciliation.ts does the maths), suggested plugs to approve, and sign-off
// - recorded on the position loads, exactly as the old GL Reconciliation screen did.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/ui/Amount';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useBatches, useSaveBatch } from '@/lib/hooks';
import { admittedLedger, admittedPositions, DEFAULT_TOLERANCE } from '@/lib/sourceIngest';
import { currentPositionBatches } from '@/engine/vintage';
import { reconcile, type ReconciliationLevel, type ReconciliationLine } from '@/engine/reconciliation';
import { identityFxTable } from '@/engine/fx';
import { formatPct } from '@/lib/format';
import { sendNotification } from '@/lib/notify';
import { btn, inputCls, Notice, StatTiles } from './sourceUi';
import type { Affiliate } from '@/engine/types';

export function LedgerCheckPanel({ affiliate }: { affiliate: Affiliate }) {
  const { user, hasPermission } = useAuth();
  const canSignOff = hasPermission('data.upload') || hasPermission('data.configure');
  const { data: allBatches = [] } = useBatches();
  const saveBatch = useSaveBatch();
  const batches = useMemo(
    () => allBatches.filter((b) => b.affiliateCode === affiliate.code),
    [allBatches, affiliate.code],
  );
  const dates = useMemo(
    () =>
      [
        ...new Set(
          batches.filter((b) => b.domain === 'GeneralLedger' && b.status === 'Committed').map((b) => b.asOfDate),
        ),
      ]
        .sort()
        .reverse(),
    [batches],
  );
  const [picked, setPicked] = useState<string | null>(null);
  // Defaults to the working date from the header when the ledger was loaded for it.
  const { asOfDate: workingDate } = useScope();
  const asOfDate = picked ?? (workingDate && dates.includes(workingDate) ? workingDate : dates[0]) ?? null;
  const [level, setLevel] = useState<ReconciliationLevel>('GlAccount');
  const [tolAmount, setTolAmount] = useState(DEFAULT_TOLERANCE.amount);
  const [tolPercent, setTolPercent] = useState(DEFAULT_TOLERANCE.percent);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const currency = affiliate.functionalCurrency;

  const version = batches.map((b) => `${b.id}:${b.status}`).join('|');
  const { data, isLoading } = useQuery({
    queryKey: ['ledgerCheck', affiliate.code, asOfDate, version],
    enabled: !!asOfDate,
    queryFn: async () => {
      const ledger = await admittedLedger(affiliate.code, asOfDate!, batches);
      const positions = await admittedPositions(affiliate.code, asOfDate!, batches);
      return { ledger, positions };
    },
  });

  const result = useMemo(() => {
    if (!data?.ledger || !asOfDate) return null;
    return reconcile(data.positions, data.ledger.lines, {
      reportingCurrency: currency,
      fx: identityFxTable(currency, asOfDate),
      level,
      toleranceAmount: tolAmount,
      tolerancePercent: tolPercent,
    });
  }, [data, asOfDate, currency, level, tolAmount, tolPercent]);

  if (dates.length === 0) {
    return (
      <Notice tone="info">
        No general ledger has been admitted yet. Upload a trial balance to this source and admit it; it is then compared
        with the same date&rsquo;s positions here.
      </Notice>
    );
  }

  const positionBatches = asOfDate ? currentPositionBatches(batches, affiliate.code, asOfDate) : [];
  const signedOff = positionBatches.length > 0 && positionBatches.every((b) => !!b.reconciledAt);
  const allPlugsApproved = !!result && result.suggestedPlugs.every((p) => approved.has(p.key));
  const canComplete = !!result && result.canSignOff && allPlugsApproved && canSignOff && positionBatches.length > 0;

  const signOff = async () => {
    if (!canComplete || !user) return;
    const at = new Date().toISOString();
    await Promise.all(
      positionBatches.map((b) => saveBatch.mutateAsync({ ...b, reconciledBy: user.name, reconciledAt: at })),
    );
    await sendNotification(
      {
        affiliateCode: affiliate.code,
        kind: 'gl.reconciled',
        title: `Positions reconciled to the ledger - ${affiliate.name} (${asOfDate})`,
        body: `${user.name} signed off the ledger check. Runs for this date are no longer flagged as unreconciled.`,
        link: '/execution',
      },
      user,
    );
  };

  const columns: ResultColumn<ReconciliationLine>[] = [
    {
      key: 'gl',
      header: 'GL account',
      render: (l) => <span className="font-mono text-[12px] text-navy-900">{l.glAccountCode}</span>,
    },
    ...(level === 'GlAccountByOrgUnit'
      ? [
          {
            key: 'ou',
            header: 'Unit',
            render: (l: ReconciliationLine) => (
              <span className="font-mono text-[12px] text-gray-500">{l.orgUnitCode ?? '-'}</span>
            ),
          },
        ]
      : []),
    {
      key: 'pos',
      header: 'Positions',
      align: 'right',
      render: (l) => <Amount value={l.instrumentBalance} currency={currency} />,
    },
    {
      key: 'ledger',
      header: 'Ledger',
      align: 'right',
      render: (l) => <Amount value={l.ledgerBalance} currency={currency} />,
    },
    {
      key: 'var',
      header: 'Difference',
      align: 'right',
      sortValue: (l) => Math.abs(l.variance),
      render: (l) =>
        Math.abs(l.variance) < 0.005 ? (
          <span className="text-gray-300">-</span>
        ) : (
          <Amount value={l.variance} currency={currency} colorBySign />
        ),
    },
    {
      key: 'pct',
      header: '% of ledger',
      align: 'right',
      render: (l) => <span className="font-mono text-gray-500">{formatPct(l.variancePercent, 3)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (l) =>
        Math.abs(l.variance) < 0.005 ? (
          <StatusBadge status="Agrees" tone="success" />
        ) : l.withinTolerance ? (
          <StatusBadge status="Plug needed" tone="warning" />
        ) : (
          <StatusBadge status="Outside tolerance" tone="danger" />
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          As of
          <select
            className={`${inputCls} mt-1`}
            value={asOfDate ?? ''}
            onChange={(e) => {
              setPicked(e.target.value);
              setApproved(new Set());
            }}
          >
            {dates.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          Compare by
          <select
            className={`${inputCls} mt-1`}
            value={level}
            onChange={(e) => setLevel(e.target.value as ReconciliationLevel)}
          >
            <option value="GlAccount">GL account</option>
            <option value="GlAccountByOrgUnit">GL account within unit</option>
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          Tolerance (amount)
          <input
            type="number"
            className={`${inputCls} mt-1 text-right font-mono`}
            value={tolAmount}
            onChange={(e) => setTolAmount(Number(e.target.value))}
          />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          Tolerance (%)
          <input
            type="number"
            step="0.1"
            className={`${inputCls} mt-1 text-right font-mono`}
            value={tolPercent}
            onChange={(e) => setTolPercent(Number(e.target.value))}
          />
        </label>
      </div>

      {isLoading && <p className="text-[12px] text-gray-400">Comparing…</p>}
      {data && !data.ledger && (
        <Notice tone="warning">The ledger file admitted for {asOfDate} could not be found. Upload it again.</Notice>
      )}
      {data?.ledger && data.positions.length === 0 && (
        <Notice tone="info">
          No positions are admitted for {asOfDate} yet. The comparison runs as soon as they are.
        </Notice>
      )}

      {result && data && data.positions.length > 0 && (
        <>
          <StatTiles
            items={[
              { label: 'Accounts', value: result.lines.length },
              {
                label: 'Outside tolerance',
                value: result.linesOutOfTolerance,
                tone: result.linesOutOfTolerance > 0 ? 'danger' : 'success',
              },
              {
                label: 'Plugs to approve',
                value: result.suggestedPlugs.length,
                tone: result.suggestedPlugs.length > 0 ? 'warning' : 'neutral',
              },
              {
                label: 'Sign-off',
                value: signedOff ? 'Done' : result.canSignOff ? 'Available' : 'Blocked',
                tone: signedOff ? 'success' : result.canSignOff ? 'warning' : 'danger',
              },
            ]}
          />
          <ResultTable rows={result.lines} columns={columns} rowKey={(l) => l.key} />

          {result.suggestedPlugs.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Suggested plug entries</h4>
              <p className="text-[12px] text-gray-500">
                Proposals, not postings - each needs approving before the date can be signed off.
              </p>
              {result.suggestedPlugs.map((p) => (
                <div
                  key={p.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 p-2"
                >
                  <div>
                    <p className="font-mono text-[13px] font-bold text-navy-900">{p.glAccountCode}</p>
                    <p className="text-[12px] text-gray-500">{p.reason}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Amount value={p.amount} currency={currency} colorBySign />
                    <button
                      type="button"
                      disabled={!canSignOff || signedOff}
                      className={
                        approved.has(p.key)
                          ? 'rounded-md bg-success px-2.5 py-1 text-[12px] font-bold text-white'
                          : btn.small
                      }
                      onClick={() =>
                        setApproved((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.key)) next.delete(p.key);
                          else next.add(p.key);
                          return next;
                        })
                      }
                    >
                      {approved.has(p.key) ? 'Approved' : 'Approve plug'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!result.canSignOff && (
            <Notice tone="danger">
              Sign-off is blocked: {result.linesOutOfTolerance} account{result.linesOutOfTolerance === 1 ? '' : 's'}{' '}
              differ by more than the tolerance. These go back to the team that owns the data rather than being plugged.
            </Notice>
          )}
          <div className="flex items-center justify-end gap-3">
            {signedOff && (
              <span className="text-[12px] text-success">
                Signed off - positions agree with the ledger for {asOfDate}.
              </span>
            )}
            <button
              type="button"
              className={btn.primary}
              disabled={!canComplete || signedOff || saveBatch.isPending}
              onClick={() => void signOff()}
              title={
                !canSignOff
                  ? 'Your role cannot sign off'
                  : !result.canSignOff
                    ? 'Resolve the accounts outside tolerance first'
                    : !allPlugsApproved
                      ? 'Approve every suggested plug first'
                      : undefined
              }
            >
              {signedOff ? 'Signed off' : 'Sign off this date'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
