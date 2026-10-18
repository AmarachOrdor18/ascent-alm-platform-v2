/**
 * The organisation set-up steps, shared by the guided onboarding (/welcome/organisation, mode 'wizard')
 * and Admin → Organisation setup → Organisation & defaults (mode 'page'). The wizard runs four steps -
 * people are managed on the affiliates step itself; assumptions ship pre-set as Group defaults, so they
 * stay an Admin-page section only (ORG_SETUP_STEPS).
 * Each step saves straight to the real tables - the GROUP affiliate row, public.settings ('GROUP:<key>'),
 * limit_configs, currencies, affiliates and app_users - never to a draft copy.
 */
import { GroupAssumptionsUpload } from '@/components/rules/GroupAssumptionsUpload';
import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { InfoButton } from '@/components/ui/InfoButton';
import { cn } from '@/lib/cn';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { canonicalRole, useAuth } from '@/context/AuthContext';
import { useAffiliates, useCurrencies, useSaveAffiliate, useSaveCurrency, useUsers } from '@/lib/hooks';
import { useLimitConfigs, useSaveLimitConfig } from '@/lib/limitHooks';
import { useSaveSetting, useSettings } from '@/lib/onboardingHooks';
import {
  ORG_SETTING,
  ORG_SETTING_DEFAULTS,
  ORG_STEPS,
  orgSetting,
  type CycleFrequency,
  type MonthEndConvention,
  type OrgStep,
} from '@/lib/onboarding';
import { newAffiliateErrors, newAffiliateRecord } from '@/lib/affiliateFactory';
import {
  BulkUserUpload,
  CreatedLoginsNotice,
  InviteUserForm,
  type CreatedLogin,
} from '@/components/users/UserProvisioning';
import { COUNTRIES } from '@/lib/countries';
import { REGULATORY_MINIMA, type LimitConfig } from '@/engine/limits';
import { CORE_TP_METHODS, TP_METHOD_LABELS } from '@/engine/ftp';
import { useRules } from '@/lib/ruleHooks';
import { approvals } from '@/lib/governanceHooks';
import { SEED_AUTHOR, isApprovalGated, isRuleApproved } from '@/lib/ruleApproval';
import type {
  ActiveRoleCode,
  Affiliate,
  OnboardingRecord,
  RuleKind,
  RuleMeta,
  SettingRecord,
  StoredCurrency,
} from '@/engine/types';

// ─── Step copy: what / why / what's needed / what next ──────────────────────

export interface StepMeta {
  title: string;
  what: string;
  why: string;
  needed: string;
  next: string;
}

export const ORG_STEP_META: Record<OrgStep, StepMeta> = {
  organisation: {
    title: 'Organisation',
    what: 'Name your organisation and set its reporting currency and reporting calendar.',
    why: 'Every affiliate consolidates into this currency, and every reporting cycle follows this calendar.',
    needed: 'The organisation name, reporting currency, cycle frequency, month-end convention and fiscal year end.',
    next: 'Add the affiliates that report into the organisation.',
  },
  affiliates: {
    title: 'Affiliates & people',
    what: 'Add the affiliates that report into the organisation, then bring their people in: give each affiliate its Affiliate Admin and add the rest of the team.',
    why: 'Data, runs, limits and reports are all kept per affiliate and rolled up to the organisation. The Affiliate Admin sets their affiliate up; roles decide what each person can see and do.',
    needed:
      'For each affiliate: a short code, name, country, regulator and functional currency. Then a users file - name, work email, role and affiliate - checked row by row before anything is created, or people invited one at a time.',
    next: 'Next, confirm the organisation defaults every affiliate inherits.',
  },
  settings: {
    title: 'Organisation defaults',
    what: 'Confirm the defaults every affiliate starts with: limits, transfer pricing, currencies and market data.',
    why: 'Affiliates inherit these unless you allow an override, so they only need setting once.',
    needed: 'Nothing new - sensible defaults are already in place. Review them and adjust where needed.',
    next: 'Check the Group-default assumptions every affiliate inherits.',
  },
  assumptions: {
    title: 'Assumptions',
    what: 'See the Group-default assumptions every affiliate inherits: transfer pricing, costs, credit loss, capital, products and deposit behaviour.',
    why: 'Runs use these to turn positions into ratios, funding charges and profitability. All of them ship with an industry-standard baseline, so a first run works out of the box.',
    needed: 'Nothing required - all ship pre-set. Open any of them to replace the baseline figures with your own.',
    next: 'Next, review the summary and complete the organisation setup.',
  },
  review: {
    title: 'Review',
    what: 'Check the summary below. Anything marked ⚠ can be finished later from Admin → Organisation setup.',
    why: 'Completing setup opens the platform as normal for everyone in the organisation.',
    needed: 'Nothing - just a final look.',
    next: 'Go to Home. Affiliate Admins are guided through their own affiliate setup when they sign in.',
  },
};

// ─── Shared bits ────────────────────────────────────────────────────────────

export interface StepProps {
  mode: 'wizard' | 'page';
  /** Wizard only. */
  onBack?: () => void;
  /** Called once the step's own save succeeded - the wizard advances, the page marks the step done. */
  onContinue?: () => void | Promise<void>;
}

export const input =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50 disabled:text-gray-500';
export const label = 'mb-1 block text-[12px] font-bold text-navy-900';
export const btnPrimary =
  'rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40';
export const btnSecondary =
  'rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40';

export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-navy-900">
        {title}
        {description && <InfoButton label={`About ${title}`}>{description}</InfoButton>}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-[13px] text-navy-900">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-gold-500"
      />
      <span>{children}</span>
    </label>
  );
}

export function StepFooter({
  mode,
  onBack,
  onSubmit,
  disabled,
  submitLabel,
}: {
  mode: StepProps['mode'];
  onBack?: () => void;
  onSubmit: () => Promise<void>;
  disabled?: boolean;
  submitLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const run = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await onSubmit();
      if (mode === 'page') setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3',
        mode === 'wizard'
          ? 'sticky bottom-0 z-10 -mx-6 mt-6 border-t border-gray-200 bg-white/95 px-6 py-4 backdrop-blur'
          : 'mt-6 border-t border-gray-100 pt-4',
      )}
    >
      {mode === 'wizard' && onBack && (
        <button type="button" onClick={onBack} disabled={busy} className={btnSecondary}>
          Back
        </button>
      )}
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || disabled}
        className={cn(btnPrimary, mode === 'wizard' && 'ml-auto')}
      >
        {busy ? 'Saving…' : (submitLabel ?? (mode === 'wizard' ? 'Save & continue' : 'Save'))}
      </button>
      {saved && <StatusBadge status="Saved" tone="success" />}
      {error && (
        <p role="alert" className="w-full text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const MONTH_ENDS: Array<{ value: string; label: string }> = [
  ['01-31', '31 January'],
  ['02-28', '28 February'],
  ['03-31', '31 March'],
  ['04-30', '30 April'],
  ['05-31', '31 May'],
  ['06-30', '30 June'],
  ['07-31', '31 July'],
  ['08-31', '31 August'],
  ['09-30', '30 September'],
  ['10-31', '31 October'],
  ['11-30', '30 November'],
  ['12-31', '31 December'],
].map(([value, l]) => ({ value: value!, label: l! }));

function findSetting(settings: SettingRecord[], key: string): SettingRecord | undefined {
  return settings.find((s) => s.affiliateCode === 'GROUP' && s.key === key);
}

/** The organisation's saved value for `key`, else the shipped default. */
function orgValue<T>(settings: SettingRecord[], key: keyof typeof ORG_SETTING_DEFAULTS): T {
  const found = findSetting(settings, key);
  return (found ? found.value : ORG_SETTING_DEFAULTS[key]) as T;
}

function useWho() {
  const { user } = useAuth();
  return user?.name ?? 'unknown';
}

// ─── Step 1: Organisation ───────────────────────────────────────────────────

export function OrganisationStep({ mode, onBack, onContinue }: StepProps) {
  const who = useWho();
  const { data: affiliates = [], isLoading } = useAffiliates();
  const { data: settings = [], isLoading: settingsLoading } = useSettings('GROUP');
  const { data: currencies = [] } = useCurrencies();
  const saveAffiliate = useSaveAffiliate();
  const saveSetting = useSaveSetting();
  const group = affiliates.find((a) => a.code === 'GROUP');

  const [draft, setDraft] = useState<{
    name: string;
    reportingCurrency: string;
    frequency: CycleFrequency;
    monthEnd: MonthEndConvention;
    fiscalYearEnd: string;
  } | null>(null);

  useEffect(() => {
    if (draft || isLoading || settingsLoading) return;
    setDraft({
      name: group?.name ?? '',
      reportingCurrency: group?.reportingCurrency || 'USD',
      frequency: orgValue<CycleFrequency>(settings, 'cycle.frequency'),
      monthEnd: orgValue<MonthEndConvention>(settings, 'cycle.monthEndConvention'),
      fiscalYearEnd:
        (findSetting(settings, ORG_SETTING.fiscalYearEnd)?.value as string | undefined) ??
        group?.fiscalYearEnd ??
        '12-31',
    });
  }, [draft, isLoading, settingsLoading, group, settings]);

  if (!draft) return <p className="text-[13px] text-gray-400">Loading…</p>;
  const set = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });
  const currencyCodes = Array.from(new Set(['USD', ...currencies.filter((c) => c.isActive).map((c) => c.code)]));

  const submit = async () => {
    if (!group) throw new Error('The organisation record (GROUP) is missing - run the platform seed first.');
    await saveAffiliate.mutateAsync({
      ...group,
      name: draft.name.trim(),
      reportingCurrency: draft.reportingCurrency,
      fiscalYearEnd: draft.fiscalYearEnd,
    });
    // One organisation-wide reporting cycle - affiliates never override it.
    await saveSetting.mutateAsync(orgSetting(ORG_SETTING.cycleFrequency, draft.frequency, false, who));
    await saveSetting.mutateAsync(orgSetting(ORG_SETTING.monthEndConvention, draft.monthEnd, false, who));
    await saveSetting.mutateAsync(orgSetting(ORG_SETTING.fiscalYearEnd, draft.fiscalYearEnd, false, who));
    await onContinue?.();
  };

  return (
    <div className="space-y-4">
      <Card title="Organisation details">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="org-name" className={label}>
              Organisation name
            </label>
            <input id="org-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} className={input} />
          </div>
          <div>
            <label htmlFor="org-currency" className={label}>
              Reporting currency
            </label>
            <select
              id="org-currency"
              value={draft.reportingCurrency}
              onChange={(e) => set({ reportingCurrency: e.target.value })}
              className={input}
            >
              {currencyCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-500">
              Every affiliate’s results are converted into this currency for the organisation view.
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Reporting calendar"
        description="The whole organisation works to one reporting cycle; each affiliate’s progress is tracked inside it."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <fieldset>
            <legend className={label}>Cycle frequency</legend>
            {(['Monthly', 'Daily'] as const).map((f) => (
              <label key={f} className="flex items-center gap-2 py-0.5 text-[13px] text-navy-900">
                <input
                  type="radio"
                  name="cycle-frequency"
                  checked={draft.frequency === f}
                  onChange={() => set({ frequency: f })}
                  className="accent-gold-500"
                />
                {f}
                {f === 'Monthly' && <span className="text-[11px] text-gray-400">(recommended)</span>}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="org-monthend" className={label}>
              Month-end convention
            </label>
            <select
              id="org-monthend"
              value={draft.monthEnd}
              onChange={(e) => set({ monthEnd: e.target.value as MonthEndConvention })}
              className={input}
            >
              <option value="LastBusinessDay">Last business day of the month</option>
              <option value="LastCalendarDay">Last calendar day of the month</option>
            </select>
          </div>
          <div>
            <label htmlFor="org-fye" className={label}>
              Fiscal year end
            </label>
            <select
              id="org-fye"
              value={draft.fiscalYearEnd}
              onChange={(e) => set({ fiscalYearEnd: e.target.value })}
              className={input}
            >
              {MONTH_ENDS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <StepFooter mode={mode} onBack={onBack} onSubmit={submit} disabled={draft.name.trim() === ''} />
    </div>
  );
}

// ─── Step 2: Affiliates ─────────────────────────────────────────────────────

const REGULATORS = Object.keys(REGULATORY_MINIMA);

interface AffiliateDraft {
  code: string;
  name: string;
  country: string;
  regulator: string;
  functionalCurrency: string;
}

const EMPTY_AFFILIATE: AffiliateDraft = { code: '', name: '', country: '', regulator: '', functionalCurrency: '' };

function AffiliateForm({
  initial,
  existing,
  currencies,
  onCancel,
  onSave,
}: {
  initial: AffiliateDraft;
  /** The affiliate being edited, or null when adding. */
  existing: Affiliate | null;
  currencies: StoredCurrency[];
  onCancel: () => void;
  onSave: (draft: AffiliateDraft) => Promise<void>;
}) {
  const { data: affiliates = [] } = useAffiliates();
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<AffiliateDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const errors = existing
    ? ([!draft.name.trim() && 'Name is required.', !draft.country.trim() && 'Country is required.'].filter(
        Boolean,
      ) as string[])
    : newAffiliateErrors(
        draft,
        affiliates.map((a) => a.code),
      );
  // The functional currency is fixed once the affiliate has moved past onboarding.
  const currencyLocked = !!existing && existing.status !== 'Onboarding' && !!existing.functionalCurrency;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the affiliate.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-navy-700/30 bg-navy-50/40 p-4">
      <p className="mb-3 text-[13px] font-bold text-navy-900">{existing ? `Edit ${existing.name}` : 'Add affiliate'}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div>
          <label htmlFor="aff-code" className={label}>
            Code
          </label>
          <input
            id="aff-code"
            value={draft.code}
            disabled={!!existing}
            maxLength={6}
            placeholder="e.g. GH"
            onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            className={input}
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="aff-name" className={label}>
            Name
          </label>
          <input
            id="aff-name"
            value={draft.name}
            placeholder="e.g. Ecobank Ghana"
            onChange={(e) => set({ name: e.target.value })}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="aff-country" className={label}>
            Country
          </label>
          <select
            id="aff-country"
            value={draft.country}
            onChange={(e) => set({ country: e.target.value })}
            className={input}
          >
            <option value="">Select…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="aff-regulator" className={label}>
            Regulator
          </label>
          <select
            id="aff-regulator"
            value={draft.regulator}
            onChange={(e) => set({ regulator: e.target.value })}
            className={input}
          >
            <option value="">Select…</option>
            {REGULATORS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="aff-ccy" className={label}>
            Functional currency
          </label>
          <select
            id="aff-ccy"
            value={draft.functionalCurrency}
            disabled={currencyLocked}
            onChange={(e) => set({ functionalCurrency: e.target.value })}
            className={input}
          >
            <option value="">Select…</option>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {errors.length > 0 && draft !== initial && <p className="mt-2 text-[12px] text-danger">{errors.join(' ')}</p>}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => void save()} disabled={busy || errors.length > 0} className={btnPrimary}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Add affiliate'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-[13px] font-bold text-gray-500 hover:text-navy-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const ALL_ORG_ROLES: ActiveRoleCode[] = ['AFFILIATE_ADMIN', 'RISK_ANALYST', 'APPROVER', 'EXECUTIVE_VIEWER'];

export function AffiliatesStep({ mode, onBack, onContinue }: StepProps) {
  const { data: affiliates = [], isLoading } = useAffiliates();
  const { data: currencies = [] } = useCurrencies();
  const { data: users = [] } = useUsers();
  const saveAffiliate = useSaveAffiliate();
  const [editing, setEditing] = useState<Affiliate | 'new' | null>(null);
  const real = affiliates.filter((a) => a.code !== 'GROUP').sort((a, b) => a.name.localeCompare(b.name));
  const activeCurrencies = currencies.filter((c) => c.isActive);

  // People management, merged in from the former Users & access step: the flow is add affiliate →
  // invite its admin → upload the team (CSV) or invite one person.
  const adminsOf = (code: string) =>
    users.filter((u) => u.affiliateCode === code && canonicalRole(u.role) === 'AFFILIATE_ADMIN' && u.isActive);
  const withoutAdmin = real.filter((a) => adminsOf(a.code).length === 0);
  const [invite, setInvite] = useState<null | { code?: string }>(null);
  const [bulk, setBulk] = useState(false);
  const [created, setCreated] = useState<CreatedLogin[]>([]);
  const emails = users.map((u) => u.email.toLowerCase());
  const bulkAffiliates = [
    { code: 'GROUP', name: 'Group (all affiliates)' },
    ...real.map((a) => ({ code: a.code, name: a.name })),
  ];

  const saveNew = async (d: AffiliateDraft) => {
    const country = COUNTRIES.find((c) => c.name === d.country);
    await saveAffiliate.mutateAsync(
      newAffiliateRecord({
        ...d,
        region: country?.region ?? '',
        reportingCurrency: affiliates.find((a) => a.code === 'GROUP')?.reportingCurrency ?? 'USD',
      }),
    );
    setEditing(null);
  };
  const saveExisting = async (a: Affiliate, d: AffiliateDraft) => {
    const country = COUNTRIES.find((c) => c.name === d.country);
    await saveAffiliate.mutateAsync({
      ...a,
      name: d.name.trim(),
      country: d.country,
      region: country?.region ?? a.region,
      regulator: d.regulator,
      functionalCurrency: d.functionalCurrency || a.functionalCurrency,
    });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <Card
        title={`Affiliates (${real.length})`}
        description="Basic details only. Each affiliate’s own admin completes its operational setup - data sources, chart of accounts, limits - after this."
      >
        {isLoading ? (
          <p className="text-[13px] text-gray-400">Loading…</p>
        ) : real.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-[13px] text-gray-500">
            No affiliates yet. Add the first one below - or continue and add them later from Admin → Organisation setup.
          </p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Country</th>
                <th className="py-2 pr-3">Regulator</th>
                <th className="py-2 pr-3">Currency</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {real.map((a) => (
                <tr key={a.code} className="border-b border-gray-50">
                  <td className="py-2 pr-3 font-mono">{a.code}</td>
                  <td className="py-2 pr-3 font-medium text-navy-900">{a.name}</td>
                  <td className="py-2 pr-3">{a.country || '-'}</td>
                  <td className="py-2 pr-3">{a.regulator || '-'}</td>
                  <td className="py-2 pr-3 font-mono">{a.functionalCurrency || '-'}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      className="text-[12px] font-bold text-navy-700 hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {editing === null && (
          <button type="button" onClick={() => setEditing('new')} className={cn(btnSecondary, 'mt-4')}>
            + Add affiliate
          </button>
        )}
        {editing === 'new' && (
          <AffiliateForm
            initial={EMPTY_AFFILIATE}
            existing={null}
            currencies={activeCurrencies}
            onCancel={() => setEditing(null)}
            onSave={saveNew}
          />
        )}
        {editing && editing !== 'new' && (
          <AffiliateForm
            key={editing.code}
            initial={{
              code: editing.code,
              name: editing.name,
              country: editing.country,
              regulator: editing.regulator,
              functionalCurrency: editing.functionalCurrency,
            }}
            existing={editing}
            currencies={activeCurrencies}
            onCancel={() => setEditing(null)}
            onSave={(d) => saveExisting(editing, d)}
          />
        )}
      </Card>

      {/* People management, merged from the former Users & access step. */}
      <Card
        title="Your people"
        description="Bring everyone in at once with a users file (name, email, role, affiliateCode) - it is checked row by row before anything is created. Group-scoped people are managed afterwards under Users & roles, exactly like every other user."
      >
        {isLoading ? (
          <p className="text-[13px] text-gray-400">Loading…</p>
        ) : real.length === 0 ? (
          <p className="text-[13px] text-gray-500">
            No affiliates yet - add the first one above, then bring their people in here.
          </p>
        ) : (
          <>
            {withoutAdmin.length > 0 && (
              <ul className="divide-y divide-gray-50">
                {withoutAdmin.map((a) => (
                  <li key={a.code} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                    <span className="font-medium text-navy-900">
                      {a.name} <span className="font-mono text-[11px] text-gray-400">{a.code}</span>
                    </span>
                    <button type="button" onClick={() => setInvite({ code: a.code })} className={btnSecondary}>
                      Invite its admin
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => setBulk(true)} className={btnPrimary}>
                Upload users (CSV)
              </button>
              <button type="button" onClick={() => setInvite({})} className={btnSecondary}>
                Invite one person
              </button>
            </div>
          </>
        )}
      </Card>

      {bulk && (
        <Modal title="Upload users" wide onClose={() => setBulk(false)}>
          <BulkUserUpload
            affiliates={bulkAffiliates}
            roles={ALL_ORG_ROLES}
            existingEmails={emails}
            onCancel={() => setBulk(false)}
            onCreated={(list) => {
              setBulk(false);
              setCreated(list);
            }}
          />
        </Modal>
      )}

      {invite && (
        <Modal
          title="Invite a person"
          wide
          onClose={() => setInvite(null)}
          description={
            invite.code
              ? `${affiliates.find((a) => a.code === invite.code)?.name ?? invite.code} will get its Affiliate Admin or another team member.`
              : 'Which affiliate will they work in?'
          }
        >
          {!invite.code && real.length > 0 && (
            <div className="space-y-3">
              {real.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => setInvite({ code: a.code })}
                  className={cn(btnSecondary, 'w-full text-left')}
                >
                  {a.name} <span className="font-mono text-[11px] text-gray-400">{a.code}</span>
                </button>
              ))}
            </div>
          )}
          {invite.code && (
            <InviteUserForm
              title={`Invite the Affiliate Admin for ${affiliates.find((a) => a.code === invite.code)?.name ?? invite.code}`}
              affiliateCode={invite.code}
              // The Organisation Admin may appoint an Affiliate Admin at any time - including a second
              // one - so the role stays on the list even when the affiliate already has one. Only the
              // no-summary fast path keeps the single-role picker hidden (defaults to Affiliate Admin).
              roles={adminsOf(invite.code).length > 0 ? ALL_ORG_ROLES : ['AFFILIATE_ADMIN']}
              existingEmails={emails}
              onCancel={() => setInvite(null)}
              onCreated={(c) => {
                setInvite(null);
                setCreated([c]);
              }}
            />
          )}
        </Modal>
      )}

      <CreatedLoginsNotice created={created} onDone={() => setCreated([])} />

      <StepFooter
        mode={mode}
        onBack={onBack}
        onSubmit={async () => {
          await onContinue?.();
        }}
        submitLabel={mode === 'wizard' ? 'Continue' : 'Mark reviewed'}
      />
    </div>
  );
}

// ─── Step 3: Organisation defaults ──────────────────────────────────────────

type LimitEdit = Pick<LimitConfig, 'amberThreshold' | 'redThreshold' | 'regulatoryMinimum'>;

function limitError(l: LimitConfig, e: LimitEdit): string | null {
  if (!Number.isFinite(e.amberThreshold) || !Number.isFinite(e.redThreshold)) return 'Enter numbers';
  if (l.direction === 'higher-is-better' && e.amberThreshold < e.redThreshold) return 'Amber must be at or above red';
  if (l.direction === 'lower-is-better' && e.amberThreshold > e.redThreshold) return 'Amber must be at or below red';
  return null;
}

export function DefaultsStep({ mode, onBack, onContinue }: StepProps) {
  const who = useWho();
  const { data: allLimits = [], isLoading: limitsLoading } = useLimitConfigs();
  const { data: settings = [], isLoading: settingsLoading } = useSettings('GROUP');
  const { data: currencies = [] } = useCurrencies();
  const saveLimit = useSaveLimitConfig();
  const saveSetting = useSaveSetting();
  const saveCurrency = useSaveCurrency();

  const groupLimits = useMemo(() => allLimits.filter((l) => l.affiliateCode === null), [allLimits]);
  const [limitEdits, setLimitEdits] = useState<Record<string, LimitEdit>>({});
  const [currencyEdits, setCurrencyEdits] = useState<Record<string, boolean>>({});
  const [policy, setPolicy] = useState<{
    ftpMethod: string;
    ftpLiquidityPremium: boolean;
    ftpOverridable: boolean;
    marketDataOverrides: boolean;
  } | null>(null);

  useEffect(() => {
    if (policy || settingsLoading) return;
    const ftp = findSetting(settings, ORG_SETTING.ftpMethod);
    setPolicy({
      ftpMethod: orgValue<string>(settings, 'ftp.defaultMethod'),
      ftpLiquidityPremium: orgValue<boolean>(settings, 'ftp.liquidityPremium'),
      ftpOverridable: ftp ? ftp.overridable === true : true,
      marketDataOverrides: orgValue<boolean>(settings, 'marketData.affiliateOverrides'),
    });
  }, [policy, settingsLoading, settings]);

  if (!policy || limitsLoading) return <p className="text-[13px] text-gray-400">Loading…</p>;

  const limitValue = (l: LimitConfig): LimitEdit =>
    limitEdits[l.id] ?? {
      amberThreshold: l.amberThreshold,
      redThreshold: l.redThreshold,
      regulatoryMinimum: l.regulatoryMinimum,
    };
  const editLimit = (l: LimitConfig, patch: Partial<LimitEdit>) =>
    setLimitEdits((prev) => ({ ...prev, [l.id]: { ...limitValue(l), ...patch } }));
  const limitErrors = groupLimits.map((l) => limitError(l, limitValue(l))).filter(Boolean);
  const currencyActive = (c: StoredCurrency) => currencyEdits[c.code] ?? c.isActive;

  const submit = async () => {
    for (const l of groupLimits) {
      const e = limitEdits[l.id];
      if (!e) continue;
      if (
        e.amberThreshold === l.amberThreshold &&
        e.redThreshold === l.redThreshold &&
        e.regulatoryMinimum === l.regulatoryMinimum
      )
        continue;
      const green =
        l.direction === 'higher-is-better'
          ? Math.max(l.greenThreshold, e.amberThreshold)
          : Math.min(l.greenThreshold, e.amberThreshold);
      await saveLimit.mutateAsync({ ...l, ...e, greenThreshold: green });
    }
    for (const c of currencies) {
      const next = currencyEdits[c.code];
      if (next !== undefined && next !== c.isActive) await saveCurrency.mutateAsync({ ...c, isActive: next });
    }
    await saveSetting.mutateAsync(orgSetting(ORG_SETTING.ftpMethod, policy.ftpMethod, policy.ftpOverridable, who));
    await saveSetting.mutateAsync(
      orgSetting(ORG_SETTING.ftpLiquidityPremium, policy.ftpLiquidityPremium, policy.ftpOverridable, who),
    );
    await saveSetting.mutateAsync(orgSetting(ORG_SETTING.marketDataLoadedBy, 'Group', false, who));
    await saveSetting.mutateAsync(
      orgSetting(ORG_SETTING.marketDataAffiliateOverrides, policy.marketDataOverrides, false, who),
    );
    setLimitEdits({});
    setCurrencyEdits({});
    await onContinue?.();
  };

  return (
    <div className="space-y-4">
      {/* Optional (teardown phase 1.2): load the Group assumptions file now, or set them up later. */}
      {mode === 'wizard' && <GroupAssumptionsUpload />}
      <p className="rounded-lg bg-navy-50 px-4 py-2.5 text-[13px] text-navy-900">
        Affiliates inherit these unless you allow an override.
      </p>

      <Card
        title="Group limits"
        description="Risk-appetite thresholds every affiliate is measured against. An affiliate may tighten them with its own thresholds during its setup."
      >
        {groupLimits.length === 0 ? (
          <p className="text-[13px] text-gray-500">
            No organisation-wide limits are configured. Add them from Run &amp; results → Limits.
          </p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                <th className="py-2 pr-3">Limit</th>
                <th className="py-2 pr-3">Better when</th>
                <th className="py-2 pr-3">Amber at</th>
                <th className="py-2 pr-3">Red at</th>
                <th className="py-2 pr-3">Regulatory minimum</th>
              </tr>
            </thead>
            <tbody>
              {groupLimits.map((l) => {
                const v = limitValue(l);
                const err = limitError(l, v);
                return (
                  <tr key={l.id} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3 font-medium text-navy-900">
                      {l.label}
                      {err && <span className="block text-[11px] text-danger">{err}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-500">
                      {l.direction === 'higher-is-better' ? 'Higher' : 'Lower'}
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        aria-label={`${l.label} amber`}
                        type="number"
                        value={v.amberThreshold}
                        onChange={(e) => editLimit(l, { amberThreshold: Number(e.target.value) })}
                        className={cn(input, 'w-24 py-1')}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        aria-label={`${l.label} red`}
                        type="number"
                        value={v.redThreshold}
                        onChange={(e) => editLimit(l, { redThreshold: Number(e.target.value) })}
                        className={cn(input, 'w-24 py-1')}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        aria-label={`${l.label} regulatory minimum`}
                        type="number"
                        value={v.regulatoryMinimum ?? ''}
                        placeholder="None"
                        onChange={(e) =>
                          editLimit(l, { regulatoryMinimum: e.target.value === '' ? null : Number(e.target.value) })
                        }
                        className={cn(input, 'w-24 py-1')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Funds transfer pricing" description="The method every affiliate’s FTP rules start from.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="ftp-method" className={label}>
              Default method
            </label>
            <select
              id="ftp-method"
              value={policy.ftpMethod}
              onChange={(e) => setPolicy({ ...policy, ftpMethod: e.target.value })}
              className={input}
            >
              {CORE_TP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {TP_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 pt-5">
            <Toggle
              id="ftp-lp"
              checked={policy.ftpLiquidityPremium}
              onChange={(v) => setPolicy({ ...policy, ftpLiquidityPremium: v })}
            >
              Apply a liquidity premium
            </Toggle>
            <Toggle
              id="ftp-override"
              checked={policy.ftpOverridable}
              onChange={(v) => setPolicy({ ...policy, ftpOverridable: v })}
            >
              Affiliates may override
            </Toggle>
          </div>
        </div>
      </Card>

      <Card
        title="Currencies"
        description="The currencies available to affiliates. Untick one the organisation no longer uses."
      >
        {currencies.length === 0 ? (
          <p className="text-[13px] text-gray-500">
            No currencies defined yet - add them under Market &amp; reference data → FX rates.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {currencies.map((c) => (
              <Toggle
                key={c.code}
                id={`ccy-${c.code}`}
                checked={currencyActive(c)}
                onChange={(v) => setCurrencyEdits((p) => ({ ...p, [c.code]: v }))}
              >
                <span className="font-mono">{c.code}</span> <span className="text-gray-500">{c.name}</span>
              </Toggle>
            ))}
          </div>
        )}
      </Card>

      <Card title="Market data" description="Yield curves, FX rates and indicators for each cycle.">
        <p className="mb-3 text-[13px] text-navy-900">
          Loaded by: <span className="font-bold">Group</span> - the organisation loads market data centrally for every
          affiliate.
        </p>
      </Card>

      <StepFooter mode={mode} onBack={onBack} onSubmit={submit} disabled={limitErrors.length > 0} />
    </div>
  );
}

// ─── Step 4: Assumptions (Group defaults) ───────────────────────────────────

export type AssumptionStatus = 'Not set' | 'Pending approval' | 'Approved' | 'Shipped default';

interface AssumptionDef {
  kind: RuleKind;
  title: string;
  what: string;
  /** Whether a run needs it, in plain words - shown as a label. */
  need: 'Needed for profitability' | 'Optional';
  /** What happens until it is set. */
  ifMissing: string;
  path: string;
  /** Keyed on products/history that only exist once an affiliate uploads its own files - shown plainly on the step. */
  needsData?: string;
}

const editor = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

// The rule editors, opened in a side panel so the admin never leaves onboarding.
const EDITORS: Partial<Record<RuleKind, ComponentType>> = {
  FtpRule: editor(() => import('@/pages/rules/FtpAndAdjustments'), 'FtpRules'),
  AdjustmentRule: editor(() => import('@/pages/rules/FtpAndAdjustments'), 'AdjustmentRules'),
  CostAllocation: editor(() => import('@/pages/rules/ProfitabilityRules'), 'CostAllocationRules'),
  CreditLoss: editor(() => import('@/pages/rules/ProfitabilityRules'), 'CreditLossRules'),
  CapitalAllocation: editor(() => import('@/pages/rules/ProfitabilityRules'), 'CapitalRules'),
  ProductCharacteristic: editor(() => import('@/pages/rules/ProductCharacteristics'), 'ProductCharacteristics'),
  BehaviourPattern: editor(() => import('@/pages/rules/BehaviourPatterns'), 'BehaviourPatterns'),
};

/** The Group-default assumptions every affiliate inherits, with what a run does when one is missing. */
export const GROUP_ASSUMPTIONS: AssumptionDef[] = [
  {
    kind: 'FtpRule',
    need: 'Optional',
    title: 'Transfer pricing method & curve',
    what: 'How each product is charged or credited for funding.',
    ifMissing:
      'Every product is priced on its currency\u2019s yield curve using the default method you chose in Organisation defaults. Set this to choose a method or curve per product.',
    path: '/rules/ftp',
  },
  {
    kind: 'AdjustmentRule',
    need: 'Optional',
    title: 'Transfer pricing add-ons',
    what: 'Liquidity premium, currency basis and other spreads added to the funding charge.',
    ifMissing: 'Transfer prices carry no liquidity premium or currency/basis spread.',
    path: '/rules/adjustments',
  },
  {
    kind: 'CostAllocation',
    need: 'Needed for profitability',
    title: 'Operating cost allocation',
    what: 'How running costs are shared across products and business units.',
    ifMissing: 'The profitability results stay empty and say what to set up. All other results run normally.',
    path: '/rules/cost-allocation',
  },
  {
    kind: 'CreditLoss',
    need: 'Needed for profitability',
    title: 'Expected credit loss',
    what: 'Default and loss rates by product.',
    ifMissing: 'The profitability results stay empty and say what to set up. All other results run normally.',
    path: '/rules/credit-loss',
  },
  {
    kind: 'CapitalAllocation',
    need: 'Needed for profitability',
    title: 'Capital charge',
    what: 'Capital held against each product and its cost.',
    ifMissing: 'The profitability results stay empty and say what to set up. All other results run normally.',
    path: '/rules/capital',
  },
  {
    kind: 'ProductCharacteristic',
    need: 'Optional',
    title: 'Product characteristics',
    what: 'How each product is treated for liquidity (liquid asset level, outflow and funding factors).',
    ifMissing:
      'Each position\u2019s liquidity treatment is taken from its uploaded file (liquid-asset level, cash-flow role).',
    path: '/rules/product-characteristics',
    needsData:
      'This list is keyed on each product\u2019s code, which only exists once an affiliate uploads its own position files - so it is normally set after affiliates bring their data in.',
  },
  {
    kind: 'BehaviourPattern',
    need: 'Optional',
    title: 'Deposit behaviour',
    what: 'How long deposits without a maturity really stay (stable and volatile parts).',
    ifMissing:
      'A standard deposit pattern ships with the platform and is used until you replace it - for example with a fitted model.',
    path: '/rules/behaviour-patterns',
    needsData:
      'The shipped pattern works from day one. Replacing it with customer behaviour fitted to your history needs the balance/account history an affiliate uploads - via Assumptions → Behavioural models.',
  },
];

/** Status of each Group-default assumption, from the rules table and the approval queue. */
export function useGroupAssumptions(): {
  items: Array<AssumptionDef & { status: AssumptionStatus; ruleName: string | null }>;
  loading: boolean;
} {
  const ftp = useRules('FtpRule');
  const adj = useRules('AdjustmentRule');
  const cost = useRules('CostAllocation');
  const ecl = useRules('CreditLoss');
  const cap = useRules('CapitalAllocation');
  const prod = useRules('ProductCharacteristic');
  const beh = useRules('BehaviourPattern');
  const { data: requests = [], isLoading: r } = approvals.useList();
  const byKind: Record<string, { data?: RuleMeta[]; isLoading: boolean }> = {
    FtpRule: ftp,
    AdjustmentRule: adj,
    CostAllocation: cost,
    CreditLoss: ecl,
    CapitalAllocation: cap,
    ProductCharacteristic: prod,
    BehaviourPattern: beh,
  };
  const items = GROUP_ASSUMPTIONS.map((def) => {
    const rules = (byKind[def.kind]?.data ?? []).filter((x) => x.affiliateCode === null && x.isActive);
    if (rules.length === 0) return { ...def, status: 'Not set' as const, ruleName: null };
    // FTP and add-on rules are not approval-gated: saved means in use.
    const approved = isApprovalGated(def.kind) ? rules.find((x) => isRuleApproved(x, requests)) : rules[0];
    if (approved && approved.createdBy === SEED_AUTHOR && approved.version === 1) {
      return { ...def, status: 'Shipped default' as const, ruleName: approved.name };
    }
    if (approved) return { ...def, status: 'Approved' as const, ruleName: approved.name };
    return { ...def, status: 'Pending approval' as const, ruleName: rules[0]!.name };
  });
  return { items, loading: r || Object.values(byKind).some((q) => q.isLoading) };
}

const ASSUMPTION_TONE: Record<AssumptionStatus, 'success' | 'warning' | 'neutral'> = {
  Approved: 'success',
  'Pending approval': 'warning',
  'Not set': 'neutral',
  'Shipped default': 'neutral',
};

export function AssumptionsStep({ mode, onBack, onContinue }: StepProps) {
  const { items, loading } = useGroupAssumptions();
  const missing = items.filter((i) => i.status === 'Not set' || i.status === 'Pending approval').length;
  const [openKind, setOpenKind] = useState<RuleKind | null>(null);
  const openItem = items.find((i) => i.kind === openKind) ?? null;
  const Editor = openKind ? EDITORS[openKind] : undefined;
  return (
    <div className="space-y-4">
      <GroupAssumptionsUpload />
      <Card
        title="Group-default assumptions"
        description="Every affiliate inherits these unless it sets its own. All ship with industry-standard baselines - figures such as the cost budget, default rates and risk weights are illustrative and meant to be replaced with yours. Set up opens the editor here; close it to come back to this list."
      >
        {loading ? (
          <p className="text-[13px] text-gray-400">Loading…</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((i) => (
              <li key={i.kind} className="flex flex-wrap items-start gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-navy-900">
                    {i.title} <StatusBadge status={i.status} tone={ASSUMPTION_TONE[i.status]} />
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        i.need === 'Optional' ? 'bg-gray-100 text-gray-500' : 'bg-navy-50 text-navy-700',
                      )}
                    >
                      {i.need}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    {i.what}
                    {i.ruleName ? ` Current: ${i.ruleName}.` : ''}
                  </p>
                  {i.needsData && (
                    <p className="mt-1 flex items-start gap-1.5 text-[12px] text-gray-500">
                      <span className="shrink-0 rounded-full bg-gold-500/10 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
                        Needs affiliate data
                      </span>
                      <span>{i.needsData}</span>
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setOpenKind(i.kind)} className={btnSecondary}>
                  {i.status === 'Not set' ? 'Set up' : i.status === 'Shipped default' ? 'Change' : 'Open'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {openItem && Editor && (
        <Drawer title={openItem.title} description={openItem.what} onClose={() => setOpenKind(null)} wide>
          <Suspense fallback={<p className="text-[13px] text-gray-400">Loading…</p>}>
            <Editor />
          </Suspense>
        </Drawer>
      )}
      <StepFooter
        mode={mode}
        onBack={onBack}
        onSubmit={async () => {
          await onContinue?.();
        }}
        submitLabel={
          missing > 0
            ? mode === 'wizard'
              ? 'Do this later & continue'
              : 'Do this later'
            : mode === 'wizard'
              ? 'Continue'
              : 'Mark as reviewed'
        }
      />
    </div>
  );
}

// ─── Step 6: Review ─────────────────────────────────────────────────────────

export interface ReviewItem {
  step: OrgStep;
  label: string;
  ok: boolean;
  detail: string;
}

/** The review summary, computed from live data. */
export function useOrgReview(): { items: ReviewItem[]; loading: boolean } {
  const { data: affiliates = [], isLoading: a } = useAffiliates();
  const { data: settings = [], isLoading: s } = useSettings('GROUP');
  const { data: users = [], isLoading: u } = useUsers();
  const { data: limits = [] } = useLimitConfigs();
  const { data: currencies = [] } = useCurrencies();
  const group = affiliates.find((x) => x.code === 'GROUP');
  const real = affiliates.filter((x) => x.code !== 'GROUP');
  const cycle = findSetting(settings, ORG_SETTING.cycleFrequency);
  const ftp = findSetting(settings, ORG_SETTING.ftpMethod);
  const md = findSetting(settings, ORG_SETTING.marketDataLoadedBy);
  const withoutAdmin = real.filter(
    (x) =>
      !users.some(
        (usr) => usr.affiliateCode === x.code && canonicalRole(usr.role) === 'AFFILIATE_ADMIN' && usr.isActive,
      ),
  );
  const groupLimits = limits.filter((l) => l.affiliateCode === null);
  const items: ReviewItem[] = [
    {
      step: 'organisation',
      label: 'Organisation',
      ok: !!group?.name && !!cycle,
      detail: group
        ? `${group.name} · reporting in ${group.reportingCurrency || 'USD'} · ${cycle ? `${String(cycle.value)} cycle` : 'reporting calendar not saved yet'}`
        : 'Organisation record missing.',
    },
    {
      step: 'affiliates',
      label: 'Affiliates',
      ok: real.length > 0 && withoutAdmin.length === 0,
      detail:
        real.length === 0
          ? 'None yet - you can add them later.'
          : [
              `${real.length} affiliate(s): ${real.map((x) => x.code).join(', ')}`,
              withoutAdmin.length === 0
                ? 'Every affiliate has an Affiliate Admin.'
                : `No Affiliate Admin yet for: ${withoutAdmin.map((x) => x.name).join(', ')}.`,
            ].join(' · '),
    },
    {
      step: 'settings',
      label: 'Organisation defaults',
      ok: !!ftp && !!md,
      detail:
        ftp && md
          ? `${groupLimits.length} Group limits · FTP ${TP_METHOD_LABELS[ftp.value as keyof typeof TP_METHOD_LABELS] ?? String(ftp.value)} · ${currencies.filter((c) => c.isActive).length} active currencies · market data loaded by Group`
          : 'Defaults not confirmed yet.',
    },
  ];
  return { items, loading: a || s || u };
}

export function ReviewStep({
  mode,
  onBack,
  onGoTo,
  onComplete,
  record,
}: StepProps & { onGoTo: (step: OrgStep) => void; onComplete: () => Promise<void>; record: OnboardingRecord | null }) {
  const { items, loading } = useOrgReview();
  const complete = record?.status === 'Complete';
  return (
    <div className="space-y-4">
      <Card title="Summary">
        {loading ? (
          <p className="text-[13px] text-gray-400">Loading…</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {items.map((i) => (
              <li key={i.step} className="flex items-start gap-3 py-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                    i.ok ? 'bg-success text-white' : 'bg-warning-bg text-warning',
                  )}
                >
                  {i.ok ? '✓' : '⚠'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-navy-900">
                    {i.label}
                    <span className="sr-only">{i.ok ? ' - complete' : ' - needs attention'}</span>
                  </p>
                  <p className="text-[12px] text-gray-500">{i.detail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onGoTo(i.step)}
                  className="text-[12px] font-bold text-navy-700 hover:underline"
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {complete && mode === 'page' ? (
        <p className="text-[13px] text-success">
          Organisation setup completed{record?.completedBy ? ` by ${record.completedBy}` : ''}
          {record?.completedAt ? ` on ${record.completedAt.slice(0, 10)}` : ''}.
        </p>
      ) : (
        <StepFooter mode={mode} onBack={onBack} onSubmit={onComplete} submitLabel="Complete setup" />
      )}
    </div>
  );
}

export const STEP_ORDER = ORG_STEPS;
