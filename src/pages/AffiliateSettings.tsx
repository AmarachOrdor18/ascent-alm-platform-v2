import { useEffect, useMemo, useState } from 'react';
import { Link, Redirect, useLocation, useRoute, useSearch } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ShieldCheckIcon } from '@/components/icons/Icons';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useSaveAffiliate, useDeleteAffiliate, useHolidayCalendars } from '@/lib/hooks';
import { isRestrictedToOwnAffiliate } from '@/lib/scope';
import { approvals, newApprovalRequest } from '@/lib/governanceHooks';
import { legacySettingsSectionTarget } from '@/lib/rulePaths';
import { METRIC_LABEL, REGULATORY_MINIMA } from '@/engine/limits';
import type { AffiliateStatus, InternalThreshold } from '@/engine/types';

// Any move to Live is deliberately absent - Testing → Live and Suspended → Live only happen through an
// approved Affiliates/Activate request (the database applies it; see the security_onboarding migration).
const NEXT_STATUS: Record<AffiliateStatus, AffiliateStatus[]> = {
  Onboarding: ['Testing'],
  Testing: [],
  Live: ['Suspended'],
  Suspended: [],
};

interface Category {
  key: string;
  label: string;
}
interface Group {
  group: string;
  items: Category[];
}
// The affiliate page: profile and thresholds only. Readiness lives in Run & results, users in Admin, data
// sources in Data and rules in Assumptions - each in one place; old ?section= links land on Profile.
function buildNav(): Group[] {
  return [
    {
      group: 'AFFILIATE',
      items: [
        { key: 'profile', label: 'Profile' },
        { key: 'thresholds', label: 'Thresholds' },
      ],
    },
  ];
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-[14px] font-bold text-navy-900">{title}</h2>
      {description && <p className="mt-0.5 text-[12px] text-gray-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-0.5 block text-[13px] font-bold text-navy-900">{label}</label>
      {hint && <p className="mb-1 text-[12px] text-gray-500">{hint}</p>}
      {children}
    </div>
  );
}

/** Column mapping per source of this affiliate: which column of the affiliate's own file feeds each standard field. */

export function AffiliateSettings() {
  const [, params] = useRoute('/affiliates/:code/settings');
  const { user, hasPermission } = useAuth();
  const { setAffiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const save = useSaveAffiliate();
  const { data: calendars = [] } = useHolidayCalendars();
  const deleteAffiliate = useDeleteAffiliate();
  const [, navigate] = useLocation();
  const canManage = hasPermission('group.manage');
  const searchString = useSearch();
  // Lets a link/redirect deep-link straight to a category (e.g. `?section=connectors`) instead of
  // always landing on Profile - read once on mount, not resynced on every search-string change, so
  // navigating between categories in-page doesn't fight the URL.
  const [section, setSection] = useState(() => new URLSearchParams(searchString).get('section') || 'profile');
  // Click-throughs from the Group health matrix (and any other in-app link) arrive as a new
  // ?section= on the same route, so keep the in-page section in sync with the URL after mount.
  useEffect(() => {
    const next = new URLSearchParams(searchString).get('section');
    if (next === 'profile' || next === 'thresholds') setSection(next);
  }, [searchString]);

  const affiliate = affiliates.find((a) => a.code === params?.code);

  // Old sections now live elsewhere (rules → Assumptions, market data → Data → Market data, connections →
  // Data → Sources, notifications/audit → Admin): forward the old link there.
  const movedTo = affiliate ? legacySettingsSectionTarget(section, affiliate.code === 'GROUP') : null;
  useEffect(() => {
    if (movedTo) navigate(movedTo, { replace: true });
  }, [movedTo, navigate]);

  // ── Overview (absorbed from the old read-only AffiliateDetail/"View" page) ─────────────
  const { data: approvalRequests = [] } = approvals.useList(affiliate?.code);
  const pendingActivation = approvalRequests.find(
    (r) => r.status === 'Pending' && r.module === 'Affiliates' && r.action === 'Activate',
  );
  const raiseApproval = approvals.useSave();
  const requestReactivation = () => {
    if (!affiliate || !user || pendingActivation) return;
    raiseApproval.mutate(
      newApprovalRequest(
        {
          module: 'Affiliates',
          entityType: 'Affiliate',
          entityId: affiliate.code,
          entityLabel: affiliate.name,
          action: 'Activate',
          summary: `Reactivate ${affiliate.name} - move Suspended → Live so it consolidates into Group again.`,
          affiliateCode: affiliate.code,
        },
        user,
      ),
    );
  };

  // ── Profile draft ──────────────────────────────────────────────────────
  const [profileDraft, setProfileDraft] = useState<{
    name: string;
    country: string;
    effectiveDate: string;
    reportingTimezone: string;
  } | null>(null);
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
      next[key] = affiliate.internalThresholds[key] ?? {
        amberPercent: Math.round(minima[key]! * 1.1),
        redPercent: minima[key]!,
      };
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
      if (t.redPercent < min)
        errors.push(`${METRIC_LABEL[key] ?? key}: internal red cannot go below the regulatory minimum (${min}%).`);
      if (t.amberPercent < t.redPercent)
        errors.push(`${METRIC_LABEL[key] ?? key}: internal amber must be at or above internal red.`);
    }
    return errors;
  }, [thresholdDraft, minima]);
  const [thresholdsSaved, setThresholdsSaved] = useState(false);

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
          <p className="text-[14px] font-bold text-navy-900">Access restricted</p>
          <p className="mt-1 text-[13px] text-gray-500">You can only manage your own affiliate.</p>
        </div>
      </>
    );
  }

  // The organisation's own settings live on Admin → Organisation.
  if (affiliate.code === 'GROUP') return <Redirect to="/setup/organisation" />;
  const NAV = buildNav();

  return (
    <>
      <ModuleHeader
        title={
          <>
            {`Settings - ${affiliate.name}`}{' '}
            {affiliate.status !== 'Live' && <StatusBadge status={affiliate.status} tone="warning" />}
          </>
        }
        description="Profile, thresholds, users - and where its data and rules live."
        asOfDate={null}
        scope={affiliate.code}
        actions={
          <>
            {affiliate.status === 'Testing' && (
              <Link
                href="/controls"
                className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-bold text-navy-900 hover:border-navy-700"
              >
                {pendingActivation ? 'Pending approval - view in Approvals' : 'Raise activation in Approvals →'}
              </Link>
            )}
            <Link
              href="/execution/readiness"
              onClick={() => setAffiliateCode(affiliate.code)}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700"
            >
              Readiness →
            </Link>
          </>
        }
      />

      {affiliate.status !== 'Live' && (
        <div role="status" className="mb-6 rounded-lg bg-warning-bg px-4 py-3 text-[13px] leading-relaxed text-warning">
          <span className="font-bold">Not consolidating.</span> Only Live affiliates contribute to Group figures. A
          half-configured affiliate joining the Group balance sheet silently is exactly what this gate prevents.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-5 self-start lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">{g.group}</p>
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSection(item.key)}
                    className={`block w-full rounded-lg px-3 py-1.5 text-left text-[13px] font-medium ${
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
          {section === 'profile' && (
            <SettingsCard title="Profile" description="Basic information and contact details for this affiliate.">
              <Field label="Name">
                <input
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                  value={profileDraft.name}
                  disabled={!canManage}
                  onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })}
                />
              </Field>
              <Field label="Country">
                <input
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                  value={profileDraft.country}
                  disabled={!canManage}
                  onChange={(e) => setProfileDraft({ ...profileDraft, country: e.target.value })}
                />
              </Field>
              <Field label="Effective date" hint="When onboarding is/was targeted to take effect.">
                <input
                  type="date"
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                  value={profileDraft.effectiveDate}
                  disabled={!canManage}
                  onChange={(e) => setProfileDraft({ ...profileDraft, effectiveDate: e.target.value })}
                />
              </Field>
              <Field label="Reporting timezone" hint="IANA zone, e.g. Africa/Lagos.">
                <input
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] font-mono focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                  placeholder="Africa/Lagos"
                  value={profileDraft.reportingTimezone}
                  disabled={!canManage}
                  onChange={(e) => setProfileDraft({ ...profileDraft, reportingTimezone: e.target.value })}
                />
              </Field>
              <Field
                label="Holiday calendar"
                hint="Business days for settlement - a flow due on a holiday rolls to the next business day. Saves on change."
              >
                <select
                  aria-label="Holiday calendar"
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                  value={affiliate.holidayCalendarId ?? ''}
                  disabled={!canManage}
                  onChange={(e) => save.mutate({ ...affiliate, holidayCalendarId: e.target.value || null })}
                >
                  <option value="">{calendars.length === 0 ? '- none defined yet -' : '- not set -'}</option>
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {calendars.length === 0 && (
                  <Link
                    href="/data/market/calendars"
                    className="mt-1 inline-block text-[12px] font-bold text-navy-700 hover:underline"
                  >
                    Create one in Holiday calendars →
                  </Link>
                )}
              </Field>
              {canManage && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      save.mutate(
                        {
                          ...affiliate,
                          name: profileDraft.name,
                          country: profileDraft.country,
                          effectiveDate: profileDraft.effectiveDate || undefined,
                          reportingTimezone: profileDraft.reportingTimezone || undefined,
                        },
                        {
                          onSuccess: () => {
                            setProfileSaved(true);
                            window.setTimeout(() => setProfileSaved(false), 1500);
                          },
                        },
                      )
                    }
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700"
                  >
                    Save profile
                  </button>
                  {profileSaved && <StatusBadge status="Saved" tone="success" />}
                </div>
              )}

              {canManage && NEXT_STATUS[affiliate.status].length > 0 && (
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-gray-400">Status</p>
                  <div className="flex gap-2">
                    {NEXT_STATUS[affiliate.status].map((next) => (
                      <button
                        key={next}
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Move ${affiliate.name} to ${next}?`))
                            save.mutate({ ...affiliate, status: next });
                        }}
                        className={
                          next === 'Suspended'
                            ? 'rounded-lg bg-danger px-4 py-2 text-[13px] font-bold text-white hover:opacity-90'
                            : 'rounded-lg bg-success px-4 py-2 text-[13px] font-bold text-white hover:opacity-90'
                        }
                      >
                        {next === 'Suspended' ? 'Deactivate (move to Suspended)' : `Move to ${next}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {canManage && affiliate.status === 'Suspended' && (
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-gray-400">Status</p>
                  {pendingActivation ? (
                    <p className="text-[13px] text-gray-600">
                      Reactivation requested - awaiting a decision in{' '}
                      <Link href="/controls" className="font-bold text-navy-900 underline hover:no-underline">
                        Approvals
                      </Link>
                      .
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={requestReactivation}
                      disabled={raiseApproval.isPending}
                      className="rounded-lg bg-success px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
                    >
                      Request reactivation
                    </button>
                  )}
                  <p className="mt-2 text-[12px] text-gray-400">
                    Going Live again needs a second person&apos;s approval - the affiliate moves to Live once an
                    approver approves the request.
                  </p>
                  {raiseApproval.error && (
                    <p role="alert" className="mt-2 text-[12px] text-danger">
                      {raiseApproval.error instanceof Error ? raiseApproval.error.message : String(raiseApproval.error)}
                    </p>
                  )}
                </div>
              )}

              {canManage && (
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-gray-400">Danger zone</p>
                  <button
                    type="button"
                    onClick={() => {
                      const warning =
                        affiliate.status === 'Live'
                          ? `Delete ${affiliate.name}? It is Live - this removes the affiliate record but does NOT remove its committed positions, batches or dimension mappings, which would be left orphaned. This cannot be undone.`
                          : `Delete ${affiliate.name}? This removes the affiliate record but does NOT remove any batches, positions or dimension mappings already created for it, which would be left orphaned. This cannot be undone.`;
                      if (window.confirm(warning))
                        deleteAffiliate.mutate(affiliate, { onSuccess: () => navigate('/setup/organisation') });
                    }}
                    className="rounded-lg border border-danger px-4 py-2 text-[13px] font-bold text-danger hover:bg-danger hover:text-white"
                  >
                    Delete affiliate
                  </button>
                </div>
              )}
            </SettingsCard>
          )}

          {section === 'thresholds' && (
            <SettingsCard
              title="Thresholds"
              description="Regulatory minimum is fixed; internal amber/red are this affiliate's own appetite."
            >
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
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
                            {value}% <ShieldCheckIcon className="h-3 w-3 shrink-0 text-gray-400" />
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            value={t?.amberPercent ?? ''}
                            disabled={!canManage}
                            onChange={(e) =>
                              setThresholdDraft((prev) => ({
                                ...prev,
                                [metric]: { ...prev[metric]!, amberPercent: Number(e.target.value) },
                              }))
                            }
                            className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[12px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                          />
                          %
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            value={t?.redPercent ?? ''}
                            disabled={!canManage}
                            onChange={(e) =>
                              setThresholdDraft((prev) => ({
                                ...prev,
                                [metric]: { ...prev[metric]!, redPercent: Number(e.target.value) },
                              }))
                            }
                            className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[12px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                          />
                          %
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {thresholdErrors.length > 0 && (
                <ul className="mt-3 space-y-1 rounded border border-danger/30 bg-danger/5 p-3 text-[12px] text-danger">
                  {thresholdErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              {canManage && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={thresholdErrors.length > 0}
                    onClick={() =>
                      save.mutate(
                        { ...affiliate, internalThresholds: thresholdDraft, limitsConfirmed: true },
                        {
                          onSuccess: () => {
                            setThresholdsSaved(true);
                            window.setTimeout(() => setThresholdsSaved(false), 1500);
                          },
                        },
                      )
                    }
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  >
                    Save thresholds
                  </button>
                  {thresholdsSaved && <StatusBadge status="Saved" tone="success" />}
                </div>
              )}
            </SettingsCard>
          )}
        </div>
      </div>
    </>
  );
}
