/**
 * Affiliate Onboarding — one continuous workspace, screen 2.
 *
 * Seven steps, all inline: connector configuration, initial data load and
 * GL reconciliation happen directly in this screen instead of sending the
 * Administrator to /connectors, /data-upload or /gl-reconciliation — those
 * screens remain for ongoing operations, and share their exact business
 * logic with this wizard via `ConnectorFields` and `DataLoadPanel` rather
 * than a second implementation.
 *
 * The affiliate is persisted at `status: 'Onboarding'` the moment step 1's
 * minimum fields are valid, and every step after that reads/writes the same
 * real record (and the same real Dimension/Connector/LoadBatch data) other
 * screens use — so leaving and returning resumes exactly where it left off,
 * nothing is held only in this component's memory.
 *
 * Chart-of-accounts mapping is against the live Group Common COA
 * (`useDimensionMembers('CommonCoa')`), not a hardcoded list — unmapped
 * nodes still block activation, same control as before, just sourced from
 * the real Dimensions configuration instead of a private copy.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConnectorFields } from '@/components/connectors/ConnectorFields';
import { DOMAINS, DOMAIN_LABEL } from '@/components/connectors/connectorConstants';
import { DataLoadPanel } from '@/components/data/DataLoadPanel';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import {
  useAffiliates,
  useBatches,
  useCurrencies,
  useDeleteAffiliate,
  useDimensionMembers,
  useHolidayCalendars,
  usePositions,
  useSaveAffiliate,
  useSaveBatch,
  useSaveDimensionMembers,
} from '@/lib/hooks';
import { availableFor, newConnector, useConnectors, useSaveConnector, validateConnector } from '@/lib/connectorHooks';
import { approvals, newId } from '@/lib/governanceHooks';
import { REGULATORY_MINIMA } from '@/engine/limits';
import { reconcile } from '@/engine/reconciliation';
import { identityFxTable } from '@/engine/fx';
import { importLedger } from '@/lib/csvImport';
import type { Affiliate, Connector, DataDomain, DomainFeed, FeedMode, InternalThreshold } from '@/engine/types';

const STEPS = [
  { n: 1, title: 'Legal entity & profile', hint: 'Who the affiliate is, and who regulates it.' },
  { n: 2, title: 'Currencies & calendar', hint: 'Functional currency is immutable once set.' },
  { n: 3, title: 'Connectivity & data sources', hint: 'Configure or declare a feed for every domain, right here.' },
  { n: 4, title: 'Chart of accounts & organisation', hint: 'Map local GL onto the Group standard.' },
  { n: 5, title: 'Assumption inheritance', hint: 'Inherit Group defaults, or fork.' },
  { n: 6, title: 'Limits & regulatory thresholds', hint: 'Minima differ by jurisdiction; internal appetite is yours to set.' },
  { n: 7, title: 'Initial data load', hint: 'Upload, validate, reconcile, commit — no separate screen.' },
];

const REGULATORS = ['CBN', 'Bank of Ghana', 'BCEAO', 'BEAC', 'Bank of Zambia', 'Central Bank of Kenya'];

const METRIC_LABEL: Record<string, string> = {
  lcrPercent: 'LCR',
  nsfrPercent: 'NSFR',
  loanToDepositPercent: 'Loan-to-Deposit',
};

interface Profile {
  code: string;
  name: string;
  country: string;
  region: string;
  regulator: string;
  legalEntityCode: string;
}

const EMPTY_PROFILE: Profile = { code: '', name: '', country: '', region: 'West Africa', regulator: 'CBN', legalEntityCode: '' };

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
  const { data: commonCoa = [] } = useDimensionMembers('CommonCoa');
  const { data: glAccounts = [] } = useDimensionMembers('GlAccount');
  const { data: orgUnits = [] } = useDimensionMembers('OrgUnit');
  const { data: batches = [] } = useBatches();

  const save = useSaveAffiliate();
  const del = useDeleteAffiliate();
  const saveConnector = useSaveConnector();
  const saveGlAccounts = useSaveDimensionMembers('GlAccount');
  const saveOrgUnits = useSaveDimensionMembers('OrgUnit');
  const saveBatch = useSaveBatch();
  const raiseApproval = approvals.useSave();

  const [code, setCode] = useState<string | null>(resumeCode);
  const affiliate = code ? (affiliates.find((a) => a.code === code) ?? null) : null;
  const creatingRef = useRef(false);

  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [submitted, setSubmitted] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);

  // Rehydrate step 1's local fields once, whenever we learn what the real
  // record already holds — resuming or freshly created, either way this is
  // the affiliate's own persisted data, not a shadow copy.
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

  // Step 1 → create the real record the moment it's identifiable. This is
  // the one moment a new affiliate goes from nothing to a persisted,
  // resumable "Onboarding" row.
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
      // Onboarding, not Testing or Live: this is the existing model's own
      // in-progress status — activation still needs maker-checker approval
      // later, and only Live affiliates consolidate into Group.
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

  // ── Step 2 — currencies & calendar ───────────────────────────────────
  const setCurrencies = (patch: Partial<Pick<Affiliate, 'functionalCurrency' | 'reportingCurrency' | 'activeCurrencies' | 'fiscalYearEnd' | 'holidayCalendarId'>>) => {
    if (!affiliate) return;
    save.mutate({ ...affiliate, ...patch });
  };

  // ── Step 3 — connectivity ────────────────────────────────────────────
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

  const complete3 = !!affiliate && affiliate.feeds.every((f) => f.mode !== 'NotConfigured');

  // ── Step 4 — COA & organisation ──────────────────────────────────────
  const commonCoaLeaves = useMemo(() => commonCoa.filter((m) => m.isLeaf), [commonCoa]);
  const affiliateGlAccounts = useMemo(
    () => (affiliate ? glAccounts.filter((m) => m.attributes?.affiliate === affiliate.code) : []),
    [glAccounts, affiliate],
  );
  const unmappedCoa = useMemo(
    () => commonCoaLeaves.filter((leaf) => !affiliateGlAccounts.some((m) => m.attributes?.commonCoa === leaf.code)),
    [commonCoaLeaves, affiliateGlAccounts],
  );
  const [newLocalCode, setNewLocalCode] = useState<Record<string, string>>({});

  const addCoaMapping = async (leafCode: string) => {
    if (!affiliate) return;
    const localCode = (newLocalCode[leafCode] ?? '').trim();
    if (!localCode) return;
    const rootCode = `GL-${affiliate.code}`;
    const rootExists = glAccounts.some((m) => m.code === rootCode);
    await saveGlAccounts.mutateAsync([
      ...(rootExists ? [] : [{ id: `GlAccount:${rootCode}`, dimension: 'GlAccount' as const, code: rootCode, name: `${affiliate.name} — Local Chart`, parentCode: null, isLeaf: false }]),
      {
        id: `GlAccount:${localCode}`,
        dimension: 'GlAccount' as const,
        code: localCode,
        name: localCode,
        parentCode: rootCode,
        isLeaf: true,
        attributes: { commonCoa: leafCode, affiliate: affiliate.code },
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
      { id: `OrgUnit:${orgRootCode}`, dimension: 'OrgUnit', code: orgRootCode, name: affiliate.name, parentCode: 'OU-GROUP', isLeaf: false },
      ...SEGMENTS.map((s) => ({
        id: `OrgUnit:${orgRootCode}-${s.suffix}`,
        dimension: 'OrgUnit' as const,
        code: `${orgRootCode}-${s.suffix}`,
        name: `${affiliate.name} — ${s.name}`,
        parentCode: orgRootCode,
        isLeaf: true,
      })),
    ]);
  };

  const complete4 = unmappedCoa.length === 0 && orgRootExists;

  // ── Step 5 — assumptions ─────────────────────────────────────────────
  const setInherit = (inheritGroupRules: boolean) => {
    if (!affiliate) return;
    save.mutate({ ...affiliate, inheritGroupRules });
  };

  // ── Step 6 — limits & thresholds ─────────────────────────────────────
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

  // ── Step 7 — initial data load ───────────────────────────────────────
  const [asOfDate, setAsOfDate] = useState('2026-07-31');
  const positionsBatch = affiliate ? batches.find((b) => b.affiliateCode === affiliate.code && b.domain === 'Positions' && b.status === 'Committed') : undefined;
  const { data: committedPositions = [] } = usePositions(affiliate?.code, positionsBatch?.asOfDate);

  const [ledgerFile, setLedgerFile] = useState<{ name: string } | null>(null);
  const [ledgerRows, setLedgerRows] = useState<import('@/engine/reconciliation').LedgerBalance[]>([]);
  const [ledgerErrors, setLedgerErrors] = useState<number>(0);

  const handleLedgerFile = async (file: File) => {
    const text = await file.text();
    const result = importLedger(text, positionsBatch?.asOfDate ?? asOfDate, affiliate?.functionalCurrency ?? 'USD');
    setLedgerFile({ name: file.name });
    setLedgerRows(result.rows);
    setLedgerErrors(result.errors.length);
  };

  const reconciliation = useMemo(() => {
    if (!affiliate || !positionsBatch || ledgerRows.length === 0) return null;
    return reconcile(committedPositions, ledgerRows, {
      reportingCurrency: affiliate.functionalCurrency,
      fx: identityFxTable(affiliate.functionalCurrency, positionsBatch.asOfDate),
      level: 'GlAccount',
      toleranceAmount: 1000,
      tolerancePercent: 5,
    });
  }, [affiliate, positionsBatch, committedPositions, ledgerRows]);

  const signOffReconciliation = () => {
    if (!affiliate || !positionsBatch || !reconciliation?.canSignOff || !user) return;
    saveBatch.mutate({ ...positionsBatch, reconciledBy: user.name, reconciledAt: new Date().toISOString() });
  };

  const reconciledPositionsBatch = positionsBatch?.reconciledAt ? positionsBatch : batches.find(
    (b) => affiliate && b.affiliateCode === affiliate.code && b.domain === 'Positions' && b.status === 'Committed' && b.reconciledAt,
  );

  const complete7 = !!positionsBatch && !!reconciledPositionsBatch?.reconciledAt;

  const complete: Record<number, boolean> = {
    1: !!affiliate,
    2: !!affiliate && affiliate.functionalCurrency !== '' && affiliate.reportingCurrency !== '',
    3: complete3,
    4: complete4,
    5: true,
    6: complete6,
    7: complete7,
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
      summary: `Onboarding complete for ${affiliate.name} — ready to move Testing → Live and consolidate into Group.`,
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
        <ModuleHeader title="Onboard Affiliate" description="Loading…" asOfDate={null} />
      </>
    );
  }

  if (resumeCode && !affiliatesLoading && !affiliate) {
    return (
      <>
        <ModuleHeader title="Onboard Affiliate" description="Not found." asOfDate={null} />
        <p className="rounded-lg bg-gray-50 p-6 text-center text-[12px] text-gray-500">
          No onboarding record with code {resumeCode}. It may already have been completed or cancelled.
        </p>
      </>
    );
  }

  return (
    <>
      <ModuleHeader
        title={affiliate ? `Onboard ${affiliate.name}` : 'Onboard Affiliate'}
        description="Every step happens on this screen — connector setup, initial data load and reconciliation included. Activation still requires maker-checker approval before the affiliate consolidates into Group."
        asOfDate={null}
        scope={affiliate?.name ?? 'New affiliate'}
        metrics={[
          { label: 'Step', value: `${step} of ${STEPS.length}` },
          { label: 'Complete', value: `${STEPS.filter((s) => complete[s.n]).length}/${STEPS.length}` },
          { label: 'Unmapped COA', value: String(unmappedCoa.length), tone: unmappedCoa.length > 0 ? 'danger' : 'success' },
          { label: 'Status', value: affiliate?.status ?? 'Not started', tone: affiliate?.status === 'Onboarding' ? 'warning' : affiliate ? 'success' : 'neutral' },
        ]}
        actions={
          affiliate && affiliate.status === 'Onboarding' && !submitted ? (
            <button
              type="button"
              onClick={handleCancelOnboarding}
              className={cn(
                'rounded-lg border px-4 py-2 text-[12px] font-bold',
                cancelArmed ? 'border-danger bg-danger text-white' : 'border-gray-200 text-danger hover:border-danger',
              )}
            >
              {cancelArmed ? 'Click again to confirm — this cannot be undone' : 'Cancel onboarding'}
            </button>
          ) : undefined
        }
      />

      {submitted ? (
        <section className="rounded-2xl border border-success/20 bg-success-bg p-8 text-center">
          <h2 className="text-[16px] font-bold text-navy-900">✓ {affiliate?.name} submitted for approval</h2>
          <p className="mx-auto mt-2 max-w-lg text-[12px] leading-relaxed text-gray-600">
            Status: <span className="font-bold">Testing / Pending Approval</span>. It will not appear in
            Group-consolidated figures until an authorised approver moves it to Live in Approvals — that gate is
            deliberate, so a half-configured affiliate cannot quietly join the Group balance sheet.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button type="button" onClick={() => navigate('/affiliates')} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700">
              Back to affiliates
            </button>
            <button type="button" onClick={() => navigate('/admin')} className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700">
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
                    <input value={profile.country} onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))} onBlur={persistProfile} placeholder="Zambia" className={input} />
                  </Field>
                  <Field label="Region">
                    <select value={profile.region} onChange={(e) => { setProfile((p) => ({ ...p, region: e.target.value })); }} onBlur={persistProfile} className={input}>
                      {['West Africa', 'Anglophone West Africa', 'UEMOA', 'Central Africa', 'East Africa', 'Southern Africa', 'Nigeria'].map((r) => <option key={r} value={r}>{r}</option>)}
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
                  <p className="mt-2 text-[11px] text-gray-400">Enter a code, legal name and country — the record saves automatically the moment these are valid.</p>
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
                  <Field label="Functional currency" hint={affiliate.functionalCurrency ? 'Immutable — already set' : 'Immutable once set'}>
                    <select
                      value={affiliate.functionalCurrency}
                      disabled={!!affiliate.functionalCurrency}
                      onChange={(e) => setCurrencies({ functionalCurrency: e.target.value })}
                      className={cn(input, affiliate.functionalCurrency && 'bg-gray-50 text-gray-500')}
                    >
                      <option value="">— select —</option>
                      {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
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
                      <option value="">— none yet —</option>
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
                  <span className="font-bold">file substitution</span> with a cadence and a named owner — no separate
                  Connectors screen needed during onboarding.
                </p>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="py-2 font-bold">Domain</th>
                      <th className="py-2 font-bold">Fed by</th>
                      <th className="py-2 text-right font-bold">SLA (days)</th>
                      <th className="py-2 font-bold">Owner</th>
                      <th className="py-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DOMAINS.map((domain) => {
                      const feed = affiliate.feeds.find((f) => f.domain === domain) ?? { domain, mode: 'NotConfigured' as FeedMode, connectorId: null, slaDays: 30, owner: null };
                      const usable = availableFor(connectors, domain);
                      return (
                        <>
                          <tr key={domain} className="border-b border-gray-100">
                            <td className="py-2 font-medium text-navy-900">{DOMAIN_LABEL[domain]}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  aria-label={`${domain} feed mode`}
                                  value={feed.mode}
                                  onChange={(e) => {
                                    const mode = e.target.value as FeedMode;
                                    updateFeed(domain, { mode, connectorId: mode === 'Connector' ? (usable[0]?.id ?? null) : null });
                                  }}
                                  className="rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                                >
                                  <option value="NotConfigured">Not configured</option>
                                  <option value="Connector">Connector</option>
                                  <option value="File">File substitution</option>
                                </select>
                                {feed.mode === 'Connector' && (
                                  <select
                                    aria-label={`${domain} connector`}
                                    value={feed.connectorId ?? ''}
                                    onChange={(e) => updateFeed(domain, { connectorId: e.target.value || null })}
                                    className="rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none"
                                  >
                                    {usable.length === 0 && <option value="">— none available —</option>}
                                    {usable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                )}
                                {feed.mode === 'Connector' && (
                                  <button type="button" onClick={() => startNewConnector(domain)} className="text-[11px] font-bold text-navy-700 hover:underline">
                                    + New connector
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-2 text-right">
                              <input type="number" min={1} value={feed.slaDays} onChange={(e) => updateFeed(domain, { slaDays: Number(e.target.value) })} aria-label={`${domain} SLA days`} className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700" />
                            </td>
                            <td className="py-2">
                              <input value={feed.owner ?? ''} onChange={(e) => updateFeed(domain, { owner: e.target.value || null })} placeholder="Named owner" aria-label={`${domain} owner`} className="w-40 rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700" />
                            </td>
                            <td className="py-2">
                              <StatusBadge status={feed.mode === 'File' ? 'File feed' : feed.mode === 'Connector' ? 'Connected' : 'Not configured'} tone={feed.mode === 'File' ? 'warning' : feed.mode === 'Connector' ? 'success' : 'neutral'} />
                            </td>
                          </tr>
                          {addingConnectorFor === domain && newConnectorDraft && (
                            <tr key={`${domain}-editor`}>
                              <td colSpan={5} className="bg-gray-50 p-4">
                                <div className="rounded-lg border border-navy-700 bg-white p-4">
                                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-navy-900">New connector for {DOMAIN_LABEL[domain]}</h3>
                                  <ConnectorFields connector={newConnectorDraft} onChange={setNewConnectorDraft} />
                                  <div className="mt-4 flex justify-end gap-2">
                                    <button type="button" onClick={() => { setAddingConnectorFor(null); setNewConnectorDraft(null); }} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">Cancel</button>
                                    <button
                                      type="button"
                                      disabled={validateConnector(newConnectorDraft).length > 0}
                                      onClick={() => void saveNewConnector()}
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
                  Map this affiliate&rsquo;s local GL codes onto the live Group standard — local charts genuinely
                  differ, and this mapping is what makes them comparable. <span className="font-bold">Unmapped nodes block activation.</span>{' '}
                  A node can take more than one local code.
                </p>
                <table className="mb-6 w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="py-2 font-bold">Group COA node</th>
                      <th className="py-2 font-bold">Mapped local codes</th>
                      <th className="py-2 font-bold">Add a local code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commonCoaLeaves.map((leaf) => {
                      const mapped = affiliateGlAccounts.filter((m) => m.attributes?.commonCoa === leaf.code);
                      return (
                        <tr key={leaf.code} className="border-b border-gray-100">
                          <td className="py-2">
                            <span className="font-mono text-[11px] text-gray-500">{leaf.code}</span> <span className="text-navy-900">{leaf.name}</span>
                          </td>
                          <td className="py-2">
                            {mapped.length === 0 ? (
                              <span className="text-[11px] text-danger">Unmapped</span>
                            ) : (
                              <span className="font-mono text-[11px] text-navy-900">{mapped.map((m) => m.code).join(', ')}</span>
                            )}
                          </td>
                          <td className="py-2">
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
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Organisation structure</p>
                  {orgRootExists ? (
                    <p className="text-[12px] text-success">✓ Standard org-unit template created — Retail, Corporate &amp; Investment Banking, Treasury, Wealth Management. Add branch or desk-level detail from Data Management → Data Structure afterwards.</p>
                  ) : (
                    <>
                      <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
                        Group structure is the standard reporting framework; this affiliate&rsquo;s structure maps onto it, which is what keeps segment reporting comparable across affiliates.
                      </p>
                      <button type="button" onClick={createOrgTemplate} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700">
                        Create the standard org-unit template
                      </button>
                    </>
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
                        diverge. The detailed modelling screens remain available after onboarding either way.
                      </span>
                    </label>
                  </div>
                </div>
              </Step>
            )}

            {step === 6 && affiliate && (
              <Step title="Limits & regulatory thresholds">
                <p className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                  Regulatory minima are seeded from the regulator selected at step 1 and locked —{' '}
                  <span className="font-bold">{affiliate.regulator}</span> is applied here. Internal amber and red are
                  Ecobank&rsquo;s own appetite for this affiliate, and stay editable.
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
                    {Object.entries(minima).map(([metric, value]) => {
                      const t = thresholdDraft[metric];
                      return (
                        <tr key={metric} className="border-b border-gray-100">
                          <td className="py-2 font-medium text-navy-900">{METRIC_LABEL[metric] ?? metric}</td>
                          <td className="py-2 text-right">
                            <span className="rounded bg-gray-100 px-2 py-1 font-mono text-gray-500" title="Locked — set by the regulator">{value}% 🔒</span>
                          </td>
                          <td className="py-2 text-right">
                            <input
                              type="number"
                              value={t?.amberPercent ?? ''}
                              onChange={(e) => setThresholdDraft((prev) => ({ ...prev, [metric]: { ...prev[metric]!, amberPercent: Number(e.target.value) } }))}
                              className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                              aria-label={`${metric} internal amber`}
                            />
                            %
                          </td>
                          <td className="py-2 text-right">
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

            {step === 7 && affiliate && (
              <Step title="Initial data load">
                <div className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                  <p className="mb-1">
                    <span className="font-bold">Required:</span> Positions, then reconciliation against the general
                    ledger. <span className="font-bold">Optional:</span> Counterparties.
                  </p>
                  <p className="text-[10px] text-navy-900/70">
                    Market rates, FX rates and economic indicators are Group-level reference data maintained
                    centrally (Data Management → Reference Data) — they&rsquo;re not part of an affiliate&rsquo;s own
                    initial load.
                  </p>
                </div>

                <Field label="As-of date">
                  <input type="date" value={positionsBatch?.asOfDate ?? asOfDate} onChange={(e) => setAsOfDate(e.target.value)} disabled={!!positionsBatch} className={cn(input, 'w-48', positionsBatch && 'bg-gray-50 text-gray-500')} />
                </Field>

                <div className="mt-4">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-navy-900">1. Position book (required)</h3>
                  <DataLoadPanel affiliate={affiliate} domain="Positions" asOfDate={positionsBatch?.asOfDate ?? asOfDate} />
                </div>

                {positionsBatch && (
                  <div className="mt-6">
                    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-navy-900">2. Reconcile to the general ledger (required)</h3>
                    {reconciledPositionsBatch?.reconciledAt ? (
                      <div className="rounded-lg bg-success-bg px-4 py-3 text-[12px] text-success">
                        ✓ Reconciled by {reconciledPositionsBatch.reconciledBy} on {new Date(reconciledPositionsBatch.reconciledAt).toLocaleDateString()}.
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-gray-100 bg-white p-4">
                        <label htmlFor="ledger-file" className="mb-1 block text-[11px] text-gray-600">GL trial balance (CSV)</label>
                        <input
                          id="ledger-file"
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLedgerFile(f); }}
                          className="text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-[12px] file:font-bold file:text-white hover:file:bg-navy-700"
                        />
                        {ledgerFile && <p className="mt-2 text-[11px] text-gray-500">{ledgerFile.name} · {ledgerRows.length} row(s) parsed{ledgerErrors > 0 ? `, ${ledgerErrors} error(s)` : ''}</p>}

                        {reconciliation && (
                          <div className="mt-4">
                            <dl className="grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4">
                              <div><dt className="text-[10px] font-bold uppercase text-gray-400">Total variance</dt><dd className="font-mono text-[12px]">{reconciliation.totalVariance.toFixed(2)}</dd></div>
                              <div><dt className="text-[10px] font-bold uppercase text-gray-400">Lines out of tolerance</dt><dd className="font-mono text-[12px]">{reconciliation.linesOutOfTolerance}</dd></div>
                              <div><dt className="text-[10px] font-bold uppercase text-gray-400">Can sign off</dt><dd><StatusBadge status={reconciliation.canSignOff ? 'Yes' : 'No'} tone={reconciliation.canSignOff ? 'success' : 'danger'} /></dd></div>
                            </dl>
                            <button
                              type="button"
                              disabled={!reconciliation.canSignOff}
                              onClick={signOffReconciliation}
                              className="mt-4 rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                            >
                              Sign off reconciliation
                            </button>
                            {!reconciliation.canSignOff && (
                              <p className="mt-2 text-[11px] text-danger">Resolve out-of-tolerance lines before signing off — see GL Reconciliation for line-level detail and suggested plugs.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-navy-900">3. Counterparties (optional)</h3>
                  <DataLoadPanel affiliate={affiliate} domain="Counterparties" asOfDate={positionsBatch?.asOfDate ?? asOfDate} />
                </div>
              </Step>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5">
              <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900 disabled:opacity-30">
                Back
              </button>
              <div className="flex items-center gap-3">
                {!complete[step] && <StatusBadge status="Step incomplete" tone="warning" />}
                {step < STEPS.length ? (
                  <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))} disabled={step === 1 && !affiliate} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40">
                    Next
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
          </section>
        </div>
      )}
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
