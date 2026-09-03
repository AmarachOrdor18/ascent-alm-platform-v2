import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useRoute, useSearch } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { Amount } from '@/components/ui/Amount';
import { toCsv, downloadBlob } from '@/components/ui/TableControls';
import { ShieldCheckIcon } from '@/components/icons/Icons';
import { DOMAINS, DOMAIN_LABEL, STATUS_LABEL, STATUS_TONE } from '@/components/connectors/connectorConstants';
import { FeedStatusBadge } from '@/components/connectors/FeedStatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useSaveAffiliate, useDeleteAffiliate, usePositions, useBatches } from '@/lib/hooks';
import { isRestrictedToOwnAffiliate } from '@/lib/scope';
import { availableFor, useConnectors } from '@/lib/connectorHooks';
import { useRules } from '@/lib/ruleHooks';
import { approvals } from '@/lib/governanceHooks';
import { checkAllDomains } from '@/engine/vintage';
import { METRIC_LABEL, REGULATORY_MINIMA } from '@/engine/limits';
import { formatDate } from '@/lib/format';
import type { AffiliateStatus, DataDomain, DomainFeed, FeedMode, InternalThreshold, RuleKind } from '@/engine/types';

const TODAY = new Date().toISOString().slice(0, 10);
const FRESHNESS_TONE = { Fresh: 'success', Due: 'warning', Stale: 'danger', 'Never loaded': 'neutral' } as const;

function SettingsScreenFallback() {
  return <div className="p-6 text-[12px] text-gray-400">Loading…</div>;
}

const AdminUsersLazy = lazy(() => import('@/pages/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const NotificationsLazy = lazy(() => import('@/pages/Notifications').then((m) => ({ default: m.Notifications })));
const AdminAuditLazy = lazy(() => import('@/pages/AdminAudit').then((m) => ({ default: m.AdminAudit })));
const ValidationRulesLazy = lazy(() => import('@/pages/ValidationRules').then((m) => ({ default: m.ValidationRules })));
const ModelsAssumptionsLazy = lazy(() =>
  import('@/pages/rules/ModelsAssumptions').then((m) => ({ default: m.ModelsAssumptions })),
);
const ConnectorsLazy = lazy(() => import('@/pages/Connectors').then((m) => ({ default: m.Connectors })));
const YieldCurvesLazy = lazy(() => import('@/pages/YieldCurves').then((m) => ({ default: m.YieldCurves })));
const FxRatesLazy = lazy(() => import('@/pages/FxRates').then((m) => ({ default: m.FxRates })));
const EconomicIndicatorsLazy = lazy(() =>
  import('@/pages/EconomicIndicators').then((m) => ({ default: m.EconomicIndicators })),
);
const HolidayCalendarLazy = lazy(() =>
  import('@/pages/HolidayCalendar').then((m) => ({ default: m.HolidayCalendar })),
);

const RULE_COMPONENTS: Partial<Record<RuleKind, React.LazyExoticComponent<() => JSX.Element>>> = {
  TimeBucket: lazy(() => import('@/pages/rules/TimeBucketRules').then((m) => ({ default: m.TimeBucketRules }))),
  ProductCharacteristic: lazy(() =>
    import('@/pages/rules/ProductCharacteristics').then((m) => ({ default: m.ProductCharacteristics })),
  ),
  BehaviourPattern: lazy(() => import('@/pages/rules/BehaviourPatterns').then((m) => ({ default: m.BehaviourPatterns }))),
  PaymentPattern: lazy(() => import('@/pages/rules/SimpleRules').then((m) => ({ default: m.Patterns }))),
  Prepayment: lazy(() => import('@/pages/rules/SimpleRules').then((m) => ({ default: m.PrepaymentRules }))),
  DiscountMethod: lazy(() => import('@/pages/rules/SimpleRules').then((m) => ({ default: m.DiscountMethods }))),
  ForecastScenario: lazy(() => import('@/pages/rules/ForecastScenarios').then((m) => ({ default: m.ForecastScenarios }))),
  NewBusiness: lazy(() => import('@/pages/rules/NewBusiness').then((m) => ({ default: m.NewBusiness }))),
  TransactionStrategy: lazy(() =>
    import('@/pages/rules/TransactionStrategies').then((m) => ({ default: m.TransactionStrategies })),
  ),
  FtpRule: lazy(() => import('@/pages/rules/FtpAndAdjustments').then((m) => ({ default: m.FtpRules }))),
  AdjustmentRule: lazy(() => import('@/pages/rules/FtpAndAdjustments').then((m) => ({ default: m.AdjustmentRules }))),
  Filter: lazy(() => import('@/pages/rules/SimpleRules').then((m) => ({ default: m.Filters }))),
  CustomMetric: lazy(() => import('@/pages/rules/CustomMetrics').then((m) => ({ default: m.CustomMetrics }))),
  FieldMapping: lazy(() => import('@/pages/rules/FieldMappings').then((m) => ({ default: m.FieldMappings }))),
  CodeMapping: lazy(() => import('@/pages/rules/CodeMappings').then((m) => ({ default: m.CodeMappings }))),
};

// Where each domain's data actually enters the platform - positions and GL via Data Operations,
// counterparties via the register, market/reference data on the Group's reference-data pages.
const DOMAIN_UPLOAD: Record<DataDomain, { label: string; path: string }> = {
  Positions: { label: 'Open Data Upload', path: '/data/operations' },
  GeneralLedger: { label: 'Open GL Reconciliation', path: '/data/operations/gl-reconciliation' },
  Counterparties: { label: 'Open Counterparty Register', path: '/data/structure/counterparties' },
  MarketRates: { label: 'Open Interest Rates & Curves', path: '/affiliates/GROUP/settings?section=ref-yield-curves' },
  FxRates: { label: 'Open Currency & FX Rates', path: '/affiliates/GROUP/settings?section=ref-fx-rates' },
  EconomicIndicators: { label: 'Open Economic Indicators', path: '/affiliates/GROUP/settings?section=ref-economic-indicators' },
};

const DEFAULT_SLA: Record<DataDomain, number> = {
  Positions: 30,
  GeneralLedger: 30,
  MarketRates: 1,
  FxRates: 1,
  Counterparties: 90,
  EconomicIndicators: 30,
};

// Testing → Live is deliberately absent - it only happens through Approvals (see Approvals.tsx's decide()).
const NEXT_STATUS: Record<AffiliateStatus, AffiliateStatus[]> = {
  Onboarding: ['Testing'],
  Testing: [],
  Live: ['Suspended'],
  Suspended: ['Live'],
};

const RULE_LINKS: Array<{ kind: RuleKind; label: string }> = [
  { kind: 'TimeBucket', label: 'Time Buckets' },
  { kind: 'ProductCharacteristic', label: 'Product Characteristics' },
  { kind: 'BehaviourPattern', label: 'Behavioural Patterns' },
  { kind: 'PaymentPattern', label: 'Payment & Repricing Patterns' },
  { kind: 'Prepayment', label: 'Prepayment' },
  { kind: 'DiscountMethod', label: 'Discount Methods' },
  { kind: 'ForecastScenario', label: 'Forecast Scenarios' },
  { kind: 'NewBusiness', label: 'New Business' },
  { kind: 'TransactionStrategy', label: 'Transaction Strategies' },
  { kind: 'FtpRule', label: 'FTP Rules' },
  { kind: 'AdjustmentRule', label: 'Adjustment Rules' },
  { kind: 'Filter', label: 'Filters' },
  { kind: 'CustomMetric', label: 'Custom Metrics' },
  { kind: 'ValidationRule', label: 'Validation Rules' },
  { kind: 'FieldMapping', label: 'Field Mappings' },
  { kind: 'CodeMapping', label: 'Code Mappings' },
];

interface Category {
  key: string;
  label: string;
}
interface Group {
  group: string;
  items: Category[];
}
// Connector records and reference data (yield curves, FX rates, economic indicators, holiday calendar)
// are Group-wide/shared - no affiliate field on any of them - so they only make sense as categories on
// the Group row's own Settings, never on an individual affiliate's. Same for Rule Coverage, the one
// cross-affiliate view of which affiliate has forked which rule kind.
function buildNav(isGroup: boolean): Group[] {
  return [
    { group: 'PROFILE', items: [
      { key: 'overview', label: 'Overview' },
      ...(isGroup ? [] : [
        { key: 'profile', label: 'Profile' },
        { key: 'thresholds', label: 'Thresholds' },
        { key: 'inheritance', label: 'Rule Inheritance' },
      ]),
    ] },
    { group: 'ACCESS & FEEDS', items: [
      { key: 'data-sources', label: 'Data Sources' },
      { key: 'users', label: 'Users' },
    ] },
    { group: 'BUSINESS RULES', items: [
      ...(isGroup ? [{ key: 'rule-coverage', label: 'Rule Coverage' }] : []),
      ...RULE_LINKS.map((r) => ({ key: `rule-${r.kind}`, label: r.label })),
    ] },
    ...(isGroup ? [
      { group: 'REFERENCE DATA', items: [
        { key: 'ref-yield-curves', label: 'Interest Rates & Curves' },
        { key: 'ref-fx-rates', label: 'Currency & FX Rates' },
        { key: 'ref-economic-indicators', label: 'Economic Indicators' },
        { key: 'ref-holiday-calendar', label: 'Holiday Calendar' },
      ] },
    ] : []),
    { group: 'MORE', items: [
      { key: 'notifications', label: 'Notifications' },
      { key: 'audit', label: 'Audit Log' },
      { key: 'credentials', label: 'Credentials' },
      { key: 'webhooks', label: 'Webhooks' },
      { key: 'export', label: 'Data & Export' },
    ] },
  ];
}

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-[13px] font-bold text-navy-900">{title}</h2>
      {description && <p className="mt-0.5 text-[11px] text-gray-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-0.5 block text-[12px] font-bold text-navy-900">{label}</label>
      {hint && <p className="mb-1 text-[11px] text-gray-500">{hint}</p>}
      {children}
    </div>
  );
}

function OverviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className={mono ? 'font-mono text-navy-900' : 'text-navy-900'}>{value}</dd>
    </div>
  );
}

export function AffiliateSettings() {
  const [, params] = useRoute('/affiliates/:code/settings');
  const { user, hasPermission } = useAuth();
  const { setAffiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: connectors = [] } = useConnectors();
  const save = useSaveAffiliate();
  const deleteAffiliate = useDeleteAffiliate();
  const [, navigate] = useLocation();
  const canManage = hasPermission('group.manage');
  const searchString = useSearch();
  // Lets a link/redirect deep-link straight to a category (e.g. `?section=connectors`) instead of
  // always landing on Profile - read once on mount, not resynced on every search-string change, so
  // navigating between categories in-page doesn't fight the URL.
  const [section, setSection] = useState(() => new URLSearchParams(searchString).get('section') || 'overview');
  // Click-throughs from the Group health matrix (and any other in-app link) arrive as a new
  // ?section= on the same route, so keep the in-page section in sync with the URL after mount.
  useEffect(() => {
    const next = new URLSearchParams(searchString).get('section');
    if (next) setSection(next);
  }, [searchString]);

  const affiliate = affiliates.find((a) => a.code === params?.code);

  // ── Overview (absorbed from the old read-only AffiliateDetail/"View" page) ─────────────
  const { data: batches = [] } = useBatches();
  const { data: overviewPositions = [] } = usePositions(affiliate?.code);
  const { data: approvalRequests = [] } = approvals.useList(affiliate?.code);
  const pendingActivation = approvalRequests.find(
    (r) => r.status === 'Pending' && r.module === 'Affiliates' && r.action === 'Activate',
  );
  const freshness = affiliate ? checkAllDomains(affiliate, batches, TODAY) : [];

  // Group-level Connection Health view: every non-Group affiliate's feeds, and the two
  // numbers a Group reader acts on - how many feeds have aged past SLA and how many
  // domains were never wired up at all.
  const feedAffiliates = affiliates.filter((a) => a.code !== 'GROUP');
  const [healthFilter, setHealthFilter] = useState<string>('ALL');
  const allFreshness = feedAffiliates.flatMap((a) => checkAllDomains(a, batches, TODAY));
  const staleFeeds = allFreshness.filter((f) => f.status === 'Stale').length;
  const notConfiguredFeeds = allFreshness.filter((f) => {
    const feed = feedAffiliates.find((a) => a.code === f.affiliateCode)?.feeds.find((x) => x.domain === f.domain);
    return !feed || feed.mode === 'NotConfigured';
  }).length;
  const overviewTotals = (category: string) =>
    overviewPositions.filter((p) => p.category === category).reduce((s, p) => s + p.amount, 0);

  // ── Profile draft ──────────────────────────────────────────────────────
  const [profileDraft, setProfileDraft] = useState<{ name: string; country: string; effectiveDate: string; reportingTimezone: string } | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  useEffect(() => {
    if (!affiliate) return;
    setProfileDraft({
      name: affiliate.name,
      country: affiliate.country,
      effectiveDate: affiliate.effectiveDate ?? '',
      reportingTimezone: affiliate.reportingTimezone ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydration on affiliate switch
  }, [affiliate?.code]);

  // ── Feeds & Connectors ───────────────────────────────────────────────
  const [savedDomain, setSavedDomain] = useState<DataDomain | null>(null);
  const feedFor = (domain: DataDomain): DomainFeed =>
    affiliate?.feeds.find((f) => f.domain === domain) ?? {
      domain,
      mode: 'NotConfigured',
      connectorId: null,
      slaDays: DEFAULT_SLA[domain],
      owner: null,
    };
  const updateFeed = (domain: DataDomain, patch: Partial<DomainFeed>) => {
    if (!affiliate) return;
    const feed: DomainFeed = { ...feedFor(domain), ...patch };
    const feeds = [...affiliate.feeds.filter((f) => f.domain !== domain), feed];
    save.mutate(
      { ...affiliate, feeds },
      { onSuccess: () => { setSavedDomain(domain); window.setTimeout(() => setSavedDomain((d) => (d === domain ? null : d)), 1500); } },
    );
  };

  // ── Thresholds ──────────────────────────────────────────────────────
  const minima = useMemo(
    () => (affiliate ? (REGULATORY_MINIMA[affiliate.regulator] ?? { lcrPercent: 100, nsfrPercent: 100 }) : {}),
    [affiliate],
  );
  const [thresholdDraft, setThresholdDraft] = useState<Record<string, InternalThreshold>>({});
  useEffect(() => {
    if (!affiliate) return;
    const next: Record<string, InternalThreshold> = {};
    for (const key of Object.keys(minima)) {
      next[key] = affiliate.internalThresholds[key] ?? { amberPercent: Math.round(minima[key]! * 1.1), redPercent: minima[key]! };
    }
    setThresholdDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydration on affiliate switch
  }, [affiliate?.code, affiliate?.regulator]);
  const thresholdErrors = useMemo(() => {
    const errors: string[] = [];
    for (const key of Object.keys(minima)) {
      const t = thresholdDraft[key];
      if (!t) continue;
      const min = minima[key]!;
      if (t.redPercent < min) errors.push(`${METRIC_LABEL[key] ?? key}: internal red cannot go below the regulatory minimum (${min}%).`);
      if (t.amberPercent < t.redPercent) errors.push(`${METRIC_LABEL[key] ?? key}: internal amber must be at or above internal red.`);
    }
    return errors;
  }, [thresholdDraft, minima]);
  const [thresholdsSaved, setThresholdsSaved] = useState(false);

  // ── Rule status per kind - one call per kind (RULE_LINKS is a fixed constant, not dynamic,
  // so this satisfies the rules of hooks without calling a hook inside a callback). ─────────
  const ruleQueriesByKind: Partial<Record<RuleKind, ReturnType<typeof useRules>>> = {
    TimeBucket: useRules('TimeBucket'),
    ProductCharacteristic: useRules('ProductCharacteristic'),
    BehaviourPattern: useRules('BehaviourPattern'),
    PaymentPattern: useRules('PaymentPattern'),
    Prepayment: useRules('Prepayment'),
    DiscountMethod: useRules('DiscountMethod'),
    ForecastScenario: useRules('ForecastScenario'),
    NewBusiness: useRules('NewBusiness'),
    TransactionStrategy: useRules('TransactionStrategy'),
    FtpRule: useRules('FtpRule'),
    AdjustmentRule: useRules('AdjustmentRule'),
    Filter: useRules('Filter'),
    CustomMetric: useRules('CustomMetric'),
    ValidationRule: useRules('ValidationRule'),
  };

  // ── Export ──────────────────────────────────────────────────────
  const { data: exportablePositions = [] } = usePositions(affiliate?.code);

  // Every rule/user/notification/audit component mounted inline below reads its affiliate from the
  // global scope switcher, not a prop - the same reason the links this replaced called
  // `setAffiliateCode` before navigating away. Keeping that in sync here means the top bar's
  // "Working on" now follows whichever affiliate's Settings page is open, without a page change to
  // mask it - see the plan note on this.
  useEffect(() => {
    if (affiliate) setAffiliateCode(affiliate.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync only when the affiliate identity (its code) actually changes
  }, [affiliate?.code, setAffiliateCode]);

  if (!affiliate || !profileDraft) {
    return <ModuleHeader title="Settings" description="Affiliate not found." asOfDate={null} />;
  }
  if (isRestrictedToOwnAffiliate(user, hasPermission) && affiliate.code !== user?.affiliateCode) {
    return (
      <>
        <ModuleHeader title="Settings" description="Access restricted." asOfDate={null} />
        <div role="alert" className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">Access restricted</p>
          <p className="mt-1 text-[12px] text-gray-500">You can only manage your own affiliate.</p>
        </div>
      </>
    );
  }

  const isGroup = affiliate.code === 'GROUP';
  const NAV = buildNav(isGroup);

  return (
    <>
      <ModuleHeader
        title={
          <>
            {`Settings - ${affiliate.name}`}{' '}
            {affiliate.status !== 'Live' && (
              <StatusBadge status={affiliate.status} tone="warning" />
            )}
          </>
        }
        description="Everything about this affiliate, in one place."
        asOfDate={null}
        scope={affiliate.code}
        actions={
          <>
            {affiliate.status === 'Testing' && (
              <Link
                href="/controls"
                className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
              >
                {pendingActivation ? 'Pending approval - view in Approvals' : 'Raise activation in Approvals →'}
              </Link>
            )}
            <Link
              href="/execution"
              onClick={() => setAffiliateCode(affiliate.code)}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
            >
              Run ALM →
            </Link>
          </>
        }
      />

      {affiliate.status !== 'Live' && (
        <div role="status" className="mb-6 rounded-lg bg-warning-bg px-4 py-3 text-[12px] leading-relaxed text-warning">
          <span className="font-bold">Not consolidating.</span> Only Live affiliates contribute to Group figures. A
          half-configured affiliate joining the Group balance sheet silently is exactly what this gate prevents.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-5 self-start lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{g.group}</p>
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSection(item.key)}
                    className={`block w-full rounded-lg px-3 py-1.5 text-left text-[12px] font-medium ${
                      section === item.key ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-6">
          {section === 'overview' && (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <SettingsCard title="Profile">
                  <dl className="space-y-3 text-[12px]">
                    <OverviewRow label="Code" value={affiliate.code} mono />
                    <OverviewRow label="Legal entity" value={affiliate.legalEntityCode} mono />
                    <OverviewRow label="Region" value={affiliate.region} />
                    <OverviewRow label="Regulator" value={affiliate.regulator} />
                    <OverviewRow label="Fiscal year end" value={affiliate.fiscalYearEnd} mono />
                    <OverviewRow label="Holiday calendar" value={affiliate.holidayCalendarId ?? 'Not set'} mono />
                    <OverviewRow label="Created" value={formatDate(affiliate.createdAt.slice(0, 10))} />
                    <OverviewRow
                      label="Rules"
                      value={affiliate.inheritGroupRules ? 'Inherits Group default' : 'Affiliate-specific'}
                    />
                  </dl>
                </SettingsCard>

                <SettingsCard title="Currencies">
                  <dl className="space-y-3 text-[12px]">
                    <OverviewRow label="Functional" value={affiliate.functionalCurrency} mono />
                    <OverviewRow label="Reporting" value={affiliate.reportingCurrency} mono />
                    <OverviewRow label="Other active" value={affiliate.activeCurrencies.join(' · ') || 'None'} mono />
                  </dl>
                  <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-500">
                    The functional currency cannot be changed once set. Balances consolidate through the reporting
                    currency on the way to the Group functional currency.
                  </p>
                </SettingsCard>

                <SettingsCard title="Balance sheet">
                  {overviewPositions.length === 0 ? (
                    <p className="text-[12px] text-gray-500">No positions loaded yet.</p>
                  ) : (
                    <dl className="space-y-3 text-[12px]">
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Assets</dt>
                        <dd>
                          <Amount value={overviewTotals('Asset')} currency={affiliate.functionalCurrency} />
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Liabilities</dt>
                        <dd>
                          <Amount value={overviewTotals('Liability')} currency={affiliate.functionalCurrency} />
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Capital</dt>
                        <dd>
                          <Amount value={overviewTotals('Capital')} currency={affiliate.functionalCurrency} />
                        </dd>
                      </div>
                      <div className="flex justify-between border-t border-gray-100 pt-2">
                        <dt className="font-bold text-navy-900">A − (L + C)</dt>
                        <dd>
                          <Amount
                            value={overviewTotals('Asset') - overviewTotals('Liability') - overviewTotals('Capital')}
                            currency={affiliate.functionalCurrency}
                            colorBySign
                          />
                        </dd>
                      </div>
                    </dl>
                  )}
                </SettingsCard>
              </div>

              <SettingsCard title="Feeds by domain" description="At-a-glance freshness - edit mode and connector assignment under Data Sources.">
                {affiliate.feeds.length === 0 ? (
                  <p className="text-[12px] text-gray-500">No feeds configured yet.</p>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                        <th className="py-2 px-3 font-bold">Domain</th>
                        <th className="py-2 px-3 font-bold">Fed by</th>
                        <th className="py-2 px-3 font-bold">Owner</th>
                        <th className="py-2 px-3 text-right font-bold">SLA</th>
                        <th className="py-2 px-3 text-right font-bold">Age</th>
                        <th className="py-2 px-3 font-bold">Freshness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {freshness.map((f) => {
                        const feed = affiliate.feeds.find((x) => x.domain === f.domain)!;
                        const connectorName = connectors.find((c) => c.id === feed.connectorId)?.name;
                        return (
                          <tr key={f.domain} className="border-b border-gray-100">
                            <td className="py-2 px-3 font-medium text-navy-900">{DOMAIN_LABEL[f.domain] ?? f.domain}</td>
                            <td className="py-2 px-3 text-gray-600">
                              {feed.mode === 'File' ? (
                                <span className="text-warning">File substitution</span>
                              ) : feed.mode === 'Connector' ? (
                                <span className="font-mono text-[11px]">{connectorName ?? feed.connectorId}</span>
                              ) : (
                                <span className="text-danger">Not configured</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-gray-500">{feed.owner ?? '-'}</td>
                            <td className="py-2 px-3 text-right font-mono text-gray-500">{f.slaDays}d</td>
                            <td className="py-2 px-3 text-right font-mono text-gray-500">
                              {f.ageDays === null ? '-' : `${f.ageDays}d`}
                            </td>
                            <td className="py-2 px-3">
                              <StatusBadge status={f.status} tone={FRESHNESS_TONE[f.status]} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </SettingsCard>
            </>
          )}

          {section === 'profile' && (
            <SettingsCard title="Profile" description="Basic information and contact details for this affiliate.">
              <Field label="Name">
                <input
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[12px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                  value={profileDraft.name}
                  disabled={!canManage}
                  onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })}
                />
              </Field>
              <Field label="Country">
                <input
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[12px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                  value={profileDraft.country}
                  disabled={!canManage}
                  onChange={(e) => setProfileDraft({ ...profileDraft, country: e.target.value })}
                />
              </Field>
              <Field label="Effective date" hint="When onboarding is/was targeted to take effect.">
                <input
                  type="date"
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[12px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                  value={profileDraft.effectiveDate}
                  disabled={!canManage}
                  onChange={(e) => setProfileDraft({ ...profileDraft, effectiveDate: e.target.value })}
                />
              </Field>
              <Field label="Reporting timezone" hint="IANA zone, e.g. Africa/Lagos.">
                <input
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[12px] font-mono focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                  placeholder="Africa/Lagos"
                  value={profileDraft.reportingTimezone}
                  disabled={!canManage}
                  onChange={(e) => setProfileDraft({ ...profileDraft, reportingTimezone: e.target.value })}
                />
              </Field>
              {canManage && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      save.mutate(
                        { ...affiliate, name: profileDraft.name, country: profileDraft.country, effectiveDate: profileDraft.effectiveDate || undefined, reportingTimezone: profileDraft.reportingTimezone || undefined },
                        { onSuccess: () => { setProfileSaved(true); window.setTimeout(() => setProfileSaved(false), 1500); } },
                      )
                    }
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
                  >
                    Save profile
                  </button>
                  {profileSaved && <StatusBadge status="Saved" tone="success" />}
                </div>
              )}

              {canManage && NEXT_STATUS[affiliate.status].length > 0 && (
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Status</p>
                  <div className="flex gap-2">
                    {NEXT_STATUS[affiliate.status].map((next) => (
                      <button
                        key={next}
                        type="button"
                        onClick={() => { if (window.confirm(`Move ${affiliate.name} to ${next}?`)) save.mutate({ ...affiliate, status: next }); }}
                        className={next === 'Suspended'
                          ? 'rounded-lg bg-danger px-4 py-2 text-[12px] font-bold text-white hover:opacity-90'
                          : 'rounded-lg bg-success px-4 py-2 text-[12px] font-bold text-white hover:opacity-90'}
                      >
                        {next === 'Suspended' ? 'Deactivate (move to Suspended)' : `Move to ${next}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {canManage && (
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Danger zone</p>
                  <button
                    type="button"
                    onClick={() => {
                      const warning =
                        affiliate.status === 'Live'
                          ? `Delete ${affiliate.name}? It is Live - this removes the affiliate record but does NOT remove its committed positions, batches or dimension mappings, which would be left orphaned. This cannot be undone.`
                          : `Delete ${affiliate.name}? This removes the affiliate record but does NOT remove any batches, positions or dimension mappings already created for it, which would be left orphaned. This cannot be undone.`;
                      if (window.confirm(warning)) deleteAffiliate.mutate(affiliate, { onSuccess: () => navigate('/affiliates') });
                    }}
                    className="rounded-lg border border-danger px-4 py-2 text-[12px] font-bold text-danger hover:bg-danger hover:text-white"
                  >
                    Delete affiliate
                  </button>
                </div>
              )}
            </SettingsCard>
          )}

          {section === 'thresholds' && (
            <SettingsCard title="Thresholds" description="Regulatory minimum is fixed; internal amber/red are this affiliate's own appetite.">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="py-2 px-3 font-bold">Metric</th>
                    <th className="py-2 px-3 text-right font-bold">Regulatory minimum</th>
                    <th className="py-2 px-3 text-right font-bold">Internal amber</th>
                    <th className="py-2 px-3 text-right font-bold">Internal red</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(minima).map(([metric, value]) => {
                    const t = thresholdDraft[metric];
                    return (
                      <tr key={metric} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-medium text-navy-900">{METRIC_LABEL[metric] ?? metric}</td>
                        <td className="py-2 px-3 text-right">
                          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 font-mono text-gray-500" title="Locked - set by the regulator">
                            {value}% <ShieldCheckIcon className="h-3 w-3 shrink-0 text-gray-400" />
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            value={t?.amberPercent ?? ''}
                            disabled={!canManage}
                            onChange={(e) => setThresholdDraft((prev) => ({ ...prev, [metric]: { ...prev[metric]!, amberPercent: Number(e.target.value) } }))}
                            className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                          />%
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            value={t?.redPercent ?? ''}
                            disabled={!canManage}
                            onChange={(e) => setThresholdDraft((prev) => ({ ...prev, [metric]: { ...prev[metric]!, redPercent: Number(e.target.value) } }))}
                            className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                          />%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {thresholdErrors.length > 0 && (
                <ul className="mt-3 space-y-1 rounded border border-danger/30 bg-danger/5 p-3 text-[11px] text-danger">
                  {thresholdErrors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
              {canManage && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={thresholdErrors.length > 0}
                    onClick={() => save.mutate({ ...affiliate, internalThresholds: thresholdDraft, limitsConfirmed: true }, { onSuccess: () => { setThresholdsSaved(true); window.setTimeout(() => setThresholdsSaved(false), 1500); } })}
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  >
                    Save thresholds
                  </button>
                  {thresholdsSaved && <StatusBadge status="Saved" tone="success" />}
                </div>
              )}
            </SettingsCard>
          )}

          {section === 'inheritance' && (
            <SettingsCard title="Rule Inheritance" description="Whether this affiliate uses Group default rules, or its own forked versions.">
              <div className="flex items-start gap-3 text-[12px]">
                <input
                  id="inherit-group-rules"
                  type="checkbox"
                  checked={affiliate.inheritGroupRules}
                  disabled={!canManage}
                  onChange={(e) => save.mutate({ ...affiliate, inheritGroupRules: e.target.checked })}
                  className="mt-0.5 accent-gold-500"
                />
                <label htmlFor="inherit-group-rules" className="cursor-pointer">
                  <span className="block font-medium text-navy-900">
                    {affiliate.inheritGroupRules ? 'Inherits Group default rules' : 'Uses affiliate-specific rules'}
                  </span>
                  <span className="block text-[11px] text-gray-500">
                    Uncheck to fork behavioural, FTP and stress-scenario rules for this affiliate alone.
                  </span>
                </label>
              </div>
            </SettingsCard>
          )}

          {section === 'data-sources' && !isGroup && (
            <SettingsCard
              title="Data Sources"
              description="Wire each data domain for this affiliate, then manage the connections below - adding or reconfiguring a connection here makes it available to every affiliate's feed assignment."
            >
              <div className="space-y-2">
                {DOMAINS.map((domain) => {
                  const feed = feedFor(domain);
                  const usable = availableFor(connectors, domain);
                  const connector = feed.connectorId ? connectors.find((c) => c.id === feed.connectorId) : undefined;
                  return (
                    <div key={domain} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[12px] font-bold text-navy-900">{DOMAIN_LABEL[domain]}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label={`Feed mode for ${DOMAIN_LABEL[domain]}`}
                            value={feed.mode}
                            disabled={!canManage}
                            onChange={(e) => { const mode = e.target.value as FeedMode; updateFeed(domain, { mode, connectorId: mode === 'Connector' ? (usable[0]?.id ?? null) : null }); }}
                            className="rounded border border-gray-200 px-2 py-1.5 text-[11px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                          >
                            <option value="NotConfigured">Not configured</option>
                            <option value="Connector" disabled={usable.length === 0}>Connector{usable.length === 0 ? ' - none available' : ''}</option>
                            <option value="File">File upload</option>
                          </select>
                          {feed.mode !== 'NotConfigured' && <FeedStatusBadge feed={feed} connectors={connectors} />}
                          {savedDomain === domain && <StatusBadge status="Saved" tone="success" />}
                        </div>
                      </div>
                      {feed.mode === 'Connector' && (
                        <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-gray-50 pt-2">
                          {/* The assigned connector is always listed, even when Blocked, so the
                              dropdown can never silently show a different connector than the one
                              actually stored on the feed. */}
                          <select
                            aria-label={`Connector for ${DOMAIN_LABEL[domain]}`}
                            value={feed.connectorId ?? ''}
                            disabled={!canManage}
                            onChange={(e) => updateFeed(domain, { connectorId: e.target.value || null })}
                            className="rounded border border-gray-200 px-2 py-1.5 text-[11px] focus:border-navy-700 focus:outline-none"
                          >
                            {feed.connectorId && !usable.some((c) => c.id === feed.connectorId) && (
                              <option value={feed.connectorId}>
                                {connector ? `${connector.name} (Blocked)` : feed.connectorId}
                              </option>
                            )}
                            {usable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <label className="flex items-center gap-1 text-[11px] text-gray-500">
                            SLA
                            <input
                              type="number"
                              min={1}
                              aria-label={`SLA days for ${DOMAIN_LABEL[domain]}`}
                              value={feed.slaDays}
                              disabled={!canManage}
                              onChange={(e) => updateFeed(domain, { slaDays: Math.max(1, Number(e.target.value) || 1) })}
                              className="w-14 rounded border border-gray-200 px-1.5 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                            />
                            d
                          </label>
                          <input
                            type="text"
                            aria-label={`Owner for ${DOMAIN_LABEL[domain]}`}
                            placeholder="Owner (e.g. Treasury)"
                            value={feed.owner ?? ''}
                            disabled={!canManage}
                            onChange={(e) => updateFeed(domain, { owner: e.target.value || null })}
                            className="w-36 rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                          />
                          {connector && (
                            <span className="font-mono text-[10px] text-gray-400">
                              {connector.protocol} · {connector.endpoint || 'no endpoint set'} · {connector.cadenceDays}d cadence
                            </span>
                          )}
                        </div>
                      )}
                      {(feed.mode === 'File' || feed.mode === 'NotConfigured') && (
                        <p className="mt-2 border-t border-gray-50 pt-2 text-[10px] text-gray-400">
                          {feed.mode === 'File' ? 'Feed delivered as files. ' : 'No feed configured yet. '}
                          <Link
                            href={DOMAIN_UPLOAD[domain].path}
                            className="font-bold text-navy-700 hover:underline"
                          >
                            {DOMAIN_UPLOAD[domain].label} →
                          </Link>
                        </p>
                      )}
                    </div>
                  );
                })}

                <div className="border-t border-gray-100 pt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Connections</p>
                  <p className="mb-3 text-[11px] text-gray-500">
                    The connections available to this affiliate's feed assignment above. Use View details on a
                    connection to see its configuration without leaving the page.
                  </p>
                  <Suspense fallback={<SettingsScreenFallback />}>
                    <ConnectorsLazy embedded />
                  </Suspense>
                </div>
              </div>
            </SettingsCard>
          )}

          {section === 'data-sources' && isGroup && (
            <SettingsCard
              title="Connection Health - all affiliates"
              description="Every affiliate's feed wiring at a glance: how each domain arrives, whether its connection is live, and how fresh the data is. Click an affiliate to configure its feeds; connections are added and reconfigured on each affiliate's own Data Sources page."
            >
              <div className="mb-3">
                <label htmlFor="health-affiliate" className="sr-only">Filter by affiliate</label>
                <select
                  id="health-affiliate"
                  value={healthFilter}
                  onChange={(e) => setHealthFilter(e.target.value)}
                  className="rounded border border-gray-200 px-2 py-1.5 text-[11px] focus:border-navy-700 focus:outline-none"
                >
                  <option value="ALL">All affiliates</option>
                  {feedAffiliates.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                </select>
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="py-2 px-3 font-bold">Affiliate</th>
                    <th className="py-2 px-3 font-bold">Domain</th>
                    <th className="py-2 px-3 font-bold">Fed by</th>
                    <th className="py-2 px-3 font-bold">Connection</th>
                    <th className="py-2 px-3 font-bold">Owner</th>
                    <th className="py-2 px-3 text-right font-bold">SLA</th>
                    <th className="py-2 px-3 text-right font-bold">Age</th>
                    <th className="py-2 px-3 font-bold">Freshness</th>
                  </tr>
                </thead>
                <tbody>
                  {feedAffiliates
                    .filter((a) => healthFilter === 'ALL' || a.code === healthFilter)
                    .map((a) =>
                    checkAllDomains(a, batches, TODAY).map((f) => {
                      const feed = a.feeds.find((x) => x.domain === f.domain);
                      const connector = feed?.connectorId ? connectors.find((c) => c.id === feed.connectorId) : undefined;
                      return (
                        <tr key={`${a.code}-${f.domain}`} className="border-b border-gray-100">
                          <td className="py-2 px-3 font-medium">
                            <button
                              type="button"
                              onClick={() => navigate(`/affiliates/${a.code}/settings?section=data-sources`)}
                              className="text-navy-900 hover:text-navy-700 hover:underline"
                              title={`Open ${a.name} connection settings`}
                            >
                              {a.name}
                            </button>
                            <span className="ml-1 font-mono text-[10px] text-gray-400">{a.code}</span>
                          </td>
                          <td className="py-2 px-3 text-gray-600">{DOMAIN_LABEL[f.domain] ?? f.domain}</td>
                          <td className="py-2 px-3 text-gray-600">
                            {feed?.mode === 'File' ? (
                              <span className="text-warning">File substitution</span>
                            ) : feed?.mode === 'Connector' ? (
                              <span className="font-mono text-[11px]">{connector?.name ?? feed.connectorId}</span>
                            ) : (
                              <span className="text-danger">Not configured</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {connector ? (
                              <StatusBadge status={STATUS_LABEL[connector.status] ?? connector.status} tone={STATUS_TONE[connector.status] ?? 'neutral'} />
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-500">{feed?.owner ?? '-'}</td>
                          <td className="py-2 px-3 text-right font-mono text-gray-500">{f.slaDays}d</td>
                          <td className="py-2 px-3 text-right font-mono text-gray-500">
                            {f.ageDays === null ? '-' : `${f.ageDays}d`}
                          </td>
                          <td className="py-2 px-3">
                            <StatusBadge status={f.status} tone={FRESHNESS_TONE[f.status]} />
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
                {staleFeeds} feed(s) past their SLA and {notConfiguredFeeds} domain(s) not configured across{' '}
                {feedAffiliates.length} affiliate(s). Stale or missing feeds mean downstream figures are computed off
                old data - chase the feed owner, not the platform.
              </p>
            </SettingsCard>
          )}

          {section === 'users' && (
            <Suspense fallback={<SettingsScreenFallback />}>
              <AdminUsersLazy embedded forcedAffiliateCode={affiliate.code} />
            </Suspense>
          )}

          {isGroup && section === 'rule-coverage' && (
            <Suspense fallback={<SettingsScreenFallback />}>
              <ModelsAssumptionsLazy embedded />
            </Suspense>
          )}

          {RULE_LINKS.map((r) => {
            if (section !== `rule-${r.kind}`) return null;
            const rules = ruleQueriesByKind[r.kind]?.data ?? [];
            const own = rules.find((x) => x.affiliateCode === affiliate.code);
            if (r.kind === 'ValidationRule') {
              return (
                <Suspense key={r.kind} fallback={<SettingsScreenFallback />}>
                  <ValidationRulesLazy embedded forcedAffiliateCode={affiliate.code} />
                </Suspense>
              );
            }
            const Component = RULE_COMPONENTS[r.kind];
            return (
              <div key={r.kind}>
                <div className="mb-4 flex items-center gap-2">
                  <InfoButton label="About this rule">
                    Every rule is either the Group default (applies to every affiliate that hasn&rsquo;t forked it) or
                    an affiliate-specific override. This affiliate {own ? 'has its own version' : 'currently uses the Group default'}.
                    The editor below lists every affiliate&rsquo;s rules of this kind, not just {affiliate.name}&rsquo;s -
                    look for the {affiliate.code} tag to find this affiliate&rsquo;s own.
                  </InfoButton>
                  <StatusBadge status={own ? 'Forked for this affiliate' : 'Group default'} tone={own ? 'warning' : 'neutral'} />
                </div>
                {Component && (
                  <Suspense fallback={<SettingsScreenFallback />}>
                    <Component />
                  </Suspense>
                )}
              </div>
            );
          })}

          {section === 'notifications' && (
            <Suspense fallback={<SettingsScreenFallback />}>
              <NotificationsLazy embedded forcedAffiliateCode={affiliate.code} />
            </Suspense>
          )}

          {section === 'audit' && (
            <Suspense fallback={<SettingsScreenFallback />}>
              <AdminAuditLazy embedded forcedAffiliateCode={affiliate.code} />
            </Suspense>
          )}

          {section === 'credentials' && (
            <SettingsCard title="Credentials" description="Which credential reference backs each of this affiliate's connectors.">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="py-2 px-3 font-bold">Domain</th>
                    <th className="py-2 px-3 font-bold">Connector</th>
                    <th className="py-2 px-3 font-bold">Credential reference</th>
                  </tr>
                </thead>
                <tbody>
                  {DOMAINS.filter((d) => feedFor(d).mode === 'Connector').map((d) => {
                    const feed = feedFor(d);
                    const c = connectors.find((x) => x.id === feed.connectorId);
                    return (
                      <tr key={d} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-medium text-navy-900">{DOMAIN_LABEL[d]}</td>
                        <td className="py-2 px-3">{c?.name ?? '-'}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{c?.credentialRef ?? '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {DOMAINS.every((d) => feedFor(d).mode !== 'Connector') && (
                <p className="text-[12px] text-gray-500">No connector-fed domains for this affiliate yet - see Data Sources.</p>
              )}
            </SettingsCard>
          )}

          {section === 'webhooks' && (
            <SettingsCard title="Webhooks" description="Notify an external system when this affiliate's run completes or a breach fires.">
              <p className="text-[12px] text-gray-500">
                No webhooks configured yet. This is illustrative of a future integration point - there is no live
                backend to deliver these callbacks in this environment.
              </p>
            </SettingsCard>
          )}

          {section === 'export' && (
            <SettingsCard
              title="Data & Export"
              description={`${exportablePositions.length} committed position(s) on file for ${affiliate.name}.`}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={exportablePositions.length === 0}
                  onClick={() =>
                    downloadBlob(toCsv(exportablePositions), `${affiliate.code}-positions.csv`, 'text/csv')
                  }
                  className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                >
                  Export positions (CSV)
                </button>
              </div>
              <Link
                href="/data/operations/position-book"
                onClick={() => setAffiliateCode(affiliate.code)}
                className="mt-3 inline-block text-[11px] font-bold text-navy-700 hover:underline"
              >
                Open Position Book for row-level detail →
              </Link>
            </SettingsCard>
          )}

          {isGroup && section === 'ref-yield-curves' && (
            <Suspense fallback={<SettingsScreenFallback />}>
              <YieldCurvesLazy />
            </Suspense>
          )}
          {isGroup && section === 'ref-fx-rates' && (
            <Suspense fallback={<SettingsScreenFallback />}>
              <FxRatesLazy />
            </Suspense>
          )}
          {isGroup && section === 'ref-economic-indicators' && (
            <Suspense fallback={<SettingsScreenFallback />}>
              <EconomicIndicatorsLazy />
            </Suspense>
          )}
          {isGroup && section === 'ref-holiday-calendar' && (
            <Suspense fallback={<SettingsScreenFallback />}>
              <HolidayCalendarLazy embedded />
            </Suspense>
          )}
        </div>
      </div>
    </>
  );
}
