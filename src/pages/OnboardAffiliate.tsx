import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { ShieldCheckIcon } from '@/components/icons/Icons';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { Drawer } from '@/components/ui/Drawer';
import { Affiliates } from '@/pages/Affiliates';
import { ConnectorFields } from '@/components/connectors/ConnectorFields';
import { FeedStatusBadge } from '@/components/connectors/FeedStatusBadge';
import { DOMAINS, DOMAIN_LABEL } from '@/components/connectors/connectorConstants';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import {
  useAffiliates,
  useCurrencies,
  useDeleteAffiliate,
  useDimensionMembers,
  useHolidayCalendars,
  useSaveAffiliate,
  useSaveDimensionMembers,
  useUsers,
} from '@/lib/hooks';
import { availableFor, newConnector, useConnectors, useSaveConnector, validateConnector } from '@/lib/connectorHooks';
import { approvals, newId } from '@/lib/governanceHooks';
import { useRules } from '@/lib/ruleHooks';
import { repository } from '@/store/localRepository';
import { METRIC_LABEL, REGULATORY_MINIMA } from '@/engine/limits';
import { COUNTRIES, REGIONS } from '@/lib/countries';
import type { Affiliate, Connector, DataDomain, DomainFeed, FeedMode, InternalThreshold, RuleKind } from '@/engine/types';

const STEPS = [
  { n: 1, title: 'Legal entity & profile', hint: 'Who the affiliate is, and who regulates it.' },
  { n: 2, title: 'Currencies & calendar', hint: 'Functional currency is immutable once set.' },
  { n: 3, title: 'Connectivity & data sources', hint: 'Configure or declare a feed for every domain, right here.' },
  { n: 4, title: 'Chart of accounts & organisation', hint: 'Map local GL onto the Group standard.' },
  { n: 5, title: 'Assumption inheritance', hint: 'Inherit Group defaults, or fork.' },
  { n: 6, title: 'Limits & regulatory thresholds', hint: 'Minima differ by jurisdiction; internal appetite is yours to set.' },
];

// Derived from the actual regulatory-minima table (same source BulkOnboardAffiliates.tsx uses) rather
// than a separately hand-kept list - a regulator picked here that has no minima configured would
// otherwise silently fall back to a generic {100, 100} limit at step 6 with no indication why.
const REGULATORS = Object.keys(REGULATORY_MINIMA);

interface Profile {
  code: string;
  name: string;
  country: string;
  region: string;
  regulator: string;
  legalEntityCode: string;
}

const EMPTY_PROFILE: Profile = { code: '', name: '', country: '', region: '', regulator: 'CBN', legalEntityCode: '' };

export function OnboardAffiliate() {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/affiliates/onboard/:code');
  const resumeCode = params?.code ?? null;

  const { user, hasPermission } = useAuth();
  const canOnboard = hasPermission('group.manage');

  const { data: affiliates = [], isLoading: affiliatesLoading } = useAffiliates();
  const { data: currencies = [] } = useCurrencies();
  const { data: calendars = [] } = useHolidayCalendars();
  const { data: connectors = [] } = useConnectors();
  const { data: users = [] } = useUsers();

  const [code, setCode] = useState<string | null>(resumeCode);
  const affiliate = code ? (affiliates.find((a) => a.code === code) ?? null) : null;

  // Who a feed can be assigned to here: this affiliate's own staff, plus Group staff who
  // routinely stand in as the interim owner before local users are provisioned post-onboarding.
  const feedOwners = users.filter((u) => u.affiliateCode === code || u.affiliateCode === 'GROUP');

  // Common COA is affiliate-owned - GROUP's copy is the actual Group standard, the reference every new
  // affiliate's GL mappings are built against, and gets copied into its own list on the first mapping
  // (see addCoaMapping).
  const { data: commonCoaReference = [] } = useDimensionMembers('CommonCoa', 'GROUP');
  const { data: commonCoa = [] } = useDimensionMembers('CommonCoa', code ?? '');
  const { data: glAccounts = [] } = useDimensionMembers('GlAccount', code ?? '');
  const { data: orgUnits = [] } = useDimensionMembers('OrgUnit', code ?? '');

  const save = useSaveAffiliate();
  const del = useDeleteAffiliate();
  const saveConnector = useSaveConnector();
  const saveGlAccounts = useSaveDimensionMembers('GlAccount');
  const saveOrgUnits = useSaveDimensionMembers('OrgUnit');
  const saveCommonCoa = useSaveDimensionMembers('CommonCoa');
  const raiseApproval = approvals.useSave();
  const creatingRef = useRef(false);

  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [submitted, setSubmitted] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);

  useEffect(() => {
    if (affiliate) {
      setProfile({
        code: affiliate.code, name: affiliate.name, country: affiliate.country,
        region: affiliate.region, regulator: affiliate.regulator, legalEntityCode: affiliate.legalEntityCode,
      });
    }
  }, [affiliate?.code, affiliate?.name, affiliate?.country, affiliate?.region, affiliate?.regulator, affiliate?.legalEntityCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const duplicateCode =
    !code && affiliates.some((a) => a.code.toUpperCase() === profile.code.trim().toUpperCase());
  const profileValid = profile.code.trim().length >= 2 && profile.name.trim().length > 0 && profile.country.trim().length > 0;

  // Creates the persisted record the moment step 1's fields are valid, so onboarding is resumable from here on.
  useEffect(() => {
    if (code || !profileValid || duplicateCode || creatingRef.current) return;
    creatingRef.current = true;
    const newAffiliate: Affiliate = {
      code: profile.code.trim().toUpperCase(),
      name: profile.name.trim(),
      country: profile.country.trim(),
      region: profile.region,
      regulator: profile.regulator,
      functionalCurrency: '',
      reportingCurrency: 'USD',
      activeCurrencies: [],
      status: 'Onboarding',
      fiscalYearEnd: '12-31',
      holidayCalendarId: null,
      legalEntityCode: profile.legalEntityCode || `LE-${profile.code.trim().toUpperCase()}`,
      feeds: DOMAINS.map((domain) => ({ domain, mode: 'NotConfigured' as FeedMode, connectorId: null, slaDays: 30, owner: null })),
      inheritGroupRules: true,
      internalThresholds: {},
      limitsConfirmed: false,
      createdAt: new Date().toISOString(),
    };
    save.mutate(newAffiliate, {
      onSuccess: () => setCode(newAffiliate.code),
      onSettled: () => { creatingRef.current = false; },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, profileValid, duplicateCode, profile.code, profile.name, profile.country]);

  const persistProfile = () => {
    if (!affiliate) return;
    save.mutate({
      ...affiliate,
      name: profile.name.trim() || affiliate.name,
      country: profile.country.trim() || affiliate.country,
      region: profile.region,
      regulator: profile.regulator,
      legalEntityCode: profile.legalEntityCode || affiliate.legalEntityCode,
    });
  };

  // ── Step 2 - currencies & calendar ───────────────────────────────────
  const setCurrencies = (patch: Partial<Pick<Affiliate, 'functionalCurrency' | 'reportingCurrency' | 'activeCurrencies' | 'fiscalYearEnd' | 'holidayCalendarId'>>) => {
    if (!affiliate) return;
    save.mutate({ ...affiliate, ...patch });
  };

  // ── Step 3 - connectivity ────────────────────────────────────────────
  const [addingConnectorFor, setAddingConnectorFor] = useState<DataDomain | null>(null);
  const [newConnectorDraft, setNewConnectorDraft] = useState<Connector | null>(null);

  const updateFeed = (domain: DataDomain, patch: Partial<DomainFeed>) => {
    if (!affiliate) return;
    const feed: DomainFeed = { ...(affiliate.feeds.find((f) => f.domain === domain) ?? { domain, mode: 'NotConfigured' as FeedMode, connectorId: null, slaDays: 30, owner: null }), ...patch };
    const feeds = [...affiliate.feeds.filter((f) => f.domain !== domain), feed];
    save.mutate({ ...affiliate, feeds });
  };

  const startNewConnector = (domain: DataDomain) => {
    const draft = newConnector();
    draft.domains = [domain];
    setNewConnectorDraft(draft);
    setAddingConnectorFor(domain);
  };

  const saveNewConnector = async () => {
    if (!newConnectorDraft || !addingConnectorFor) return;
    await saveConnector.mutateAsync(newConnectorDraft);
    updateFeed(addingConnectorFor, { mode: 'Connector', connectorId: newConnectorDraft.id });
    setAddingConnectorFor(null);
    setNewConnectorDraft(null);
  };

  const complete3 = !!affiliate && affiliate.feeds.every((f) => f.mode === 'File' || (f.mode === 'Connector' && !!f.connectorId));

  // ── Step 4 - COA & organisation ──────────────────────────────────────
  const commonCoaLeaves = useMemo(() => commonCoaReference.filter((m) => m.isLeaf), [commonCoaReference]);
  const unmappedCoa = useMemo(
    () => commonCoaLeaves.filter((leaf) => !glAccounts.some((m) => m.attributes?.commonCoa === leaf.code)),
    [commonCoaLeaves, glAccounts],
  );
  const [newLocalCode, setNewLocalCode] = useState<Record<string, string>>({});

  const addCoaMapping = async (leafCode: string) => {
    if (!affiliate) return;
    const localCode = (newLocalCode[leafCode] ?? '').trim();
    if (!localCode) return;

    // This affiliate's own Common COA copy - created on the first mapping, since there's no Group-wide list to
    // point its GL accounts at instead.
    if (commonCoa.length === 0 && commonCoaReference.length > 0) {
      await saveCommonCoa.mutateAsync(
        commonCoaReference.map((m) => ({ ...m, id: `CommonCoa:${affiliate.code}:${m.code}`, affiliateCode: affiliate.code })),
      );
    }

    const rootCode = `GL-${affiliate.code}`;
    const rootExists = glAccounts.some((m) => m.code === rootCode);
    await saveGlAccounts.mutateAsync([
      ...(rootExists ? [] : [{ id: `GlAccount:${affiliate.code}:${rootCode}`, dimension: 'GlAccount' as const, affiliateCode: affiliate.code, code: rootCode, name: `${affiliate.name} - Local Chart`, parentCode: null, isLeaf: false }]),
      {
        id: `GlAccount:${affiliate.code}:${localCode}`,
        dimension: 'GlAccount' as const,
        affiliateCode: affiliate.code,
        code: localCode,
        name: localCode,
        parentCode: rootCode,
        isLeaf: true,
        attributes: { commonCoa: leafCode },
      },
    ]);
    setNewLocalCode((prev) => ({ ...prev, [leafCode]: '' }));
  };

  const orgRootCode = affiliate ? `OU-${affiliate.code}` : null;
  const orgRootExists = orgUnits.some((m) => m.code === orgRootCode);
  const SEGMENTS = [
    { suffix: 'RET', name: 'Retail Banking' },
    { suffix: 'COR', name: 'Corporate & Investment Banking' },
    { suffix: 'TSY', name: 'Treasury' },
    { suffix: 'WLT', name: 'Wealth Management' },
  ];

  const createOrgTemplate = () => {
    if (!affiliate || !orgRootCode) return;
    saveOrgUnits.mutate([
      { id: `OrgUnit:${affiliate.code}:${orgRootCode}`, dimension: 'OrgUnit', affiliateCode: affiliate.code, code: orgRootCode, name: affiliate.name, parentCode: 'OU-GROUP', isLeaf: false },
      ...SEGMENTS.map((s) => ({
        id: `OrgUnit:${affiliate.code}:${orgRootCode}-${s.suffix}`,
        dimension: 'OrgUnit' as const,
        affiliateCode: affiliate.code,
        code: `${orgRootCode}-${s.suffix}`,
        name: `${affiliate.name} - ${s.name}`,
        parentCode: orgRootCode,
        isLeaf: true,
      })),
    ]);
  };

  const complete4 = unmappedCoa.length === 0 && orgRootExists;

  // ── Step 5 - assumptions ─────────────────────────────────────────────
  const setInherit = (inheritGroupRules: boolean) => {
    if (!affiliate) return;
    save.mutate({ ...affiliate, inheritGroupRules });
  };
  // Every rule kind the platform has, not just the four most commonly forked - a fresh affiliate
  // should be able to start from a real Group (or peer affiliate) baseline for any of them, not just
  // the ones someone happened to wire up a clone button for first.
  const CLONE_KINDS: RuleKind[] = [
    'TimeBucket', 'ProductCharacteristic', 'BehaviourPattern', 'PaymentPattern', 'Prepayment',
    'DiscountMethod', 'ForecastScenario', 'NewBusiness', 'TransactionStrategy', 'FtpRule',
    'AdjustmentRule', 'Filter', 'CustomMetric', 'ValidationRule', 'FieldMapping', 'CodeMapping',
  ];
  const [cloneSource, setCloneSource] = useState('');
  const [cloning, setCloning] = useState(false);
  const [cloned, setCloned] = useState(false);
  // Fixed-length array of hook calls, in the same order as CLONE_KINDS - stable hook order despite
  // looking like a loop (same pattern ModelsAssumptions.tsx uses for its own rule registry).
  const cloneQueries = [
    useRules(CLONE_KINDS[0]!), useRules(CLONE_KINDS[1]!), useRules(CLONE_KINDS[2]!), useRules(CLONE_KINDS[3]!),
    useRules(CLONE_KINDS[4]!), useRules(CLONE_KINDS[5]!), useRules(CLONE_KINDS[6]!), useRules(CLONE_KINDS[7]!),
    useRules(CLONE_KINDS[8]!), useRules(CLONE_KINDS[9]!), useRules(CLONE_KINDS[10]!), useRules(CLONE_KINDS[11]!),
    useRules(CLONE_KINDS[12]!), useRules(CLONE_KINDS[13]!), useRules(CLONE_KINDS[14]!), useRules(CLONE_KINDS[15]!),
  ];
  const rulesByKind = new Map(CLONE_KINDS.map((kind, i) => [kind, cloneQueries[i]!.data ?? []]));
  // Forking flips the flag immediately, but a fresh fork has nothing in it until something is
  // edited - this actually seeds it from a chosen starting point (Group, or a peer affiliate
  // further along) rather than leaving a blank folder the affiliate has to build from scratch.
  const cloneStarterRules = async (sourceCode: string) => {
    if (!affiliate) return;
    setCloning(true);
    try {
      for (const kind of CLONE_KINDS) {
        const source = rulesByKind.get(kind)!.find((r) => r.affiliateCode === (sourceCode || null));
        if (!source) continue;
        await repository.upsertRule({ ...source, id: `${kind}-${affiliate.code}-${Date.now()}`, affiliateCode: affiliate.code, version: 1, createdBy: user?.name ?? 'unknown', createdAt: new Date().toISOString(), updatedBy: null, updatedAt: null });
      }
      setCloned(true);
      window.setTimeout(() => setCloned(false), 2000);
    } finally {
      setCloning(false);
    }
  };

  // ── Step 6 - limits & thresholds ─────────────────────────────────────
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const confirmThresholds = () => {
    if (!affiliate || thresholdErrors.length > 0) return;
    save.mutate({ ...affiliate, internalThresholds: thresholdDraft, limitsConfirmed: true });
  };

  const complete6 = !!affiliate?.limitsConfirmed;

  // Inheriting is instantly valid - there's nothing more to configure. Forking flips the flag
  // immediately too, but leaves an empty rule folder until something is actually cloned or created for
  // this affiliate - checked against real saved rules, not the transient `cloned` banner state, so it
  // stays correct even after navigating away and back.
  const hasOwnRules = !!affiliate && CLONE_KINDS.some((kind) => rulesByKind.get(kind)!.some((r) => r.affiliateCode === affiliate.code));
  const complete5 = !!affiliate && (affiliate.inheritGroupRules || hasOwnRules);

  const complete: Record<number, boolean> = {
    1: !!affiliate,
    2: !!affiliate && affiliate.functionalCurrency !== '' && affiliate.reportingCurrency !== '',
    3: complete3,
    4: complete4,
    5: complete5,
    6: complete6,
  };
  const allComplete = STEPS.every((s) => complete[s.n]);

  const handleSubmit = () => {
    if (!affiliate || !allComplete || !user) return;
    save.mutate({ ...affiliate, status: 'Testing' });
    raiseApproval.mutate({
      id: newId('APR'),
      module: 'Affiliates',
      entityType: 'Affiliate',
      entityId: affiliate.code,
      entityLabel: affiliate.name,
      action: 'Activate',
      summary: `Onboarding complete for ${affiliate.name} - ready to move Testing → Live and consolidate into Group.`,
      affiliateCode: affiliate.code,
      status: 'Pending',
      requestedBy: user.name,
      requestedAt: new Date().toISOString(),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    });
    setSubmitted(true);
  };

  const handleCancelOnboarding = () => {
    if (!affiliate) return;
    if (!cancelArmed) {
      setCancelArmed(true);
      return;
    }
    del.mutate(affiliate, { onSuccess: () => navigate('/affiliates') });
  };

  if (resumeCode && affiliatesLoading) {
    return (
      <>
        <Affiliates />
        <Drawer title="Onboard Affiliate" description="Loading…" onClose={() => navigate('/affiliates')} wide>
          <p className="text-[12px] text-gray-500">Loading…</p>
        </Drawer>
      </>
    );
  }

  if (resumeCode && !affiliatesLoading && !affiliate) {
    return (
      <>
        <Affiliates />
        <Drawer title="Onboard Affiliate" description="Not found." onClose={() => navigate('/affiliates')} wide>
          <p className="rounded-lg bg-gray-50 p-6 text-center text-[12px] text-gray-500">
            No onboarding record with code {resumeCode}. It may already have been completed or cancelled.
          </p>
        </Drawer>
      </>
    );
  }

  return (
    <>
    <Affiliates />
    <Drawer
      title={affiliate ? `Onboard ${affiliate.name}` : 'New Affiliate Onboarding'}
      description={submitted ? undefined : `Step ${step} of ${STEPS.length} · ${STEPS[step - 1]!.title}`}
      onClose={() => navigate('/affiliates')}
      wide
      footer={
        submitted ? undefined : (
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900 disabled:opacity-30">
              Previous
            </button>
            <div className="flex items-center gap-3">
              {!complete[step] && <StatusBadge status="Step incomplete" tone="warning" />}
              {step < STEPS.length ? (
                <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))} disabled={step === 1 && !affiliate} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40">
                  Next Step
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canOnboard || !allComplete}
                  title={!allComplete ? 'Complete every step first' : undefined}
                  className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                >
                  Submit for approval
                </button>
              )}
            </div>
          </div>
        )
      }
    >
      {affiliate && affiliate.status === 'Onboarding' && !submitted && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={handleCancelOnboarding}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-[11px] font-bold',
              cancelArmed ? 'border-danger bg-danger text-white' : 'border-gray-200 text-danger hover:border-danger',
            )}
          >
            {cancelArmed ? 'Click again to confirm - this cannot be undone' : 'Cancel onboarding'}
          </button>
        </div>
      )}

      {submitted ? (
        <section className="rounded-2xl border border-success/20 bg-success-bg p-8 text-center">
          <h2 className="text-[16px] font-bold text-navy-900">✓ {affiliate?.name} submitted for approval</h2>
          <p className="mx-auto mt-2 max-w-lg text-[12px] leading-relaxed text-gray-600">
            Status: <span className="font-bold">Testing / Pending Approval</span>. It will not appear in
            Group-consolidated figures until an authorised approver moves it to Live in Approvals - that gate is
            deliberate, so a half-configured affiliate cannot quietly join the Group balance sheet.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button type="button" onClick={() => navigate('/affiliates')} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700">
              Back to affiliates
            </button>
            <button type="button" onClick={() => navigate('/controls')} className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700">
              View in Approvals
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
                    disabled={s.n > 1 && !affiliate}
                    aria-current={step === s.n ? 'step' : undefined}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors disabled:opacity-40',
                      step === s.n ? 'border-navy-700 bg-navy-50' : 'border-gray-200 bg-white hover:border-navy-700',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', complete[s.n] ? 'bg-success text-white' : 'bg-gray-200 text-gray-500')}>
                        {complete[s.n] ? '✓' : s.n}
                      </span>
                      <span className="text-[12px] font-bold text-navy-900">{s.title}</span>
                    </span>
                    <span className="mt-1 block pl-7 text-[11px] leading-relaxed text-gray-500">{s.hint}</span>
                  </button>
                </li>
              ))}
            </ol>
            {code && (
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-[10px] leading-relaxed text-gray-400">
                Saved automatically as you go. Safe to leave and resume from Affiliates → {affiliate?.name ?? code}.
              </p>
            )}
          </nav>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-3">
            {step === 1 && (
              <Step title="Legal entity & profile">
                <Grid>
                  <Field label="Affiliate code" hint="Two-letter ISO country code, usually">
                    <input
                      value={profile.code}
                      disabled={!!code}
                      onChange={(e) => setProfile((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                      placeholder="ZM"
                      className={cn(input, code && 'bg-gray-50 text-gray-500')}
                    />
                    {duplicateCode && profile.code && <p className="mt-1 text-[11px] text-danger">That code is already in use.</p>}
                  </Field>
                  <Field label="Legal name">
                    <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} onBlur={persistProfile} placeholder="Ecobank Zambia Limited" className={input} />
                  </Field>
                  <Field label="Country">
                    <select
                      value={profile.country}
                      onChange={(e) => {
                        const chosen = COUNTRIES.find((c) => c.name === e.target.value);
                        setProfile((p) => ({ ...p, country: e.target.value, region: chosen?.region ?? p.region }));
                      }}
                      onBlur={persistProfile}
                      className={input}
                    >
                      <option value="">- select -</option>
                      {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Region" hint="Follows the chosen country - override only for an unusual case">
                    <select value={profile.region} onChange={(e) => { setProfile((p) => ({ ...p, region: e.target.value })); }} onBlur={persistProfile} className={input}>
                      <option value="">- select -</option>
                      {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Regulator" hint="Determines the regulatory minima seeded at step 6">
                    <select value={profile.regulator} onChange={(e) => setProfile((p) => ({ ...p, regulator: e.target.value }))} onBlur={persistProfile} className={input}>
                      {REGULATORS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Legal entity code" hint="Position in the Group legal-entity hierarchy">
                    <input value={profile.legalEntityCode} onChange={(e) => setProfile((p) => ({ ...p, legalEntityCode: e.target.value.toUpperCase() }))} onBlur={persistProfile} placeholder={profile.code ? `LE-${profile.code}` : 'LE-ZM'} className={input} />
                  </Field>
                </Grid>
                {!affiliate && !profileValid && (
                  <p className="mt-2 text-[11px] text-gray-400">Enter a code, legal name and country - the record saves automatically the moment these are valid.</p>
                )}
              </Step>
            )}

            {step === 2 && affiliate && (
              <Step title="Currencies & calendar">
                <p className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                  Three currency roles, following OFSAA: one <span className="font-bold">functional</span> currency
                  which cannot be changed once set, a <span className="font-bold">reporting</span> currency that
                  intermediates consolidation, and any other currencies the affiliate transacts in.
                </p>
                <Grid>
                  <Field label="Functional currency" hint={affiliate.functionalCurrency ? 'Immutable - already set' : 'Immutable once set'}>
                    <select
                      value={affiliate.functionalCurrency}
                      disabled={!!affiliate.functionalCurrency}
                      onChange={(e) => setCurrencies({ functionalCurrency: e.target.value })}
                      className={cn(input, affiliate.functionalCurrency && 'bg-gray-50 text-gray-500')}
                    >
                      <option value="">- select -</option>
                      {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Reporting currency" hint="What this affiliate consolidates into">
                    <select value={affiliate.reportingCurrency} onChange={(e) => setCurrencies({ reportingCurrency: e.target.value })} className={input}>
                      {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </Field>
                  <Field label="Fiscal year end">
                    <input value={affiliate.fiscalYearEnd} onChange={(e) => setCurrencies({ fiscalYearEnd: e.target.value })} placeholder="12-31" className={input} />
                  </Field>
                  <Field label="Holiday calendar" hint="Determines business days for settlement">
                    <select value={affiliate.holidayCalendarId ?? ''} onChange={(e) => setCurrencies({ holidayCalendarId: e.target.value || null })} className={input}>
                      <option value="">- none yet -</option>
                      {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                </Grid>
                <Field label="Other active currencies" hint="Currencies transacted in but not consolidated through">
                  <div className="flex flex-wrap gap-2">
                    {currencies.filter((c) => c.code !== affiliate.functionalCurrency).map((c) => (
                      <span key={c.code} className="flex items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-[11px]">
                        <input
                          id={`ccy-${c.code}`}
                          type="checkbox"
                          checked={affiliate.activeCurrencies.includes(c.code)}
                          onChange={(e) => setCurrencies({ activeCurrencies: e.target.checked ? [...affiliate.activeCurrencies, c.code] : affiliate.activeCurrencies.filter((x) => x !== c.code) })}
                          className="accent-gold-500"
                        />
                        <label htmlFor={`ccy-${c.code}`} className="cursor-pointer">{c.code}</label>
                      </span>
                    ))}
                  </div>
                </Field>
              </Step>
            )}

            {step === 3 && affiliate && (
              <Step title="Connectivity & data sources">
                <p className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                  Every domain must be fed by something. Configure or add a connector right here, or declare{' '}
                  <span className="font-bold">file substitution</span> with a cadence and a named owner - no separate
                  Connectors screen needed during onboarding.
                </p>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="py-2 px-3 font-bold">Domain</th>
                      <th className="py-2 px-3 font-bold">Fed by</th>
                      <th className="py-2 px-3 text-right font-bold">SLA (days)</th>
                      <th className="py-2 px-3 font-bold">Owner</th>
                      <th className="py-2 px-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DOMAINS.map((domain) => {
                      const feed = affiliate.feeds.find((f) => f.domain === domain) ?? { domain, mode: 'NotConfigured' as FeedMode, connectorId: null, slaDays: 30, owner: null };
                      const usable = availableFor(connectors, domain);
                      return (
                        <>
                          <tr key={domain} className="border-b border-gray-100 align-top">
                            <td className="py-2 px-3 font-medium text-navy-900">{DOMAIN_LABEL[domain]}</td>
                            <td className="py-2 px-3">
                              <select
                                aria-label={`${domain} feed mode`}
                                value={feed.mode}
                                onChange={(e) => {
                                  const mode = e.target.value as FeedMode;
                                  // Never auto-pick a connector - an existing one belongs to whichever affiliate configured it.
                                  updateFeed(domain, { mode, connectorId: mode === 'Connector' ? null : null });
                                }}
                                className="mb-2 rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                              >
                                <option value="NotConfigured">Not configured</option>
                                <option value="Connector">Connector</option>
                                <option value="File">File substitution</option>
                              </select>
                              {feed.mode === 'Connector' && (
                                <div className="space-y-1.5">
                                  {usable.length > 0 && (
                                    <div>
                                      <label htmlFor={`existing-${domain}`} className="mb-0.5 block text-[10px] text-gray-400">
                                        Reuse a shared connector (e.g. a Group-wide feed) - only if this affiliate genuinely uses the same one
                                      </label>
                                      <select
                                        id={`existing-${domain}`}
                                        aria-label={`${domain} connector`}
                                        value={feed.connectorId ?? ''}
                                        onChange={(e) => updateFeed(domain, { connectorId: e.target.value || null })}
                                        className="w-full rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none"
                                      >
                                        <option value="">- select -</option>
                                        {usable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                      </select>
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => startNewConnector(domain)}
                                    className="w-full rounded-lg border border-navy-700 px-3 py-1.5 text-[11px] font-bold text-navy-700 hover:bg-navy-50"
                                  >
                                    Configure
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input type="number" min={1} value={feed.slaDays} onChange={(e) => updateFeed(domain, { slaDays: Number(e.target.value) })} aria-label={`${domain} SLA days`} className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700" />
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={feed.owner ?? ''}
                                onChange={(e) => updateFeed(domain, { owner: e.target.value || null })}
                                aria-label={`${domain} owner`}
                                className="w-40 rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                              >
                                <option value="">- unassigned -</option>
                                {feedOwners.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <FeedStatusBadge feed={feed} connectors={connectors} />
                            </td>
                          </tr>
                          {addingConnectorFor === domain && newConnectorDraft && (
                            <tr key={`${domain}-editor`}>
                              <td colSpan={5} className="bg-gray-50 p-4">
                                <div className="rounded-lg border border-navy-700 bg-white p-4">
                                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-navy-900">New connector for {DOMAIN_LABEL[domain]}</h3>
                                  <ConnectorFields connector={newConnectorDraft} onChange={setNewConnectorDraft} />
                                  <div className="mt-4 flex items-center justify-end gap-2">
                                    {validateConnector(newConnectorDraft).length > 0 && (
                                      <span className="text-[11px] text-danger">{validateConnector(newConnectorDraft)[0]}</span>
                                    )}
                                    <button type="button" onClick={() => { setAddingConnectorFor(null); setNewConnectorDraft(null); }} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">Cancel</button>
                                    <button
                                      type="button"
                                      disabled={validateConnector(newConnectorDraft).length > 0}
                                      onClick={() => void saveNewConnector()}
                                      title={validateConnector(newConnectorDraft)[0]}
                                      className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                                    >
                                      Save connector
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </Step>
            )}

            {step === 4 && affiliate && (
              <Step title="Chart of accounts & organisation">
                <p className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                  Map this affiliate&rsquo;s local GL codes onto the live Group standard - local charts genuinely
                  differ, and this mapping is what makes them comparable. <span className="font-bold">Unmapped nodes block activation.</span>{' '}
                  A node can take more than one local code.
                </p>
                <table className="mb-6 w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="py-2 px-3 font-bold">Group COA node</th>
                      <th className="py-2 px-3 font-bold">Mapped local codes</th>
                      <th className="py-2 px-3 font-bold">Add a local code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commonCoaLeaves.map((leaf) => {
                      const mapped = glAccounts.filter((m) => m.attributes?.commonCoa === leaf.code);
                      return (
                        <tr key={leaf.code} className="border-b border-gray-100">
                          <td className="py-2 px-3">
                            <span className="font-mono text-[11px] text-gray-500">{leaf.code}</span> <span className="text-navy-900">{leaf.name}</span>
                          </td>
                          <td className="py-2 px-3">
                            {mapped.length === 0 ? (
                              <span className="text-[11px] text-danger">Unmapped</span>
                            ) : (
                              <span className="font-mono text-[11px] text-navy-900">{mapped.map((m) => m.code).join(', ')}</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex gap-2">
                              <input
                                value={newLocalCode[leaf.code] ?? ''}
                                onChange={(e) => setNewLocalCode((prev) => ({ ...prev, [leaf.code]: e.target.value }))}
                                placeholder="e.g. ZM-1010"
                                className="w-32 rounded border border-gray-200 px-2 py-1 font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                              />
                              <button type="button" onClick={() => void addCoaMapping(leaf.code)} className="rounded border border-gray-200 px-2 py-1 text-[11px] font-bold text-navy-900 hover:border-navy-700">
                                Add
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    Organisation structure
                    <InfoButton label="Why this structure?">
                      Group structure is the standard reporting framework; this affiliate&rsquo;s structure maps onto it,
                      which is what keeps segment reporting comparable across affiliates.
                    </InfoButton>
                  </p>
                  {orgRootExists ? (
                    <p className="flex items-center gap-1.5 text-[12px] text-success">
                      ✓ Org structure created: Retail, Corporate &amp; Investment Banking, Treasury, Wealth Management.
                      <InfoButton label="What's next for this structure?">
                        Add branch or desk-level detail from Data Management → Data Structure once this affiliate is live.
                      </InfoButton>
                    </p>
                  ) : (
                    <button type="button" onClick={createOrgTemplate} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700">
                      Create org structure
                    </button>
                  )}
                </div>
              </Step>
            )}

            {step === 5 && affiliate && (
              <Step title="Assumption inheritance">
                <div className="space-y-3">
                  <div className={cn('flex items-start gap-3 rounded-lg border p-4', affiliate.inheritGroupRules ? 'border-navy-700 bg-navy-50' : 'border-gray-200')}>
                    <input id="inherit-group" type="radio" name="rule-inheritance" checked={affiliate.inheritGroupRules} onChange={() => setInherit(true)} className="mt-0.5 accent-gold-500" />
                    <label htmlFor="inherit-group" className="cursor-pointer">
                      <span className="block text-[12px] font-bold text-navy-900">Inherit the Group default rule set</span>
                      <span className="block text-[11px] leading-relaxed text-gray-500">
                        Time buckets, product characteristics, behaviour patterns and discount methods come from the
                        Group folder. The affiliate uses Group defaults as-is.
                      </span>
                    </label>
                  </div>
                  <div className={cn('flex items-start gap-3 rounded-lg border p-4', !affiliate.inheritGroupRules ? 'border-navy-700 bg-navy-50' : 'border-gray-200')}>
                    <input id="fork-rules" type="radio" name="rule-inheritance" checked={!affiliate.inheritGroupRules} onChange={() => setInherit(false)} className="mt-0.5 accent-gold-500" />
                    <label htmlFor="fork-rules" className="cursor-pointer">
                      <span className="block text-[12px] font-bold text-navy-900">Fork affiliate-specific rules</span>
                      <span className="block text-[11px] leading-relaxed text-gray-500">
                        Copies the Group rules into this affiliate&rsquo;s own folder so they can subsequently
                        diverge. The detailed modelling screens are reachable right away, below - no need to finish
                        onboarding first.
                      </span>
                    </label>
                  </div>

                  {!affiliate.inheritGroupRules && (
                    <div className="rounded-lg border border-gray-200 p-4">
                      <label htmlFor="clone-source" className="mb-1 block text-[11px] font-bold text-navy-900">Starter values</label>
                      <p className="mb-2 text-[11px] text-gray-500">
                        A fresh fork starts empty until something is edited - clone a starting point instead, then
                        adjust from there.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <select id="clone-source" value={cloneSource} onChange={(e) => setCloneSource(e.target.value)} className={cn(input, 'w-56')}>
                          <option value="">Group default</option>
                          {affiliates.filter((a) => a.code !== 'GROUP' && a.code !== affiliate.code && a.status === 'Live').map((a) => (
                            <option key={a.code} value={a.code}>{a.name}</option>
                          ))}
                        </select>
                        <button type="button" disabled={cloning} onClick={() => void cloneStarterRules(cloneSource)} className="rounded-lg bg-navy-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-navy-700 disabled:opacity-40">
                          {cloning ? 'Cloning…' : 'Clone starter rules'}
                        </button>
                        {cloned && <StatusBadge status="Cloned" tone="success" />}
                      </div>
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <Link
                          href={`/affiliates/${affiliate.code}/settings?section=rule-coverage`}
                          className="text-[11px] font-bold text-navy-700 hover:underline"
                        >
                          Go to {affiliate.name}&rsquo;s Business Rules →
                        </Link>
                        <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
                          Whether or not you clone first, this is where each rule kind (Product Characteristics,
                          Behaviour Patterns, FTP Rules, and the rest) actually gets edited for this affiliate.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </Step>
            )}

            {step === 6 && affiliate && (
              <Step title="Limits & regulatory thresholds">
                <p className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                  Regulatory minima are seeded from the regulator selected at step 1 and locked -{' '}
                  <span className="font-bold">{affiliate.regulator}</span> is applied here. Internal amber and red are
                  Ecobank&rsquo;s own appetite for this affiliate, and stay editable.{' '}
                  <InfoButton label="What do limit, threshold, breach and escalation mean?">
                    <p className="mb-1.5"><span className="font-bold">Limit</span> - the boundary for one metric (e.g. LCR). <span className="font-bold">Threshold</span> - where along that limit a status changes: amber is an early warning, red is a breach.</p>
                    <p className="mb-1.5"><span className="font-bold">Breach</span> - the metric has crossed red. It doesn&rsquo;t stop the bank, but it does require a recorded reason and an action plan.</p>
                    <p><span className="font-bold">Escalation</span> - who gets told and how urgently, once amber or red is hit. That routing lives on Limits &amp; Breaches, reached after onboarding.</p>
                  </InfoButton>
                </p>
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
                            <span
                              className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 font-mono text-gray-500"
                              title="Locked - set by the regulator"
                            >
                              {value}%
                              <ShieldCheckIcon className="h-3 w-3 shrink-0 text-gray-400" />
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              value={t?.amberPercent ?? ''}
                              onChange={(e) => setThresholdDraft((prev) => ({ ...prev, [metric]: { ...prev[metric]!, amberPercent: Number(e.target.value) } }))}
                              className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                              aria-label={`${metric} internal amber`}
                            />
                            %
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              value={t?.redPercent ?? ''}
                              onChange={(e) => setThresholdDraft((prev) => ({ ...prev, [metric]: { ...prev[metric]!, redPercent: Number(e.target.value) } }))}
                              className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                              aria-label={`${metric} internal red`}
                            />
                            %
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
                <div className="mt-4 flex items-center gap-3">
                  {affiliate.limitsConfirmed ? (
                    <StatusBadge status="Thresholds confirmed" tone="success" />
                  ) : (
                    <button type="button" disabled={thresholdErrors.length > 0} onClick={confirmThresholds} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40">
                      Confirm these thresholds for {affiliate.name}
                    </button>
                  )}
                </div>
              </Step>
            )}
          </section>
        </div>
      )}
    </Drawer>
    </>
  );
}

const input = 'w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';

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
