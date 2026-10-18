/**
 * The six steps of an Affiliate Admin's guided setup (/welcome/affiliate). Each step saves straight to the
 * real tables (the affiliate row, its data sources, app_users, dimension members, approvals) - never to a
 * draft - and the wizard records progress per step on the 'AFF:<code>' onboarding record.
 */
import { useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { LedgerCheckPanel } from '@/components/data/LedgerCheckPanel';
import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ROLES, canonicalRole, useAuth } from '@/context/AuthContext';
import {
  useBatches,
  useDimensionMembers,
  useEconomicIndicators,
  useFxRates,
  useHolidayCalendars,
  usePositions,
  useSaveAffiliate,
  useSaveDimensionMembers,
  useUsers,
  useYieldCurves,
} from '@/lib/hooks';
import { useDataSources, useLobby, useSaveDataSource } from '@/lib/sourceHooks';
import { availableFor, useConnectors } from '@/lib/connectorHooks';
import { useSettings } from '@/lib/onboardingHooks';
import { effectiveSetting, ORG_SETTING, ORG_SETTING_DEFAULTS, type AffiliateStep } from '@/lib/onboarding';
import { useLimitConfigs } from '@/lib/limitHooks';
import { useRules } from '@/lib/ruleHooks';
import { approvals, newApprovalRequest } from '@/lib/governanceHooks';
import { admittedLedger } from '@/lib/sourceIngest';
import { sourceKindLabel } from '@/lib/dataSources';
import { currentBatch, positionBookReadiness } from '@/engine/vintage';
import { deriveMembersFromFile } from '@/engine/dimensions';
import { METRIC_LABEL, REGULATORY_MINIMA } from '@/engine/limits';
import { TP_METHOD_LABELS } from '@/engine/ftp';
import { formatAmount, formatDate } from '@/lib/format';
import { UploadDataModal } from '@/components/data/UploadDataModal';
import {
  AssignExistingUser,
  BulkUserUpload,
  CreatedLoginsNotice,
  InviteUserForm,
  type CreatedLogin,
} from '@/components/users/UserProvisioning';
import { btnSecondary, Card, input, label, StepFooter, type StepMeta } from './orgSteps';
import type {
  ActiveRoleCode,
  Affiliate,
  Connector,
  DataSource,
  DimensionMember,
  InternalThreshold,
  SourceConnectorType,
} from '@/engine/types';

export const AFFILIATE_STEP_META: Record<AffiliateStep, StepMeta> = {
  confirm: {
    title: 'Confirm affiliate',
    what: 'Check the details your Organisation Admin entered for this affiliate.',
    why: 'Every report, run and limit is labelled with them.',
    needed:
      'Nothing new - correct the name or calendar if needed. Country, regulator and currency are set by the organisation.',
    next: 'Say how this affiliate’s data will arrive.',
  },
  dataSources: {
    title: 'Data sources',
    what: 'Choose how each data source arrives - Loans, Deposits and Treasury positions, the general ledger, and balance and account history.',
    why: 'Every calculation reads the positions; the ledger checks they add up; the history feeds the behavioural models.',
    needed:
      'For each: file upload or a connector, who owns it, and a sample file to match columns (or skip). Market data comes from Group - nothing to do.',
    next: 'Add the people who will work on this affiliate.',
  },
  users: {
    title: 'Users',
    what: 'Give your team access: ALM Analysts load data and run calculations, Approvers sign off, Viewers read results.',
    why: 'Sign-offs need a second person - you cannot approve your own work.',
    needed: 'Assign people who already have a sign-in, invite new ones, or upload a list.',
    next: 'Review the settings this affiliate inherits.',
  },
  configuration: {
    title: 'Configuration',
    what: 'See what this affiliate inherits from the organisation, and set your own risk thresholds.',
    why: 'Thresholds decide when a ratio shows amber or red for this affiliate.',
    needed: 'Keep the organisation thresholds or tighten them. Loosening one needs a Group approver.',
    next: 'Load the first data.',
  },
  initialData: {
    title: 'Initial data',
    what: 'Upload your first Loans, Deposits, Treasury and general ledger files, and map your GL codes to the common chart of accounts.',
    why: 'Nothing can be calculated until data is loaded and checked.',
    needed:
      'The Loans, Deposits, Treasury and general ledger files for the same date. The mapping is suggested for you.',
    next: 'Check readiness and ask for go-live.',
  },
  readiness: {
    title: 'Readiness check',
    what: 'A final check that everything needed to go live is in place.',
    why: 'Going live includes this affiliate in Group results, so an approver confirms it first.',
    needed: 'Everything below ticked, then Submit for activation.',
    next: 'An approver approves, the affiliate goes Live, and you land on your affiliate’s Home.',
  },
};

export interface AffStepProps {
  affiliate: Affiliate;
  onBack?: () => void;
  onContinue: () => Promise<void>;
}

const Inherited = () => <StatusBadge status="Inherited ✓" tone="success" />;

// ─── Step 1: Confirm affiliate ──────────────────────────────────────────────

export function ConfirmStep({ affiliate, onBack, onContinue }: AffStepProps) {
  const save = useSaveAffiliate();
  const { data: calendars = [] } = useHolidayCalendars();
  const [name, setName] = useState(affiliate.name);
  const [timezone, setTimezone] = useState(affiliate.reportingTimezone ?? '');
  const [calendarId, setCalendarId] = useState(affiliate.holidayCalendarId ?? '');
  const fixed: Array<[string, string]> = [
    ['Code', affiliate.code],
    ['Country', affiliate.country || '-'],
    ['Regulator', affiliate.regulator || '-'],
    ['Functional currency', affiliate.functionalCurrency || '-'],
    ['Reports into Group in', affiliate.reportingCurrency || '-'],
    ['Legal entity', affiliate.legalEntityCode || '-'],
  ];
  const submit = async () => {
    await save.mutateAsync({
      ...affiliate,
      name: name.trim() || affiliate.name,
      reportingTimezone: timezone.trim() || undefined,
      holidayCalendarId: calendarId || null,
    });
    await onContinue();
  };
  return (
    <div className="space-y-4">
      <Card title="Set by your organisation" description="Ask your Organisation Admin if any of these are wrong.">
        <dl className="grid grid-cols-2 gap-3 text-[13px] md:grid-cols-3">
          {fixed.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{k}</dt>
              <dd className="font-medium text-navy-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="Yours to confirm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="aff-name" className={label}>
              Affiliate name
            </label>
            <input id="aff-name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="aff-tz" className={label}>
              Time zone (optional)
            </label>
            <input
              id="aff-tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. Africa/Lagos"
              className={input}
            />
          </div>
          <div>
            <label htmlFor="aff-cal" className={label}>
              Holiday calendar (optional)
            </label>
            <select id="aff-cal" value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className={input}>
              <option value="">- none -</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>
      <StepFooter mode="wizard" onBack={onBack} onSubmit={submit} disabled={!name.trim()} />
    </div>
  );
}

// ─── Step 2: Data sources ───────────────────────────────────────────────────

/** How a connector's protocol shows on a source. */
function connectorTypeOf(c: Connector): SourceConnectorType {
  if (c.protocol === 'SFTP' || c.protocol === 'FileDrop') return 'SFTP';
  if (c.protocol === 'JDBC') return 'Database';
  return 'API';
}

/** The affiliate's own active sources (positions and general ledger). */
function useOwnSources(code: string): DataSource[] {
  const { data: sources = [] } = useDataSources();
  return useMemo(() => sources.filter((s) => s.affiliateCode === code && s.isActive), [sources, code]);
}

interface SourceDraft {
  how: 'file' | 'connector';
  connectorId: string;
  owner: string;
}

export function DataSourcesStep({ affiliate, onBack, onContinue }: AffStepProps) {
  const sources = useOwnSources(affiliate.code);
  const { data: connectors = [] } = useConnectors();
  const saveSource = useSaveDataSource();
  const saveAffiliate = useSaveAffiliate();
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<Record<string, SourceDraft>>({});
  const draftFor = (s: DataSource): SourceDraft =>
    drafts[s.id] ?? {
      how: s.connectorType === 'ManualUpload' ? 'file' : 'connector',
      connectorId: s.connectorId ?? '',
      owner: s.owner,
    };
  const setDraft = (s: DataSource, patch: Partial<SourceDraft>) =>
    setDrafts((d) => ({ ...d, [s.id]: { ...draftFor(s), ...patch } }));
  const incomplete = sources.some((s) => draftFor(s).how === 'connector' && !draftFor(s).connectorId);

  const submit = async () => {
    const now = new Date().toISOString();
    let feeds = affiliate.feeds;
    for (const s of sources) {
      const d = draftFor(s);
      const connector = d.how === 'connector' ? connectors.find((c) => c.id === d.connectorId) : undefined;
      await saveSource.mutateAsync({
        ...s,
        connectorType: connector ? connectorTypeOf(connector) : 'ManualUpload',
        connectorId: connector?.id ?? null,
        owner: d.owner.trim(),
        updatedAt: now,
        updatedBy: user?.name ?? 'unknown',
      });
      if (s.domain === 'Positions' || s.domain === 'GeneralLedger') {
        const existing = feeds.find((f) => f.domain === s.domain);
        const feed = {
          domain: s.domain,
          mode: connector ? ('Connector' as const) : ('File' as const),
          connectorId: connector?.id ?? null,
          slaDays: existing?.slaDays ?? 30,
          owner: d.owner.trim() || null,
        };
        feeds = [...feeds.filter((f) => f.domain !== s.domain), feed];
      }
    }
    await saveAffiliate.mutateAsync({ ...affiliate, feeds });
    await onContinue();
  };

  return (
    <div className="space-y-4">
      <Card title="Your data sources">
        {sources.length === 0 ? (
          <p className="text-[13px] text-gray-500">
            No data sources found for this affiliate. Ask your Organisation Admin.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sources.map((s) => {
              const d = draftFor(s);
              const usable = availableFor(connectors, s.domain as never);
              return (
                <li key={s.id} className="grid grid-cols-1 gap-3 py-3 md:grid-cols-[1fr_1fr_1fr]">
                  <div>
                    <p className="text-[13px] font-bold text-navy-900">{s.name}</p>
                    <p className="text-[12px] text-gray-500">{sourceKindLabel(s)}</p>
                  </div>
                  <div>
                    <span className={label}>Arrives by</span>
                    <div className="flex gap-3 text-[13px]">
                      <label className="flex items-center gap-1.5">
                        <input type="radio" checked={d.how === 'file'} onChange={() => setDraft(s, { how: 'file' })} />{' '}
                        File upload
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          checked={d.how === 'connector'}
                          onChange={() => setDraft(s, { how: 'connector' })}
                        />{' '}
                        Connector
                      </label>
                    </div>
                    {d.how === 'connector' &&
                      (usable.length === 0 ? (
                        <p className="mt-1 text-[12px] text-warning">
                          No connector is set up for this yet - use file upload for now.
                        </p>
                      ) : (
                        <select
                          aria-label={`${s.name} connector`}
                          value={d.connectorId}
                          onChange={(e) => setDraft(s, { connectorId: e.target.value })}
                          className={`${input} mt-1`}
                        >
                          <option value="">- choose -</option>
                          {usable.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      ))}
                  </div>
                  <div>
                    <label htmlFor={`owner-${s.id}`} className={label}>
                      Owner
                    </label>
                    <input
                      id={`owner-${s.id}`}
                      value={d.owner}
                      onChange={(e) => setDraft(s, { owner: e.target.value })}
                      placeholder="Team or person"
                      className={input}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <StepFooter mode="wizard" onBack={onBack} onSubmit={submit} disabled={incomplete || sources.length === 0} />
    </div>
  );
}

// ─── Step 3: Users ──────────────────────────────────────────────────────────

/** Roles an Affiliate Admin hands out - never another admin. */
const AFFILIATE_TEAM_ROLES: ActiveRoleCode[] = ['RISK_ANALYST', 'APPROVER', 'EXECUTIVE_VIEWER'];

export function UsersStep({ affiliate, onBack, onContinue }: AffStepProps) {
  const { user: me, hasPermission } = useAuth();
  const { data: users = [] } = useUsers();
  const [panel, setPanel] = useState<'invite' | 'assign' | 'bulk' | null>(null);
  const [created, setCreated] = useState<CreatedLogin[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const team = users.filter((u) => u.affiliateCode === affiliate.code);
  const isOrgAdmin = hasPermission('admin.manage');
  // An Affiliate Admin can only manage their own affiliate's non-admin users; the Organisation Admin anyone but another Organisation Admin.
  const candidates = users.filter(
    (u) =>
      u.id !== me?.id &&
      canonicalRole(u.role) !== 'ADMIN' &&
      (isOrgAdmin ? true : u.affiliateCode === affiliate.code && canonicalRole(u.role) !== 'AFFILIATE_ADMIN'),
  );
  const has = (role: ActiveRoleCode) => team.some((u) => u.isActive && canonicalRole(u.role) === role);
  const emails = users.map((u) => u.email.toLowerCase());

  return (
    <div className="space-y-4">
      <CreatedLoginsNotice created={created} onDone={() => setCreated([])} />
      {message && (
        <div role="status" className="rounded-xl border border-success/30 bg-success-bg p-3 text-[13px] text-navy-900">
          {message}{' '}
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="ml-2 text-[12px] font-bold text-navy-700 hover:underline"
          >
            Done
          </button>
        </div>
      )}
      <Card
        title={`${affiliate.name} team (${team.length})`}
        description="Recommended: at least one ALM Analyst and one Approver."
      >
        <ul className="divide-y divide-gray-50">
          {team.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2 text-[13px]">
              <span>
                <span className="font-medium text-navy-900">{u.name}</span>{' '}
                <span className="font-mono text-[11px] text-gray-400">{u.email}</span>
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge status={ROLES[canonicalRole(u.role)]?.name ?? u.role} tone="neutral" />
                {!u.isActive && <StatusBadge status="Disabled" tone="neutral" />}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex flex-wrap gap-2 text-[12px]">
          <StatusBadge
            status={has('RISK_ANALYST') ? 'ALM Analyst ✓' : 'No ALM Analyst yet'}
            tone={has('RISK_ANALYST') ? 'success' : 'warning'}
          />
          <StatusBadge
            status={has('APPROVER') ? 'Approver ✓' : 'No Approver yet'}
            tone={has('APPROVER') ? 'success' : 'warning'}
          />
        </p>
        {panel === null && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={() => setPanel('assign')}>
              Assign existing user
            </button>
            <button type="button" className={btnSecondary} onClick={() => setPanel('invite')}>
              Invite new user
            </button>
            <button type="button" className={btnSecondary} onClick={() => setPanel('bulk')}>
              Upload a list (CSV)
            </button>
          </div>
        )}
        {panel === 'assign' && (
          <AssignExistingUser
            title={`Give an existing user a role in ${affiliate.name}`}
            candidates={candidates}
            affiliateCode={affiliate.code}
            roles={AFFILIATE_TEAM_ROLES}
            onCancel={() => setPanel(null)}
            onAssigned={(u) => {
              setPanel(null);
              setMessage(`${u.name} is now ${ROLES[canonicalRole(u.role)].name} for ${affiliate.name}.`);
            }}
          />
        )}
        {panel === 'invite' && (
          <InviteUserForm
            title={`Invite someone to ${affiliate.name}`}
            affiliateCode={affiliate.code}
            roles={AFFILIATE_TEAM_ROLES}
            existingEmails={emails}
            onCancel={() => setPanel(null)}
            onCreated={(c) => {
              setPanel(null);
              setCreated([c]);
            }}
          />
        )}
        {panel === 'bulk' && (
          <BulkUserUpload
            fixedAffiliateCode={affiliate.code}
            affiliates={[affiliate]}
            roles={AFFILIATE_TEAM_ROLES}
            existingEmails={emails}
            onCancel={() => setPanel(null)}
            onCreated={(c) => {
              setPanel(null);
              setCreated(c);
            }}
          />
        )}
      </Card>
      <StepFooter mode="wizard" onBack={onBack} onSubmit={onContinue} submitLabel="Continue" />
    </div>
  );
}

// ─── Step 4: Configuration ──────────────────────────────────────────────────

type Tightness = 'Inherited' | 'Tighter' | 'Looser';

export function ConfigurationStep({ affiliate, onBack, onContinue }: AffStepProps) {
  const { user } = useAuth();
  const { data: settings = [] } = useSettings();
  const { data: allLimits = [] } = useLimitConfigs('GROUP');
  const saveAffiliate = useSaveAffiliate();
  const raise = approvals.useSave();
  const { data: requests = [] } = approvals.useList(affiliate.code);
  const minima = REGULATORY_MINIMA[affiliate.regulator] ?? {};
  // The organisation's own floor-style limits are the ones an affiliate's thresholds sit on.
  const groupLimits = allLimits.filter(
    (l) => l.affiliateCode === null && l.isActive && l.direction === 'higher-is-better',
  );
  const [draft, setDraft] = useState<Record<string, InternalThreshold>>(() =>
    Object.fromEntries(
      groupLimits.map((l) => [
        l.metricKey,
        affiliate.internalThresholds[l.metricKey] ?? { amberPercent: l.amberThreshold, redPercent: l.redThreshold },
      ]),
    ),
  );
  const valueFor = (key: string, fallback: InternalThreshold) =>
    draft[key] ?? affiliate.internalThresholds[key] ?? fallback;

  const rows = groupLimits.map((l) => {
    const t = valueFor(l.metricKey, { amberPercent: l.amberThreshold, redPercent: l.redThreshold });
    const tightness: Tightness =
      t.amberPercent === l.amberThreshold && t.redPercent === l.redThreshold
        ? 'Inherited'
        : t.amberPercent < l.amberThreshold || t.redPercent < l.redThreshold
          ? 'Looser'
          : 'Tighter';
    const minimum = minima[l.metricKey] ?? l.regulatoryMinimum ?? null;
    const error =
      minimum !== null && t.redPercent < minimum
        ? `Red cannot go below the regulatory minimum (${minimum}%).`
        : t.amberPercent < t.redPercent
          ? 'Amber must be at or above red.'
          : null;
    const pending = requests.some(
      (r) => r.status === 'Pending' && r.module === 'Limits' && r.entityId === `${affiliate.code}:${l.metricKey}`,
    );
    return { limit: l, t, tightness, minimum, error, pending };
  });
  const errors = rows.filter((r) => r.error);

  const settingRows: Array<{ label: string; key: string; show: (v: unknown) => string }> = [
    { label: 'Reporting cycle', key: ORG_SETTING.cycleFrequency, show: (v) => String(v) },
    {
      label: 'Month-end',
      key: ORG_SETTING.monthEndConvention,
      show: (v) => (v === 'LastCalendarDay' ? 'Last calendar day' : 'Last business day'),
    },
    {
      label: 'Transfer pricing method',
      key: ORG_SETTING.ftpMethod,
      show: (v) => TP_METHOD_LABELS[v as keyof typeof TP_METHOD_LABELS] ?? String(v),
    },
    {
      label: 'Liquidity premium in transfer pricing',
      key: ORG_SETTING.ftpLiquidityPremium,
      show: (v) => (v ? 'Yes' : 'No'),
    },
  ];

  const submit = async () => {
    // Tightening (or keeping) saves straight away; loosening keeps the organisation value and asks a Group approver.
    const thresholds: Record<string, InternalThreshold> = { ...affiliate.internalThresholds };
    for (const r of rows) {
      if (r.tightness === 'Looser') {
        thresholds[r.limit.metricKey] = { amberPercent: r.limit.amberThreshold, redPercent: r.limit.redThreshold };
        if (!r.pending && user) {
          await raise.mutateAsync(
            newApprovalRequest(
              {
                module: 'Limits',
                entityType: 'Limit threshold',
                entityId: `${affiliate.code}:${r.limit.metricKey}`,
                entityLabel: `${affiliate.name} - ${METRIC_LABEL[r.limit.metricKey] ?? r.limit.label}`,
                action: 'Override',
                summary: `Loosen ${METRIC_LABEL[r.limit.metricKey] ?? r.limit.label} for ${affiliate.name}: amber ${r.t.amberPercent}% / red ${r.t.redPercent}% (organisation default amber ${r.limit.amberThreshold}% / red ${r.limit.redThreshold}%).`,
                affiliateCode: affiliate.code,
              },
              user,
            ),
          );
        }
      } else {
        thresholds[r.limit.metricKey] = r.t;
      }
    }
    await saveAffiliate.mutateAsync({ ...affiliate, internalThresholds: thresholds, limitsConfirmed: true });
    await onContinue();
  };

  const tone = (t: Tightness) => (t === 'Inherited' ? 'success' : t === 'Tighter' ? 'info' : 'warning');

  return (
    <div className="space-y-4">
      <Card
        title="Organisation defaults"
        description="Set once by your organisation. Ask your Organisation Admin to change them."
      >
        <ul className="divide-y divide-gray-50 text-[13px]">
          {settingRows.map((s) => {
            const eff = effectiveSetting(
              s.key,
              affiliate.code,
              settings,
              ORG_SETTING_DEFAULTS[s.key as keyof typeof ORG_SETTING_DEFAULTS],
            );
            return (
              <li key={s.key} className="flex items-center justify-between py-2">
                <span className="text-gray-600">{s.label}</span>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-navy-900">{s.show(eff.value)}</span>
                  {eff.source === 'Affiliate' ? <StatusBadge status="Overridden" tone="warning" /> : <Inherited />}
                </span>
              </li>
            );
          })}
          <li className="flex items-center justify-between py-2">
            <span className="text-gray-600">Assumptions & rules</span>
            <span className="flex items-center gap-2">
              <span className="font-medium text-navy-900">
                {affiliate.inheritGroupRules ? 'Organisation rules' : 'Own rules'}
              </span>
              {affiliate.inheritGroupRules ? <Inherited /> : <StatusBadge status="Overridden" tone="warning" />}
            </span>
          </li>
          <li className="flex items-center justify-between py-2">
            <span className="text-gray-600">Market data</span>
            <span className="flex items-center gap-2">
              <span className="font-medium text-navy-900">Loaded by Group</span>
              <Inherited />
            </span>
          </li>
        </ul>
      </Card>

      <Card
        title="Risk thresholds"
        description="When a ratio turns amber or red for this affiliate. Raise them (tighter) freely; lowering one below the organisation default sends it to a Group approver and keeps the default until approved."
      >
        {rows.length === 0 ? (
          <p className="text-[13px] text-gray-500">The organisation has no thresholds set yet - the defaults apply.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="py-2 pr-3">Measure</th>
                <th className="py-2 pr-3">Organisation (amber / red)</th>
                <th className="py-2 pr-3">This affiliate - amber %</th>
                <th className="py-2 pr-3">red %</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={r.limit.metricKey} className="align-top">
                  <td className="py-2 pr-3 font-medium text-navy-900">
                    {METRIC_LABEL[r.limit.metricKey] ?? r.limit.label}
                    {r.minimum !== null && (
                      <span className="block text-[11px] font-normal text-gray-400">
                        Regulatory minimum {r.minimum}%
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-gray-600">
                    {r.limit.amberThreshold}% / {r.limit.redThreshold}%
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      aria-label={`${r.limit.metricKey} amber`}
                      value={r.t.amberPercent}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [r.limit.metricKey]: { ...r.t, amberPercent: Number(e.target.value) },
                        }))
                      }
                      className={`${input} w-24 font-mono`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      aria-label={`${r.limit.metricKey} red`}
                      value={r.t.redPercent}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [r.limit.metricKey]: { ...r.t, redPercent: Number(e.target.value) } }))
                      }
                      className={`${input} w-24 font-mono`}
                    />
                  </td>
                  <td className="py-2">
                    <StatusBadge
                      status={
                        r.tightness === 'Inherited'
                          ? 'Inherited ✓'
                          : r.tightness === 'Tighter'
                            ? 'Tighter (yours)'
                            : r.pending
                              ? 'Awaiting approval'
                              : 'Looser - needs approval'
                      }
                      tone={tone(r.tightness)}
                    />
                    {r.error && <p className="mt-1 text-[11px] text-danger">{r.error}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <StepFooter mode="wizard" onBack={onBack} onSubmit={submit} disabled={errors.length > 0} />
    </div>
  );
}

// ─── Step 5: Initial data ───────────────────────────────────────────────────

/** Latest date with an admitted general ledger for the affiliate. */
function latestDate(
  batches: { affiliateCode: string; domain: string; status: string; asOfDate: string }[],
  code: string,
  domain: string,
): string | null {
  return (
    batches
      .filter((b) => b.affiliateCode === code && b.domain === domain && b.status === 'Committed')
      .map((b) => b.asOfDate)
      .sort()
      .at(-1) ?? null
  );
}

/**
 * GL -> common chart of accounts: every local GL code in the admitted ledger and positions, with a suggested
 * common COA code - the one the positions file most often pairs it with, else an existing mapping.
 */
function CoaMapping({ affiliate }: { affiliate: Affiliate }) {
  const { data: batches = [] } = useBatches();
  const glDate = latestDate(batches, affiliate.code, 'GeneralLedger');
  const posDate = latestDate(batches, affiliate.code, 'Positions');
  const date = glDate ?? posDate ?? undefined;
  const { data: positions = [] } = usePositions(affiliate.code, date);
  const { data: ledger } = useQuery({
    queryKey: ['onboardingLedger', affiliate.code, glDate, batches.length],
    queryFn: () => (glDate ? admittedLedger(affiliate.code, glDate, batches) : Promise.resolve(null)),
  });
  const { data: groupCoa = [] } = useDimensionMembers('CommonCoa', 'GROUP');
  const { data: ownCoa = [] } = useDimensionMembers('CommonCoa', affiliate.code);
  const { data: glAccounts = [] } = useDimensionMembers('GlAccount', affiliate.code);
  const saveGl = useSaveDimensionMembers('GlAccount');
  const saveCoa = useSaveDimensionMembers('CommonCoa');
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reference = (ownCoa.length > 0 ? ownCoa : groupCoa).filter((m) => m.isLeaf);
  const lines = useMemo(() => {
    const balance = new Map<string, number>();
    for (const l of ledger?.lines ?? [])
      balance.set(l.glAccountCode, (balance.get(l.glAccountCode) ?? 0) + l.endingBalance);
    const pairs = new Map<string, Map<string, number>>();
    for (const p of positions) {
      if (!p.glAccountCode) continue;
      if (!balance.has(p.glAccountCode)) balance.set(p.glAccountCode, balance.get(p.glAccountCode) ?? 0);
      if (!p.commonCoaCode) continue;
      const m = pairs.get(p.glAccountCode) ?? new Map<string, number>();
      m.set(p.commonCoaCode, (m.get(p.commonCoaCode) ?? 0) + 1);
      pairs.set(p.glAccountCode, m);
    }
    return [...balance.keys()].sort().map((code) => {
      const existing = glAccounts.find((g) => g.code === code)?.attributes?.commonCoa as string | undefined;
      const fromFile = [...(pairs.get(code)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        code,
        balance: balance.get(code) ?? 0,
        existing: existing ?? null,
        suggested: existing ?? fromFile ?? '',
      };
    });
  }, [ledger, positions, glAccounts]);

  const pick = (code: string, fallback: string) => choice[code] ?? fallback;
  const toSave = lines.filter((l) => pick(l.code, l.suggested) && pick(l.code, l.suggested) !== l.existing);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // The affiliate's own copy of the common chart of accounts, made on its first mapping (same as the onboarding wizard).
      if (ownCoa.length === 0 && groupCoa.length > 0) {
        await saveCoa.mutateAsync(
          groupCoa.map((m) => ({ ...m, id: `CommonCoa:${affiliate.code}:${m.code}`, affiliateCode: affiliate.code })),
        );
      }
      const codes = toSave.map((l) => l.code);
      const derived = deriveMembersFromFile('GlAccount', codes, positions, affiliate.code, affiliate.name);
      const members: DimensionMember[] = derived
        .filter((m) => (!m.isLeaf ? !glAccounts.some((g) => g.code === m.code) : true))
        .map((m) => {
          if (!m.isLeaf) return m;
          const current = glAccounts.find((g) => g.code === m.code);
          return {
            ...(current ?? m),
            attributes: {
              ...(current?.attributes ?? {}),
              commonCoa: pick(m.code, toSave.find((l) => l.code === m.code)!.suggested),
            },
          };
        });
      await saveGl.mutateAsync(members);
      setSaved(`${codes.length} GL code(s) mapped.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the mapping.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Map your GL codes to the common chart of accounts"
      description="So your figures line up with every other affiliate's. Suggestions come from your positions file - check them and save."
    >
      {lines.length === 0 ? (
        <p className="text-[13px] text-gray-500">
          Upload your general ledger (or positions) first - the GL codes will appear here.
        </p>
      ) : reference.length === 0 ? (
        <p className="text-[13px] text-warning">
          The organisation has no common chart of accounts yet - ask your Organisation Admin to load it.
        </p>
      ) : (
        <>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="py-2 pr-3">Your GL code</th>
                  <th className="py-2 pr-3 text-right">Ledger balance</th>
                  <th className="py-2 pr-3">Common chart of accounts</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map((l) => {
                  const value = pick(l.code, l.suggested);
                  return (
                    <tr key={l.code}>
                      <td className="py-1.5 pr-3 font-mono">{l.code}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">
                        {formatAmount(l.balance, affiliate.functionalCurrency || 'USD')}
                      </td>
                      <td className="py-1.5 pr-3">
                        <select
                          aria-label={`Common COA for ${l.code}`}
                          value={value}
                          onChange={(e) => setChoice((c) => ({ ...c, [l.code]: e.target.value }))}
                          className={input}
                        >
                          <option value="">- choose -</option>
                          {reference.map((m) => (
                            <option key={m.code} value={m.code}>
                              {m.code} - {m.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5">
                        {l.existing && value === l.existing ? (
                          <StatusBadge status="Mapped" tone="success" />
                        ) : value ? (
                          <StatusBadge
                            status={value === l.suggested && !choice[l.code] ? 'Suggested' : 'Changed'}
                            tone="info"
                          />
                        ) : (
                          <StatusBadge status="Not mapped" tone="warning" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || toSave.length === 0}
              className={btnSecondary}
            >
              {busy ? 'Saving…' : `Save mapping (${toSave.length})`}
            </button>
            {saved && <StatusBadge status={saved} tone="success" />}
            {error && (
              <p role="alert" className="text-[12px] text-danger">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export function InitialDataStep({ affiliate, onBack, onContinue }: AffStepProps) {
  const sources = useOwnSources(affiliate.code);
  const { data: batches = [] } = useBatches();
  const { data: lobby = [] } = useLobby();
  const [uploading, setUploading] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const glSource = sources.find((s) => s.domain === 'GeneralLedger');

  return (
    <div className="space-y-4">
      <Card
        title="Upload your first files"
        description="Each file is checked before anything is saved. Admit it to load it."
      >
        <ul className="divide-y divide-gray-50 text-[13px]">
          {sources.map((s) => {
            const last = latestDate(
              batches.filter((b) => !s.contributor || b.contributor === s.contributor),
              affiliate.code,
              s.domain,
            );
            const waiting = lobby.filter((l) => l.sourceId === s.id).length;
            return (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="font-medium text-navy-900">{s.name}</span>
                <span className="flex items-center gap-2">
                  {waiting > 0 && <StatusBadge status={`${waiting} waiting to be admitted`} tone="warning" />}
                  {last ? (
                    <StatusBadge status={`Loaded for ${formatDate(last)}`} tone="success" />
                  ) : (
                    <StatusBadge status="Not loaded yet" tone="neutral" />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={btnSecondary}
            onClick={() => setUploading(true)}
            disabled={sources.length === 0}
          >
            Upload files
          </button>
          {glSource && (
            <button type="button" onClick={() => setLedgerOpen(true)} className={btnSecondary}>
              Open the ledger check
            </button>
          )}
        </div>
      </Card>
      <CoaMapping affiliate={affiliate} />
      <StepFooter mode="wizard" onBack={onBack} onSubmit={onContinue} submitLabel="Continue" />
      {uploading && <UploadDataModal sources={sources} groupView={false} onClose={() => setUploading(false)} />}
      {ledgerOpen && (
        <Drawer title="Ledger check" onClose={() => setLedgerOpen(false)} wide>
          <LedgerCheckPanel affiliate={affiliate} />
        </Drawer>
      )}
    </div>
  );
}

// ─── Step 6: Readiness ──────────────────────────────────────────────────────

export interface ReadinessItem {
  label: string;
  ok: boolean;
  detail: string;
  step?: AffiliateStep;
}

export function useAffiliateReadiness(
  affiliate: Affiliate,
  record: { steps: Record<string, { done: boolean } | undefined> } | null,
): ReadinessItem[] {
  const sources = useOwnSources(affiliate.code);
  const { data: batches = [] } = useBatches();
  const { data: fx = [] } = useFxRates();
  const { data: curves = [] } = useYieldCurves();
  const { data: indicators = [] } = useEconomicIndicators();
  const { data: buckets = [] } = useRules('TimeBucket');
  const fc = affiliate.functionalCurrency;
  const rc = affiliate.reportingCurrency;
  const posDate = latestDate(batches, affiliate.code, 'Positions');
  const book = posDate ? positionBookReadiness(affiliate, batches, posDate) : null;
  const posBatches = book ? [book.legacyBatch, ...book.contributors.map((c) => c.batch)].filter((b) => b !== null) : [];
  const gl = posDate ? currentBatch(batches, affiliate.code, 'GeneralLedger', posDate) : null;
  const fxOk =
    !fc || fc === rc || fx.some((r) => (r.base === fc && r.quote === rc) || (r.base === rc && r.quote === fc));
  const curveOk = curves.some((c) => c.currency === fc);
  const configured = ['confirm', 'configuration'].every((s) => record?.steps[s]?.done) && affiliate.limitsConfirmed;
  const sourcesOk =
    sources.length >= 2 &&
    sources.every((s) => s.connectorType === 'ManualUpload' || !!s.connectorId) &&
    !!record?.steps.dataSources?.done;
  const reconciled = posBatches.length > 0 && posBatches.every((b) => !!b!.reconciledAt);
  return [
    {
      label: 'Affiliate configured',
      ok: configured,
      detail: configured ? 'Details and thresholds confirmed.' : 'Confirm the details and the configuration step.',
      step: configured ? undefined : 'configuration',
    },
    {
      label: 'Data sources set',
      ok: sourcesOk,
      detail: sourcesOk
        ? `${sources.length} sources: ${sources.map((s) => s.name).join(', ')}.`
        : 'Choose how positions and the general ledger arrive.',
      step: 'dataSources',
    },
    {
      label: 'Market data available',
      ok: fxOk && curveOk,
      detail:
        fxOk && curveOk
          ? `FX rate ${fc}/${rc} and a ${fc} yield curve are loaded by Group${indicators.length > 0 ? ', with policy rates' : ''}.`
          : `Waiting for Group to load ${[!fxOk ? `an FX rate ${fc}/${rc}` : null, !curveOk ? `a ${fc} yield curve` : null].filter(Boolean).join(' and ')}.`,
    },
    {
      label: 'Assumptions available',
      ok: buckets.some((r) => r.isActive && (r.affiliateCode === null || r.affiliateCode === affiliate.code)),
      detail: affiliate.inheritGroupRules
        ? 'Uses the organisation’s rules and assumptions.'
        : 'Uses this affiliate’s own rules.',
    },
    {
      label: 'Positions loaded',
      ok: !!book?.isComplete,
      detail: posDate
        ? `Positions admitted for ${formatDate(posDate)}${gl ? ', with the general ledger' : ' - general ledger not loaded for that date yet'}.`
        : 'Upload and admit a positions file.',
      step: 'initialData',
    },
    {
      label: 'Reconciled to the ledger',
      ok: reconciled,
      detail: reconciled
        ? 'The ledger check is signed off.'
        : gl
          ? 'Run and sign off the ledger check (Data → Sources → General ledger).'
          : 'Load the general ledger for the same date, then sign off the ledger check.',
      step: 'initialData',
    },
  ];
}

export function ReadinessStep({
  affiliate,
  record,
  onBack,
  onGoTo,
  onSubmitted,
}: {
  affiliate: Affiliate;
  record: { steps: Record<string, { done: boolean } | undefined> } | null;
  onBack?: () => void;
  onGoTo: (step: AffiliateStep) => void;
  onSubmitted: () => Promise<void>;
}) {
  const { user } = useAuth();
  const items = useAffiliateReadiness(affiliate, record);
  const raise = approvals.useSave();
  const { data: requests = [] } = approvals.useList(affiliate.code);
  const pending = requests.find((r) => r.status === 'Pending' && r.module === 'Affiliates' && r.action === 'Activate');
  const ready = items.every((i) => i.ok);

  const submit = async () => {
    if (!user) return;
    if (!pending) {
      await raise.mutateAsync(
        newApprovalRequest(
          {
            module: 'Affiliates',
            entityType: 'Affiliate',
            entityId: affiliate.code,
            entityLabel: affiliate.name,
            action: 'Activate',
            summary: `Setup complete for ${affiliate.name} - ready to go Live and be included in Group results.`,
            affiliateCode: affiliate.code,
          },
          user,
        ),
      );
    }
    await onSubmitted();
  };

  return (
    <div className="space-y-4">
      <Card title="Readiness">
        <ul className="divide-y divide-gray-50">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-3 py-3">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${i.ok ? 'bg-success text-white' : 'bg-warning-bg text-warning'}`}
              >
                {i.ok ? '✓' : '!'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-navy-900">
                  {i.label}
                  <span className="sr-only">{i.ok ? ' - ready' : ' - not ready'}</span>
                </p>
                <p className="text-[12px] text-gray-500">{i.detail}</p>
              </div>
              {!i.ok && i.step && (
                <button
                  type="button"
                  onClick={() => onGoTo(i.step!)}
                  className="text-[12px] font-bold text-navy-700 hover:underline"
                >
                  Fix
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {pending ? (
        <p className="rounded-xl border border-gray-100 bg-white p-4 text-[13px] text-navy-900">
          <StatusBadge status="Waiting for approval" tone="warning" /> Submitted by {pending.requestedBy}. An approver
          will review it under Approvals.
        </p>
      ) : (
        !ready && <p className="text-[12px] text-gray-500">Everything above must be ticked before you can submit.</p>
      )}
      <StepFooter
        mode="wizard"
        onBack={onBack}
        onSubmit={submit}
        disabled={!ready && !pending}
        submitLabel={pending ? 'Finish' : 'Submit for activation'}
      />
    </div>
  );
}
