import { Link, useRoute } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useBatches, usePositions, useSaveAffiliate } from '@/lib/hooks';
import { approvals } from '@/lib/governanceHooks';
import { checkAllDomains } from '@/engine/vintage';
import { formatDate } from '@/lib/format';
import type { AffiliateStatus } from '@/engine/types';

const TODAY = '2026-08-25';

const FRESHNESS_TONE = { Fresh: 'success', Due: 'warning', Stale: 'danger', 'Never loaded': 'neutral' } as const;

// Testing → Live is deliberately absent — it only happens through Approvals (see Approvals.tsx's decide()).
const NEXT_STATUS: Record<AffiliateStatus, AffiliateStatus[]> = {
  Onboarding: ['Testing'],
  Testing: [],
  Live: ['Suspended'],
  Suspended: ['Live'],
};

export function AffiliateDetail() {
  const [, params] = useRoute('/affiliates/:code');
  const { hasPermission } = useAuth();
  const { setAffiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const save = useSaveAffiliate();
  const canManage = hasPermission('group.manage');

  const affiliate = affiliates.find((a) => a.code === params?.code);
  const { data: positions = [] } = usePositions(affiliate?.code);
  const { data: approvalRequests = [] } = approvals.useList(affiliate?.code);
  const pendingActivation = approvalRequests.find(
    (r) => r.status === 'Pending' && r.module === 'Affiliates' && r.action === 'Activate',
  );

  if (!affiliate) {
    return (
      <>
        <ModuleHeader title="Affiliate" description="Not found." asOfDate={null} />
        <p className="rounded-lg bg-gray-50 p-6 text-center text-[12px] text-gray-500">
          No affiliate with code {params?.code}.
        </p>
      </>
    );
  }

  const freshness = checkAllDomains(affiliate, batches, TODAY);
  const asOfDate = positions[0]?.asOfDate ?? null;
  const totals = (category: string) =>
    positions.filter((p) => p.category === category).reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <ModuleHeader
        title={affiliate.name}
        description={`${affiliate.country} · regulated by ${affiliate.regulator} · reporting into ${affiliate.reportingCurrency}`}
        asOfDate={asOfDate}
        scope={affiliate.code}
        currency={affiliate.functionalCurrency}
        metrics={[
          { label: 'Status', value: affiliate.status },
          { label: 'Positions loaded', value: String(positions.length) },
          { label: 'Load batches', value: String(batches.filter((b) => b.affiliateCode === affiliate.code).length) },
          {
            label: 'Stale domains',
            value: String(freshness.filter((f) => f.status === 'Stale' || f.status === 'Never loaded').length),
            tone: freshness.some((f) => f.status === 'Stale') ? 'danger' : 'success',
          },
        ]}
        actions={
          affiliate.status === 'Testing' ? (
            <Link
              href="/admin"
              className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
            >
              {pendingActivation ? 'Pending approval — view in Approvals' : 'Raise activation in Approvals →'}
            </Link>
          ) : canManage ? (
            <>
              {NEXT_STATUS[affiliate.status].map((next) => (
                <button
                  key={next}
                  type="button"
                  onClick={() => save.mutate({ ...affiliate, status: next })}
                  disabled={save.isPending}
                  className={
                    next === 'Suspended'
                      ? 'rounded-lg bg-danger px-4 py-2 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-40'
                      : next === 'Live'
                        ? 'rounded-lg bg-success px-4 py-2 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-40'
                        : 'rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40'
                  }
                >
                  Move to {next}
                </button>
              ))}
            </>
          ) : null
        }
      />

      {affiliate.status !== 'Live' && (
        <div role="status" className="mb-6 rounded-lg bg-warning-bg px-4 py-3 text-[12px] leading-relaxed text-warning">
          <span className="font-bold">Not consolidating.</span> Only Live affiliates contribute to Group figures. A
          half-configured affiliate joining the Group balance sheet silently is exactly what this gate prevents.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Profile</h2>
          <dl className="space-y-3 text-[12px]">
            <Row label="Code" value={affiliate.code} mono />
            <Row label="Legal entity" value={affiliate.legalEntityCode} mono />
            <Row label="Region" value={affiliate.region} />
            <Row label="Regulator" value={affiliate.regulator} />
            <Row label="Fiscal year end" value={affiliate.fiscalYearEnd} mono />
            <Row label="Holiday calendar" value={affiliate.holidayCalendarId ?? 'Not set'} mono />
            <Row label="Created" value={formatDate(affiliate.createdAt.slice(0, 10))} />
          </dl>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Currencies</h2>
          <dl className="space-y-3 text-[12px]">
            <Row label="Functional" value={affiliate.functionalCurrency} mono />
            <Row label="Reporting" value={affiliate.reportingCurrency} mono />
            <Row label="Other active" value={affiliate.activeCurrencies.join(' · ') || 'None'} mono />
          </dl>
          <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-500">
            The functional currency cannot be changed once set. Balances consolidate through the reporting currency on
            the way to the Group functional currency.
          </p>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Balance sheet</h2>
          {positions.length === 0 ? (
            <p className="text-[12px] text-gray-500">No positions loaded yet.</p>
          ) : (
            <dl className="space-y-3 text-[12px]">
              <div className="flex justify-between">
                <dt className="text-gray-500">Assets</dt>
                <dd>
                  <Amount value={totals('Asset')} currency={affiliate.functionalCurrency} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Liabilities</dt>
                <dd>
                  <Amount value={totals('Liability')} currency={affiliate.functionalCurrency} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Capital</dt>
                <dd>
                  <Amount value={totals('Capital')} currency={affiliate.functionalCurrency} />
                </dd>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <dt className="font-bold text-navy-900">A − (L + C)</dt>
                <dd>
                  <Amount
                    value={totals('Asset') - totals('Liability') - totals('Capital')}
                    currency={affiliate.functionalCurrency}
                    colorBySign
                  />
                </dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Feeds & refresh SLAs</h2>
          <Link
            href="/connectors"
            onClick={() => setAffiliateCode(affiliate.code)}
            className="text-[11px] font-bold text-navy-700 hover:underline"
          >
            Configure data sources →
          </Link>
        </div>
        <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
          A stale feed reports confident numbers off old data without announcing itself, which is why it's surfaced
          here and on any run that depends on it.
        </p>
        {affiliate.feeds.length === 0 ? (
          <p className="text-[12px] text-gray-500">No feeds configured — onboarding has not started.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <th className="py-2 font-bold">Domain</th>
                <th className="py-2 font-bold">Fed by</th>
                <th className="py-2 font-bold">Owner</th>
                <th className="py-2 text-right font-bold">SLA</th>
                <th className="py-2 text-right font-bold">Age</th>
                <th className="py-2 font-bold">Freshness</th>
              </tr>
            </thead>
            <tbody>
              {freshness.map((f) => {
                const feed = affiliate.feeds.find((x) => x.domain === f.domain)!;
                return (
                  <tr key={f.domain} className="border-b border-gray-100">
                    <td className="py-2 font-medium text-navy-900">{f.domain}</td>
                    <td className="py-2 text-gray-600">
                      {feed.mode === 'File' ? (
                        <span className="text-warning">File substitution</span>
                      ) : feed.mode === 'Connector' ? (
                        <span className="font-mono text-[11px]">{feed.connectorId ?? 'Connector'}</span>
                      ) : (
                        <span className="text-danger">Not configured</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500">{feed.owner ?? '—'}</td>
                    <td className="py-2 text-right font-mono text-gray-500">{f.slaDays}d</td>
                    <td className="py-2 text-right font-mono text-gray-500">
                      {f.ageDays === null ? '—' : `${f.ageDays}d`}
                    </td>
                    <td className="py-2">
                      <StatusBadge status={f.status} tone={FRESHNESS_TONE[f.status]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className={mono ? 'font-mono text-navy-900' : 'text-navy-900'}>{value}</dd>
    </div>
  );
}
