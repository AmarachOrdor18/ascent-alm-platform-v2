/**
 * Dashboard — screen 35.
 *
 * The one screen that is *meant* to be a dashboard. Everything here comes
 * off a single run, so the headline numbers and the detail screens can never
 * disagree — which they could in v1, where each screen recomputed from a
 * different unscoped query.
 *
 * Redesigned for density over explanation: a nine-tile grid of equally
 * weighted cards, each carrying its own descriptive sentence, read as a
 * wall of text rather than a dashboard. Four headline numbers now carry
 * the eye first; the rest sit in a lighter label-and-value grid a step
 * down, the same weighting a trading-floor dashboard uses.
 */

import type { ReactNode } from 'react';
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

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

interface Metric {
  id: string;
  label: string;
  value: string;
  tone: Tone;
  href: string;
}

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-navy-900',
};

export function Dashboard() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;

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

  const band = (value: number | null, regulatory: number, internal: number): Tone =>
    value === null ? 'neutral' : value < regulatory ? 'danger' : value < internal ? 'warning' : 'success';

  // The four numbers a treasury desk checks first.
  const headline: Metric[] = [
    { id: 'lcr', label: 'LCR', value: formatPct(lcr?.lcrPercent ?? null), tone: band(lcr?.lcrPercent ?? null, 100, 130), href: '/liquidity-risk' },
    { id: 'nsfr', label: 'NSFR', value: formatPct(nsfr?.nsfrPercent ?? null), tone: band(nsfr?.nsfrPercent ?? null, 100, 110), href: '/liquidity-risk' },
    {
      id: 'survival',
      label: 'Survival horizon',
      value: survival ? `${survival.survivalHorizonDays}d` : 'No run',
      tone: survival == null ? 'neutral' : survival.survivalHorizonDays < 20 ? 'danger' : 'success',
      href: '/stress-testing',
    },
    { id: 'ldr', label: 'Loan-to-Deposit', value: formatPct(ldr?.ratioPercent ?? null), tone: ldr?.ratioPercent == null ? 'neutral' : ldr.ratioPercent > 90 ? 'danger' : ldr.ratioPercent > 80 ? 'warning' : 'success', href: '/liquidity-risk' },
  ];

  // Everything else, read as a label next to a number, not a card.
  const snapshot: Metric[] = [
    { id: 'nii', label: 'NII sensitivity', value: formatPct(nii?.niiSensitivityPercent ?? null, 2), tone: nii == null ? 'neutral' : Math.abs(nii.niiSensitivityPercent ?? 0) > 10 ? 'warning' : 'success', href: '/interest-rate-risk' },
    { id: 'eve', label: 'EVE sensitivity', value: formatPct(eve?.eveSensitivityPercentOfEquity ?? null, 2), tone: eve?.isBaselOutlier === true ? 'danger' : eve == null ? 'neutral' : 'success', href: '/interest-rate-risk' },
    { id: 'concentration', label: 'Largest depositor', value: formatPct(conc?.largestSharePercent ?? null), tone: conc?.largestSharePercent == null ? 'neutral' : conc.largestSharePercent > 10 ? 'danger' : conc.largestSharePercent > 5 ? 'warning' : 'success', href: '/concentration' },
    { id: 'npl', label: 'NPL ratio', value: formatPct(prof?.nplRatioPercent ?? null, 2), tone: prof?.nplRatioPercent == null ? 'neutral' : prof.nplRatioPercent > 5 ? 'danger' : prof.nplRatioPercent > 3 ? 'warning' : 'success', href: '/profitability' },
    { id: 'nim', label: 'Net interest margin', value: formatPct(prof?.netInterestMarginPercent ?? null, 2), tone: 'neutral', href: '/profitability' },
  ];

  const breaches = [...headline, ...snapshot].filter((m) => m.tone === 'danger');

  return (
    <>
      <ModuleHeader
        title="Dashboard"
        description="One run. Every number below reads off it."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={run?.reportingCurrency}
        metrics={[
          { label: 'In breach', value: String(breaches.length), tone: breaches.length > 0 ? 'danger' : 'success' },
          { label: 'Elements computed', value: run ? String(results.length) : '0' },
        ]}
      />

      <ResultsFrame {...frameProps(selected)} requires={[]}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {headline.map((m) => (
            <Link
              key={m.id}
              href={m.href}
              className={`block rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
                m.tone === 'danger' ? 'border-danger/30' : m.tone === 'warning' ? 'border-warning/30' : 'border-gray-200'
              }`}
            >
              <p className="text-[13px] font-medium text-gray-500">{m.label}</p>
              <p className={`mt-3 font-mono text-[26px] font-bold tracking-tight ${TONE_TEXT[m.tone]}`}>{m.value}</p>
            </Link>
          ))}
        </div>

        {breaches.length > 0 && (
          <div className="mt-6 rounded-xl border border-danger/30 bg-danger/5 p-5">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">In breach</p>
            <div className="space-y-2">
              {breaches.map((b) => (
                <Link key={b.id} href={b.href} className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-navy-900 hover:underline">{b.label}</span>
                  <StatusBadge status={b.value} tone="danger" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <section className="mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Risk snapshot</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {snapshot.map((m) => (
              <Link key={m.id} href={m.href} className="block rounded-lg bg-gray-50 p-3 hover:bg-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{m.label}</p>
                <p className={`mt-1 text-[16px] font-bold ${TONE_TEXT[m.tone]}`}>{m.value}</p>
              </Link>
            ))}
          </div>
        </section>

        {prof && (
          <section className="mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
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
