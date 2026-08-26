/**
 * Affiliate Onboarding Wizard — screen 2.
 *
 * Seven steps, each persisting, resumable, with maker-checker on activation.
 * This is the "how a bank comes onboard" story: legal entity, currencies and
 * calendar, connectivity, chart of accounts, assumption inheritance, limits,
 * initial load.
 *
 * Two steps carry the weight. **Connectivity** is where an unavailable
 * connector routes explicitly to file substitution, with a cadence and an
 * owner. **Chart of accounts** is where the affiliate's local GL maps onto
 * the Group standard — unmapped codes block activation, which is the
 * mechanism that stops 33 incomparable balance sheets.
 */

import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates, useCurrencies, useHolidayCalendars, useSaveAffiliate } from '@/lib/hooks';
import { REGULATORY_MINIMA } from '@/engine/limits';
import type { Affiliate, DataDomain, DomainFeed, FeedMode } from '@/engine/types';

const STEPS = [
  { n: 1, title: 'Legal entity & profile', hint: 'Who the affiliate is, and who regulates it.' },
  { n: 2, title: 'Currencies & calendar', hint: 'Functional currency is immutable once set.' },
  { n: 3, title: 'Connectivity', hint: 'Where a connector is unavailable, declare file substitution.' },
  { n: 4, title: 'Chart of accounts & org structure', hint: 'Map local GL onto the Group standard.' },
  { n: 5, title: 'Assumption inheritance', hint: 'Inherit Group defaults, or fork.' },
  { n: 6, title: 'Limits & regulatory thresholds', hint: 'Minima differ by jurisdiction.' },
  { n: 7, title: 'Initial data load', hint: 'Upload, validate, reconcile, commit.' },
];

const DOMAINS: DataDomain[] = [
  'Positions',
  'GeneralLedger',
  'MarketRates',
  'FxRates',
  'Counterparties',
  'EconomicIndicators',
];

const DEFAULT_SLA: Record<DataDomain, number> = {
  Positions: 30,
  GeneralLedger: 30,
  MarketRates: 1,
  FxRates: 1,
  Counterparties: 90,
  EconomicIndicators: 30,
};

const REGULATORS = ['CBN', 'Bank of Ghana', 'BCEAO', 'BEAC', 'Bank of Zambia', 'Central Bank of Kenya'];

interface Draft {
  code: string;
  name: string;
  country: string;
  region: string;
  regulator: string;
  legalEntityCode: string;
  functionalCurrency: string;
  reportingCurrency: string;
  activeCurrencies: string[];
  fiscalYearEnd: string;
  holidayCalendarId: string | null;
  feeds: DomainFeed[];
  /** Local GL prefix → Group COA node. Unmapped codes block activation. */
  coaMappings: Array<{ localPrefix: string; commonCoa: string }>;
  orgUnitsCreated: boolean;
  inheritGroupRules: boolean;
  limitsConfirmed: boolean;
  dataLoaded: boolean;
}

const EMPTY: Draft = {
  code: '',
  name: '',
  country: '',
  region: 'West Africa',
  regulator: 'CBN',
  legalEntityCode: '',
  functionalCurrency: '',
  reportingCurrency: 'USD',
  activeCurrencies: [],
  fiscalYearEnd: '12-31',
  holidayCalendarId: null,
  feeds: DOMAINS.map((domain) => ({
    domain,
    mode: 'NotConfigured' as FeedMode,
    connectorId: null,
    slaDays: DEFAULT_SLA[domain],
    owner: null,
  })),
  coaMappings: [],
  orgUnitsCreated: false,
  inheritGroupRules: true,
  limitsConfirmed: false,
  dataLoaded: false,
};

const COA_NODES = [
  { code: 'COA-11', name: 'Cash & Balances with Central Banks' },
  { code: 'COA-12', name: 'Due from Banks' },
  { code: 'COA-13', name: 'Investment Securities' },
  { code: 'COA-14', name: 'Loans & Advances to Customers' },
  { code: 'COA-15', name: 'Property, Equipment & Other Assets' },
  { code: 'COA-21', name: 'Due to Banks' },
  { code: 'COA-22', name: 'Customer Deposits' },
  { code: 'COA-23', name: 'Debt Securities Issued' },
  { code: 'COA-24', name: 'Other Liabilities & Provisions' },
  { code: 'COA-31', name: 'Share Capital' },
  { code: 'COA-32', name: 'Reserves & Retained Earnings' },
];

export function OnboardAffiliate() {
  const [, navigate] = useLocation();
  const { hasPermission } = useAuth();
  const { data: affiliates = [] } = useAffiliates();
  const { data: currencies = [] } = useCurrencies();
  const { data: calendars = [] } = useHolidayCalendars();
  const save = useSaveAffiliate();
  const canOnboard = hasPermission('group.manage');

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [activated, setActivated] = useState(false);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const updateFeed = (domain: DataDomain, patch: Partial<DomainFeed>) =>
    set({ feeds: draft.feeds.map((f) => (f.domain === domain ? { ...f, ...patch } : f)) });

  /** Which COA nodes still have no local GL mapped to them. */
  const unmappedCoa = useMemo(
    () => COA_NODES.filter((n) => !draft.coaMappings.some((m) => m.commonCoa === n.code && m.localPrefix.trim())),
    [draft.coaMappings],
  );

  const complete: Record<number, boolean> = {
    1: draft.code.trim().length >= 2 && draft.name.trim().length > 0 && draft.country.trim().length > 0,
    2: draft.functionalCurrency !== '' && draft.reportingCurrency !== '',
    3: draft.feeds.every((f) => f.mode !== 'NotConfigured'),
    // Every Group COA node must be reachable from a local code, or figures
    // cannot be compared with the rest of the Group.
    4: unmappedCoa.length === 0 && draft.orgUnitsCreated,
    5: true,
    6: draft.limitsConfirmed,
    7: draft.dataLoaded,
  };

  const allComplete = STEPS.every((s) => complete[s.n]);
  const duplicateCode = affiliates.some((a) => a.code.toUpperCase() === draft.code.trim().toUpperCase());

  const handleActivate = () => {
    if (!allComplete || duplicateCode) return;
    const affiliate: Affiliate = {
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      country: draft.country.trim(),
      region: draft.region,
      regulator: draft.regulator,
      functionalCurrency: draft.functionalCurrency,
      reportingCurrency: draft.reportingCurrency,
      activeCurrencies: draft.activeCurrencies.length > 0 ? draft.activeCurrencies : [draft.functionalCurrency],
      // Testing, not Live: activation still needs maker-checker approval,
      // and only Live affiliates consolidate into Group.
      status: 'Testing',
      fiscalYearEnd: draft.fiscalYearEnd,
      holidayCalendarId: draft.holidayCalendarId,
      legalEntityCode: draft.legalEntityCode || `LE-${draft.code.trim().toUpperCase()}`,
      feeds: draft.feeds,
      createdAt: new Date().toISOString(),
    };
    save.mutate(affiliate, { onSuccess: () => setActivated(true) });
  };

  const minima = REGULATORY_MINIMA[draft.regulator] ?? { lcrPercent: 100, nsfrPercent: 100 };

  return (
    <>
      <ModuleHeader
        title="Onboard Affiliate"
        description="Seven steps from nothing to a testing affiliate. Each step persists, and activation requires maker-checker approval before the affiliate consolidates into Group."
        asOfDate={null}
        scope={draft.name || 'New affiliate'}
        metrics={[
          { label: 'Step', value: `${step} of ${STEPS.length}` },
          { label: 'Complete', value: `${STEPS.filter((s) => complete[s.n]).length}/${STEPS.length}` },
          {
            label: 'Unmapped COA',
            value: String(unmappedCoa.length),
            tone: unmappedCoa.length > 0 ? 'danger' : 'success',
          },
          {
            label: 'Status',
            value: activated ? 'Testing' : 'Draft',
            tone: activated ? 'success' : 'neutral',
          },
        ]}
      />

      {activated ? (
        <section className="rounded-2xl border border-success/20 bg-success-bg p-8 text-center">
          <h2 className="text-[16px] font-bold text-navy-900">{draft.name} onboarded</h2>
          <p className="mx-auto mt-2 max-w-lg text-[12px] leading-relaxed text-gray-600">
            Created in <span className="font-bold">Testing</span> status. It will not appear in Group-consolidated
            figures until an approver moves it to Live — that gate is deliberate, so a half-configured affiliate cannot
            quietly join the Group balance sheet.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/affiliates')}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
            >
              Back to affiliates
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(EMPTY);
                setStep(1);
                setActivated(false);
              }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
            >
              Onboard another
            </button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <nav aria-label="Onboarding steps" className="lg:col-span-1">
            <ol className="space-y-1">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => setStep(s.n)}
                    aria-current={step === s.n ? 'step' : undefined}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors',
                      step === s.n ? 'border-navy-700 bg-navy-50' : 'border-gray-200 bg-white hover:border-navy-700',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                          complete[s.n] ? 'bg-success text-white' : 'bg-gray-200 text-gray-500',
                        )}
                      >
                        {complete[s.n] ? '✓' : s.n}
                      </span>
                      <span className="text-[12px] font-bold text-navy-900">{s.title}</span>
                    </span>
                    <span className="mt-1 block pl-7 text-[11px] leading-relaxed text-gray-500">{s.hint}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-3">
            {step === 1 && (
              <Step title="Legal entity & profile">
                <Grid>
                  <Field label="Affiliate code" hint="Two-letter ISO country code, usually">
                    <input
                      value={draft.code}
                      onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                      placeholder="ZM"
                      className={input}
                    />
                    {duplicateCode && draft.code && (
                      <p className="mt-1 text-[11px] text-danger">That code is already in use.</p>
                    )}
                  </Field>
                  <Field label="Legal name">
                    <input
                      value={draft.name}
                      onChange={(e) => set({ name: e.target.value })}
                      placeholder="Ecobank Zambia Limited"
                      className={input}
                    />
                  </Field>
                  <Field label="Country">
                    <input
                      value={draft.country}
                      onChange={(e) => set({ country: e.target.value })}
                      placeholder="Zambia"
                      className={input}
                    />
                  </Field>
                  <Field label="Region">
                    <select value={draft.region} onChange={(e) => set({ region: e.target.value })} className={input}>
                      {[
                        'West Africa',
                        'Anglophone West Africa',
                        'UEMOA',
                        'Central Africa',
                        'East Africa',
                        'Southern Africa',
                        'Nigeria',
                      ].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Regulator" hint="Determines the regulatory minima seeded at step 6">
                    <select
                      value={draft.regulator}
                      onChange={(e) => set({ regulator: e.target.value })}
                      className={input}
                    >
                      {REGULATORS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Legal entity code" hint="Position in the Group legal-entity hierarchy">
                    <input
                      value={draft.legalEntityCode}
                      onChange={(e) => set({ legalEntityCode: e.target.value.toUpperCase() })}
                      placeholder={draft.code ? `LE-${draft.code}` : 'LE-ZM'}
                      className={input}
                    />
                  </Field>
                </Grid>
              </Step>
            )}

            {step === 2 && (
              <Step title="Currencies & calendar">
                <p className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                  Three currency roles, following OFSAA: one <span className="font-bold">functional</span> currency
                  which cannot be changed once set, a <span className="font-bold">reporting</span> currency that
                  intermediates consolidation, and any other currencies the affiliate transacts in.
                </p>
                <Grid>
                  <Field label="Functional currency" hint="Immutable once the affiliate is created">
                    <select
                      value={draft.functionalCurrency}
                      onChange={(e) => set({ functionalCurrency: e.target.value })}
                      className={input}
                    >
                      <option value="">— select —</option>
                      {currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Reporting currency" hint="What this affiliate consolidates into">
                    <select
                      value={draft.reportingCurrency}
                      onChange={(e) => set({ reportingCurrency: e.target.value })}
                      className={input}
                    >
                      {currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Fiscal year end">
                    <input
                      value={draft.fiscalYearEnd}
                      onChange={(e) => set({ fiscalYearEnd: e.target.value })}
                      placeholder="12-31"
                      className={input}
                    />
                  </Field>
                  <Field label="Holiday calendar" hint="Determines business days for settlement">
                    <select
                      value={draft.holidayCalendarId ?? ''}
                      onChange={(e) => set({ holidayCalendarId: e.target.value || null })}
                      className={input}
                    >
                      <option value="">— none yet —</option>
                      {calendars.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </Grid>
                <Field label="Other active currencies" hint="Currencies transacted in but not consolidated through">
                  <div className="flex flex-wrap gap-2">
                    {currencies
                      .filter((c) => c.code !== draft.functionalCurrency)
                      .map((c) => (
                        <span
                          key={c.code}
                          className="flex items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-[11px]"
                        >
                          <input
                            id={`ccy-${c.code}`}
                            type="checkbox"
                            checked={draft.activeCurrencies.includes(c.code)}
                            onChange={(e) =>
                              set({
                                activeCurrencies: e.target.checked
                                  ? [...draft.activeCurrencies, c.code]
                                  : draft.activeCurrencies.filter((x) => x !== c.code),
                              })
                            }
                            className="accent-gold-500"
                          />
                          <label htmlFor={`ccy-${c.code}`} className="cursor-pointer">
                            {c.code}
                          </label>
                        </span>
                      ))}
                  </div>
                </Field>
              </Step>
            )}

            {step === 3 && (
              <Step title="Connectivity">
                <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-navy-50 px-4 py-3">
                  <p className="text-[11px] leading-relaxed text-navy-900">
                    Every domain must be fed by something. Where a connector is unavailable, declare{' '}
                    <span className="font-bold">file substitution</span> with a cadence and a named owner.
                  </p>
                  <Link
                    href="/connectors"
                    className="shrink-0 whitespace-nowrap text-[11px] font-bold text-navy-700 hover:underline"
                  >
                    Configure connectors →
                  </Link>
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="py-2 font-bold">Domain</th>
                      <th className="py-2 font-bold">Fed by</th>
                      <th className="py-2 text-right font-bold">SLA (days)</th>
                      <th className="py-2 font-bold">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.feeds.map((f) => (
                      <tr key={f.domain} className="border-b border-gray-100">
                        <td className="py-2 font-medium text-navy-900">{f.domain}</td>
                        <td className="py-2">
                          <select
                            value={f.mode}
                            onChange={(e) => updateFeed(f.domain, { mode: e.target.value as FeedMode })}
                            className="rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                            aria-label={`${f.domain} feed mode`}
                          >
                            <option value="NotConfigured">Not configured</option>
                            <option value="Connector">Connector</option>
                            <option value="File">File substitution</option>
                          </select>
                        </td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            min={1}
                            value={f.slaDays}
                            onChange={(e) => updateFeed(f.domain, { slaDays: Number(e.target.value) })}
                            className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                            aria-label={`${f.domain} SLA days`}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            value={f.owner ?? ''}
                            onChange={(e) => updateFeed(f.domain, { owner: e.target.value || null })}
                            placeholder="Named owner"
                            className="w-40 rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                            aria-label={`${f.domain} owner`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Step>
            )}

            {step === 4 && (
              <Step title="Chart of accounts & org structure">
                <p className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                  Map this affiliate&rsquo;s local GL codes onto the Group standard. Local charts genuinely differ —
                  Nigeria runs a numeric scheme, Ghana letter-prefixed, UEMOA affiliates SYSCOHADA — and this mapping is
                  what makes them comparable. <span className="font-bold">Unmapped nodes block activation.</span>
                </p>
                <table className="mb-5 w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="py-2 font-bold">Group COA node</th>
                      <th className="py-2 font-bold">Local GL code or prefix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COA_NODES.map((n) => {
                      const mapping = draft.coaMappings.find((m) => m.commonCoa === n.code);
                      return (
                        <tr key={n.code} className="border-b border-gray-100">
                          <td className="py-2">
                            <span className="font-mono text-[11px] text-gray-500">{n.code}</span>{' '}
                            <span className="text-navy-900">{n.name}</span>
                          </td>
                          <td className="py-2">
                            <input
                              value={mapping?.localPrefix ?? ''}
                              onChange={(e) =>
                                set({
                                  coaMappings: [
                                    ...draft.coaMappings.filter((m) => m.commonCoa !== n.code),
                                    { commonCoa: n.code, localPrefix: e.target.value },
                                  ],
                                })
                              }
                              placeholder="e.g. ZM-1010"
                              className="w-48 rounded border border-gray-200 px-2 py-1 font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                              aria-label={`Local code for ${n.name}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="flex items-start gap-2 rounded-lg border border-gray-200 p-3">
                  <input
                    id="org-template"
                    type="checkbox"
                    checked={draft.orgUnitsCreated}
                    onChange={(e) => set({ orgUnitsCreated: e.target.checked })}
                    className="mt-0.5 accent-gold-500"
                  />
                  <label htmlFor="org-template" className="cursor-pointer text-[12px]">
                    <span className="block font-bold text-navy-900">Create the standard org-unit template</span>
                    <span className="block text-[11px] leading-relaxed text-gray-500">
                      Retail, Corporate &amp; Investment Banking, Treasury and Wealth Management, with the regional
                      network beneath Retail. Following the Group template is what keeps segment reporting comparable
                      across affiliates.
                    </span>
                  </label>
                </div>
              </Step>
            )}

            {step === 5 && (
              <Step title="Assumption inheritance">
                <div className="space-y-3">
                  <div
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-4',
                      draft.inheritGroupRules ? 'border-navy-700 bg-navy-50' : 'border-gray-200',
                    )}
                  >
                    <input
                      id="inherit-group"
                      type="radio"
                      name="rule-inheritance"
                      checked={draft.inheritGroupRules}
                      onChange={() => set({ inheritGroupRules: true })}
                      className="mt-0.5 accent-gold-500"
                    />
                    <label htmlFor="inherit-group" className="cursor-pointer">
                      <span className="block text-[12px] font-bold text-navy-900">
                        Inherit the Group default rule set
                      </span>
                      <span className="block text-[11px] leading-relaxed text-gray-500">
                        Time buckets, product characteristics, behaviour patterns and discount methods come from the
                        Group folder. This is what makes onboarding affiliates 4 through 33 cheap: they map onto the
                        standard rather than rebuilding it.
                      </span>
                    </label>
                  </div>
                  <div
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-4',
                      !draft.inheritGroupRules ? 'border-navy-700 bg-navy-50' : 'border-gray-200',
                    )}
                  >
                    <input
                      id="fork-rules"
                      type="radio"
                      name="rule-inheritance"
                      checked={!draft.inheritGroupRules}
                      onChange={() => set({ inheritGroupRules: false })}
                      className="mt-0.5 accent-gold-500"
                    />
                    <label htmlFor="fork-rules" className="cursor-pointer">
                      <span className="block text-[12px] font-bold text-navy-900">Fork affiliate-specific rules</span>
                      <span className="block text-[11px] leading-relaxed text-gray-500">
                        Copies the Group rules into this affiliate&rsquo;s folder so they can diverge. Divergence shows
                        as a diff against Group, so it stays visible rather than drifting silently.
                      </span>
                    </label>
                  </div>
                </div>
              </Step>
            )}

            {step === 6 && (
              <Step title="Limits & regulatory thresholds">
                <p className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                  Regulatory minima are seeded from the regulator selected at step 1, because they genuinely differ.{' '}
                  <span className="font-bold">{draft.regulator}</span> is applied here. Internal appetite is set on top,
                  in three tiers.
                </p>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="py-2 font-bold">Metric</th>
                      <th className="py-2 text-right font-bold">Regulatory minimum</th>
                      <th className="py-2 text-right font-bold">Internal amber</th>
                      <th className="py-2 text-right font-bold">Internal red</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(minima).map(([metric, value]) => (
                      <tr key={metric} className="border-b border-gray-100">
                        <td className="py-2 font-medium text-navy-900">{metric}</td>
                        <td className="py-2 text-right font-mono">{value}%</td>
                        <td className="py-2 text-right font-mono text-warning">{Math.round(value * 1.1)}%</td>
                        <td className="py-2 text-right font-mono text-danger">{value}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 flex items-center gap-2 text-[12px]">
                  <input
                    id="limits-confirmed"
                    type="checkbox"
                    checked={draft.limitsConfirmed}
                    onChange={(e) => set({ limitsConfirmed: e.target.checked })}
                    className="accent-gold-500"
                  />
                  <label htmlFor="limits-confirmed" className="cursor-pointer text-navy-900">
                    Confirm these thresholds for {draft.name || 'this affiliate'}
                  </label>
                </div>
              </Step>
            )}

            {step === 7 && (
              <Step title="Initial data load">
                <p className="mb-4 text-[12px] leading-relaxed text-gray-600">
                  Upload the position book and the general-ledger trial balance, run the validation rules, resolve or
                  accept exceptions, reconcile, and commit. The first process run executes automatically on commit.
                </p>
                <ol className="mb-4 space-y-2 text-[12px]">
                  {[
                    'Upload position book',
                    'Run validation rules',
                    'Reconcile to the general ledger',
                    'Commit the batch',
                  ].map((label, i) => (
                    <li key={label} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
                        {i + 1}
                      </span>
                      <span className="text-navy-900">{label}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex items-center gap-2 text-[12px]">
                  <input
                    id="data-loaded"
                    type="checkbox"
                    checked={draft.dataLoaded}
                    onChange={(e) => set({ dataLoaded: e.target.checked })}
                    className="accent-gold-500"
                  />
                  <label htmlFor="data-loaded" className="cursor-pointer text-navy-900">
                    Initial load complete and reconciled
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  Data Upload &amp; Staging and GL Reconciliation are the screens that do this work — this step records
                  that it has been done.
                </p>
              </Step>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
                className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900 disabled:opacity-30"
              >
                Back
              </button>

              <div className="flex items-center gap-3">
                {!complete[step] && <StatusBadge status="Step incomplete" tone="warning" />}
                {step < STEPS.length ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleActivate}
                    disabled={!canOnboard || !allComplete || duplicateCode || save.isPending}
                    title={!allComplete ? 'Complete every step first' : undefined}
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  >
                    {save.isPending ? 'Creating…' : 'Submit for approval'}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

const input =
  'w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">{title}</h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <span className="mb-1 block text-[11px] font-medium text-gray-600">{label}</span>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-gray-400">{hint}</p>}
    </div>
  );
}
