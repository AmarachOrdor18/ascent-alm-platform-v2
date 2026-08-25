/**
 * Affiliates — screen 3.
 *
 * The directory, with a data-freshness column. Freshness is the column that
 * stops a platform quietly reporting confident numbers off three-month-old
 * data: a stale FX rate does not announce itself, it simply consolidates the
 * Group at last quarter's rate.
 */

import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAffiliates, useBatches } from '@/lib/hooks';
import { checkAllDomains, type FreshnessCheck } from '@/engine/vintage';
import { formatDate } from '@/lib/format';
import type { Affiliate } from '@/engine/types';

const TODAY = '2026-08-25';

const FRESHNESS_TONE = {
  Fresh: 'success',
  Due: 'warning',
  Stale: 'danger',
  'Never loaded': 'neutral',
} as const;

export function Affiliates() {
  const { data: affiliates = [], isLoading } = useAffiliates();
  const { data: batches = [] } = useBatches();

  const rows = affiliates.filter((a) => a.code !== 'GROUP');

  const freshnessFor = (a: Affiliate): FreshnessCheck[] => checkAllDomains(a, batches, TODAY);

  /** The worst status across a affiliate's domains — what the directory shows. */
  const worstFreshness = (a: Affiliate): FreshnessCheck['status'] => {
    const checks = freshnessFor(a);
    if (checks.length === 0) return 'Never loaded';
    if (checks.some((c) => c.status === 'Stale')) return 'Stale';
    if (checks.some((c) => c.status === 'Never loaded')) return 'Never loaded';
    if (checks.some((c) => c.status === 'Due')) return 'Due';
    return 'Fresh';
  };

  const live = rows.filter((a) => a.status === 'Live');
  const onboarding = rows.filter((a) => a.status === 'Onboarding');

  const columns: ResultColumn<Affiliate>[] = [
    {
      key: 'name',
      header: 'Affiliate',
      render: (a) => (
        <Link href={`/affiliates/${a.code}`} className="font-medium text-navy-900 hover:text-navy-700 hover:underline">
          {a.name}
        </Link>
      ),
    },
    { key: 'country', header: 'Country', render: (a) => <span className="text-gray-600">{a.country}</span> },
    { key: 'regulator', header: 'Regulator', render: (a) => <span className="text-gray-600">{a.regulator}</span> },
    {
      key: 'currency',
      header: 'Functional',
      render: (a) => <span className="font-mono text-[11px]">{a.functionalCurrency}</span>,
    },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
    {
      key: 'freshness',
      header: 'Data freshness',
      render: (a) => {
        const worst = worstFreshness(a);
        return <StatusBadge status={worst} tone={FRESHNESS_TONE[worst]} />;
      },
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Affiliates"
        description="The Group footprint, with how current each affiliate's data is. Only Live affiliates consolidate into Group figures."
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Affiliates', value: String(rows.length) },
          { label: 'Live', value: String(live.length), tone: 'success' },
          {
            label: 'Onboarding',
            value: String(onboarding.length),
            tone: onboarding.length > 0 ? 'warning' : 'neutral',
          },
          {
            label: 'Stale data',
            value: String(rows.filter((a) => worstFreshness(a) === 'Stale').length),
            tone: 'danger',
          },
        ]}
        actions={
          <Link
            href="/affiliates/onboard"
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
          >
            Onboard affiliate
          </Link>
        }
      />

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <ResultTable
          rows={rows}
          columns={columns}
          rowKey={(a) => a.code}
          emptyMessage={isLoading ? 'Loading…' : 'No affiliates yet.'}
          renderDetail={(a) => (
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Feeds by domain</h3>
              {a.feeds.length === 0 ? (
                <p className="text-[12px] text-gray-500">
                  No feeds configured — this affiliate has not started onboarding.
                </p>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-400">
                      <th className="py-1 font-bold uppercase tracking-wider">Domain</th>
                      <th className="py-1 font-bold uppercase tracking-wider">Fed by</th>
                      <th className="py-1 font-bold uppercase tracking-wider">SLA</th>
                      <th className="py-1 font-bold uppercase tracking-wider">Last loaded</th>
                      <th className="py-1 font-bold uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {freshnessFor(a).map((f) => {
                      const feed = a.feeds.find((x) => x.domain === f.domain)!;
                      return (
                        <tr key={f.domain} className="border-b border-gray-100">
                          <td className="py-1.5 font-medium text-navy-900">{f.domain}</td>
                          <td className="py-1.5 text-gray-600">
                            {feed.mode === 'File' ? 'File upload (substitution)' : feed.mode}
                            {feed.owner && <span className="text-gray-400"> · {feed.owner}</span>}
                          </td>
                          <td className="py-1.5 font-mono text-gray-500">{f.slaDays}d</td>
                          <td className="py-1.5 font-mono text-gray-500">
                            {f.lastLoadedAt ? formatDate(f.lastLoadedAt.slice(0, 10)) : '—'}
                          </td>
                          <td className="py-1.5">
                            <StatusBadge status={f.status} tone={FRESHNESS_TONE[f.status]} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        />
      </div>
    </>
  );
}
