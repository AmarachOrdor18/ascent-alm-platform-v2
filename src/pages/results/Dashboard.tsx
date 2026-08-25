/**
 * Dashboard — screen 35.
 *
 * The one screen that is *meant* to be a dashboard. Everything here comes
 * off a single run, so the headline numbers and the detail screens can never
 * disagree — which they could in v1, where each screen recomputed from a
 * different unscoped query.
 *
 * Metrics can be pinned; the pinned set is a per-viewer convenience and is
 * kept in local storage rather than the database, because it says nothing
 * about the bank.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf } from '@/lib/resultHooks';
import { formatPct } from '@/lib/format';
import type { ConcentrationResult, LcrResult, LoanToDepositResult, NsfrResult } from '@/engine/liquidity';
import type { EveResult, NiiResult } from '@/engine/irrbb';
import type { ProfitabilityResult } from '@/engine/profitability';

const PIN_KEY = 'ascent.dashboard.pinned';

interface Tile {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  href: string;
}

export function Dashboard() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;

  const [pinned, setPinned] = useState<string[]>([]);

  // Local storage can throw outright in a private window or with site data
  // blocked, so both directions are guarded and the screen renders fine
  // with nothing stored.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      if (raw) setPinned(JSON.parse(raw) as string[]);
    } catch {
      /* no pinned set — not worth surfacing */
    }
  }, []);

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      try {
        localStorage.setItem(PIN_KEY, JSON.stringify(next));
      } catch {
        /* pinning is a convenience; failing to persist is not an error */
      }
      return next;
    });
  };

  const currency = run?.reportingCurrency ?? 'USD';

  const lcr = payloadOf<LcrResult>(results, 'Lcr');
  const nsfr = payloadOf<NsfrResult>(results, 'Nsfr');
  const ldr = payloadOf<LoanToDepositResult>(results, 'LoanToDeposit');
  const nii = payloadOf<NiiResult>(results, 'NiiSensitivity');
  const eve = payloadOf<EveResult>(results, 'EveSensitivity');
  const conc = payloadOf<ConcentrationResult>(results, 'Concentration');
  const prof = payloadOf<ProfitabilityResult>(results, 'ProfitabilityRatios');
  const survival = payloadOf<{ survivalHorizonDays: number; survivesFullHorizon: boolean }>(
    results,
    'SurvivalHorizon',
  );

  const band = (value: number | null, regulatory: number, internal: number): Tile['tone'] =>
    value === null ? 'neutral' : value < regulatory ? 'danger' : value < internal ? 'warning' : 'success';

  const tiles: Tile[] = [
    {
      id: 'lcr',
      label: 'Liquidity Coverage Ratio',
      value: formatPct(lcr?.lcrPercent ?? null),
      detail: lcr ? `HQLA over net 30-day outflows` : 'Not computed by this run',
      tone: band(lcr?.lcrPercent ?? null, 100, 130),
      href: '/liquidity-risk',
    },
    {
      id: 'nsfr',
      label: 'Net Stable Funding Ratio',
      value: formatPct(nsfr?.nsfrPercent ?? null),
      detail: 'Available over required stable funding',
      tone: band(nsfr?.nsfrPercent ?? null, 100, 110),
      href: '/liquidity-risk',
    },
    {
      id: 'ldr',
      label: 'Loan-to-Deposit',
      value: formatPct(ldr?.ratioPercent ?? null),
      // Lower is safer here, so the banding runs the other way.
      detail: 'Lower is more liquid',
      tone:
        ldr?.ratioPercent == null ? 'neutral' : ldr.ratioPercent > 90 ? 'danger' : ldr.ratioPercent > 80 ? 'warning' : 'success',
      href: '/liquidity-risk',
    },
    {
      id: 'survival',
      label: 'Survival horizon',
      value: survival ? `${survival.survivalHorizonDays} days` : '—',
      detail: survival?.survivesFullHorizon ? 'Survives the full 30-day scenario' : 'Buffer depletes inside 30 days',
      tone: survival == null ? 'neutral' : survival.survivalHorizonDays < 20 ? 'danger' : 'success',
      href: '/stress-testing',
    },
    {
      id: 'nii',
      label: 'NII sensitivity',
      value: formatPct(nii?.niiSensitivityPercent ?? null, 2),
      detail: nii ? `At ${nii.shockBps > 0 ? '+' : ''}${nii.shockBps}bp over ${nii.horizonDays} days` : 'Not computed',
      tone: nii == null ? 'neutral' : Math.abs(nii.niiSensitivityPercent ?? 0) > 10 ? 'warning' : 'success',
      href: '/interest-rate-risk',
    },
    {
      id: 'eve',
      label: 'EVE sensitivity',
      value: formatPct(eve?.eveSensitivityPercentOfEquity ?? null, 2),
      detail: eve ? `Against ${eve.capitalBasis.toLowerCase()}` : 'Not computed',
      tone: eve?.isBaselOutlier === true ? 'danger' : eve == null ? 'neutral' : 'success',
      href: '/interest-rate-risk',
    },
    {
      id: 'concentration',
      label: 'Largest depositor',
      value: formatPct(conc?.largestSharePercent ?? null),
      detail: conc ? `Top five hold ${formatPct(conc.topFiveSharePercent)}` : 'Not computed',
      tone:
        conc?.largestSharePercent == null
          ? 'neutral'
          : conc.largestSharePercent > 10
            ? 'danger'
            : conc.largestSharePercent > 5
              ? 'warning'
              : 'success',
      href: '/concentration',
    },
    {
      id: 'npl',
      label: 'NPL ratio',
      value: formatPct(prof?.nplRatioPercent ?? null, 2),
      detail: prof ? `Coverage ${formatPct(prof.nplCoverageRatioPercent)}` : 'Not computed',
      tone:
        prof?.nplRatioPercent == null ? 'neutral' : prof.nplRatioPercent > 5 ? 'danger' : prof.nplRatioPercent > 3 ? 'warning' : 'success',
      href: '/profitability',
    },
    {
      id: 'nim',
      label: 'Net interest margin',
      value: formatPct(prof?.netInterestMarginPercent ?? null, 2),
      detail: 'Net interest income over total assets',
      tone: 'neutral',
      href: '/profitability',
    },
  ];

  const breaches = tiles.filter((t) => t.tone === 'danger');
  const ordered = [...tiles].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));

  return (
    <>
      <ModuleHeader
        title="Dashboard"
        description="Every figure below comes from one run, so the headline and the detail screens cannot disagree."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={run?.reportingCurrency}
        metrics={[
          { label: 'Elements computed', value: run ? String(results.length) : '—' },
          {
            label: 'Metrics in breach',
            value: String(breaches.length),
            tone: breaches.length > 0 ? 'danger' : 'success',
          },
          { label: 'Pinned', value: String(pinned.length) },
        ]}
      />

      <ResultsFrame {...frameProps(selected)} requires={[]}>
        {breaches.length > 0 && (
          <div className="mb-6 rounded-2xl border border-danger/30 bg-danger/5 p-5">
            <div className="mb-2 flex items-center gap-2">
              <StatusBadge status={`${breaches.length} in breach`} tone="danger" />
              <span className="text-[12px] font-bold text-navy-900">Attention</span>
            </div>
            <ul className="space-y-1 text-[11px] text-gray-700">
              {breaches.map((b) => (
                <li key={b.id}>
                  <Link href={b.href} className="font-bold text-navy-900 underline-offset-2 hover:underline">
                    {b.label}
                  </Link>{' '}
                  at <span className="font-mono">{b.value}</span> — {b.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((tile) => (
            <article
              key={tile.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                tile.tone === 'danger'
                  ? 'border-danger/30'
                  : tile.tone === 'warning'
                    ? 'border-warning/30'
                    : 'border-gray-100'
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{tile.label}</span>
                <button
                  type="button"
                  onClick={() => togglePin(tile.id)}
                  aria-pressed={pinned.includes(tile.id)}
                  aria-label={pinned.includes(tile.id) ? `Unpin ${tile.label}` : `Pin ${tile.label}`}
                  className={`text-[13px] leading-none ${pinned.includes(tile.id) ? 'text-gold-500' : 'text-gray-300 hover:text-gray-500'}`}
                >
                  ★
                </button>
              </div>
              <p
                className={`font-mono text-[26px] font-bold ${
                  tile.tone === 'danger' ? 'text-danger' : tile.tone === 'warning' ? 'text-warning' : 'text-navy-900'
                }`}
              >
                {tile.value}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{tile.detail}</p>
              <Link
                href={tile.href}
                className="mt-3 inline-block text-[11px] font-bold text-navy-700 underline-offset-2 hover:underline"
              >
                Open detail →
              </Link>
            </article>
          ))}
        </div>

        {prof && (
          <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Balance sheet shape</h2>
            <dl className="grid grid-cols-2 gap-4 text-[12px] md:grid-cols-4">
              <Stat label="Total assets" value={<Amount value={prof.totalAssets} currency={currency} />} />
              <Stat label="Interest income" value={<Amount value={prof.interestIncome} currency={currency} />} />
              <Stat label="Interest expense" value={<Amount value={prof.interestExpense} currency={currency} />} />
              <Stat
                label="Net interest income"
                value={<Amount value={prof.netInterestIncome} currency={currency} colorBySign />}
              />
            </dl>
          </section>
        )}
      </ResultsFrame>
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
