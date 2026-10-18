import { Link } from 'wouter';
import { buildAssumptionLookup } from '@/engine/classification';
import { cn } from '@/lib/cn';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { WhoCanFix } from '@/components/readiness/WhoCanFix';
import { canonicalRole, useAuth } from '@/context/AuthContext';
import {
  useAffiliates,
  useBatches,
  useFxRates,
  useHolidayCalendars,
  usePositions,
  useUsers,
  useYieldCurves,
} from '@/lib/hooks';
import { useOnboardingRecord } from '@/lib/onboardingHooks';
import { ORG_ONBOARDING_ID, orgProgressPercent } from '@/lib/onboarding';
import { useRuns } from '@/lib/runHooks';
import { useRules } from '@/lib/ruleHooks';
import { approvals } from '@/lib/governanceHooks';
import { pickApprovedRule } from '@/lib/ruleApproval';
import type { ProductCharacteristicRule } from '@/engine/ruleTypes';
import type { RuleMeta } from '@/engine/types';

interface Item {
  key: string;
  title: string;
  /** What "done" means, in one plain sentence. */
  done: boolean;
  detail: string;
  href: string;
  action: string;
  permission: string;
  /** Organisation-wide work (Group market data, onboarding affiliates) - not shown to an affiliate admin. */
  orgOnly?: boolean;
}

/**
 * The order a new platform is brought to life in - each item is computed from live data, never
 * ticked by hand, so the checklist can't claim something is ready that isn't.
 */
export function SetupChecklist() {
  const { user, hasPermission } = useAuth();
  // Org admins see the organisation; an affiliate admin only their own affiliate; nobody else gets here
  // (the tab is gated on group.manage|affiliate.manage).
  const isOrgAdmin = hasPermission('group.manage');
  const ownCode = !isOrgAdmin && user?.affiliateCode !== 'GROUP' ? (user?.affiliateCode ?? null) : null;
  const { data: orgRecord } = useOnboardingRecord(isOrgAdmin ? ORG_ONBOARDING_ID : null);
  const { data: users = [] } = useUsers({ enabled: isOrgAdmin });
  const { data: allAffiliates = [] } = useAffiliates();
  const affiliates = ownCode ? allAffiliates.filter((a) => a.code === ownCode) : allAffiliates;
  const { data: fxRates = [] } = useFxRates();
  const { data: curves = [] } = useYieldCurves();
  const { data: calendars = [] } = useHolidayCalendars();
  const { data: batches = [] } = useBatches();
  const { data: runs = [] } = useRuns();
  const { data: behaviourRules = [] } = useRules<RuleMeta>('BehaviourPattern');
  const { data: productRules = [] } = useRules<ProductCharacteristicRule>('ProductCharacteristic');
  const { data: requests = [] } = approvals.useList();
  const { data: positions = [] } = usePositions(ownCode ?? undefined);

  const real = affiliates.filter((a) => a.code !== 'GROUP');
  const live = real.filter((a) => a.status === 'Live');

  const currencies = Array.from(new Set(real.flatMap((a) => [a.functionalCurrency, ...a.activeCurrencies]))).filter(
    (c) => c !== 'USD',
  );
  const missingFx = currencies.filter((c) => !fxRates.some((r) => r.base === c || r.quote === c));

  const functional = Array.from(new Set(real.map((a) => a.functionalCurrency)));
  const missingCurves = functional.filter((c) => !curves.some((cv) => cv.currency === c && cv.isActive));

  const withoutCalendar = real.filter(
    (a) => !a.holidayCalendarId || !calendars.some((c) => c.id === a.holidayCalendarId),
  );

  const committed = batches.filter((b) => b.domain === 'Positions' && b.status === 'Committed');
  const withoutPositions = live.filter((a) => !committed.some((b) => b.affiliateCode === a.code));
  const unreconciled = live.filter((a) => committed.some((b) => b.affiliateCode === a.code && !b.reconciledAt));

  // LCR and NSFR weight every position by its run-off rate / ASF-RSF factor. Those come either from the
  // uploaded file or from an approved Product Characteristics rule - with neither, both ratios are blank.
  const committedIds = new Set(committed.filter((b) => live.some((a) => a.code === b.affiliateCode)).map((b) => b.id));
  const unclassified = new Map<string, string[]>();
  for (const p of positions) {
    if (!committedIds.has(p.batchId)) continue;
    const hasFactor = p.category === 'Asset' ? p.rsfFactorPct !== null : p.asfFactorPct !== null;
    if (hasFactor) continue;
    const rule = pickApprovedRule(productRules, p.affiliateCode, requests);
    if (rule && buildAssumptionLookup(rule.assumptions)(p)) continue;
    const list = unclassified.get(p.affiliateCode) ?? [];
    if (!list.includes(p.productCode)) list.push(p.productCode);
    unclassified.set(p.affiliateCode, list);
  }
  const unclassifiedCodes = [...unclassified.values()].flat();

  const activeBehaviour = behaviourRules.filter((r) => r.isActive);
  const completedRuns = runs.filter((r) => r.status === 'Completed' && (!ownCode || r.affiliateCode === ownCode));

  const names = (list: { name: string }[]) => list.map((a) => a.name).join(', ');

  const allItems: Item[] = [
    {
      key: 'affiliate',
      title: 'Onboard an affiliate and make it Live',
      done: live.length > 0,
      detail:
        live.length > 0
          ? `${live.length} Live: ${names(live)}.`
          : real.some((a) => a.status === 'Testing')
            ? `Awaiting activation approval: ${names(real.filter((a) => a.status === 'Testing'))}. A second administrator approves it in Approve & report → Approvals.`
            : real.length > 0
              ? `${real.length} onboarding - finish the wizard, then a second administrator approves it in Approvals.`
              : 'No affiliates yet. The wizard covers profile, currencies, data sources, chart of accounts and limits.',
      href: real.some((a) => a.status === 'Testing')
        ? '/controls'
        : real.length > 0
          ? '/affiliates'
          : '/affiliates/onboard',
      action: real.some((a) => a.status === 'Testing')
        ? 'Open Approvals'
        : real.length > 0
          ? 'Open affiliates'
          : 'Onboard an affiliate',
      permission: 'group.manage',
      orgOnly: true,
    },
    {
      key: 'fx',
      title: 'Load FX rates for every currency in use',
      done: currencies.length > 0 && missingFx.length === 0,
      detail:
        currencies.length === 0
          ? 'Appears once an affiliate declares its currencies.'
          : missingFx.length === 0
            ? `All ${currencies.length} currencies have a rate.`
            : `Missing: ${missingFx.join(', ')}. A run fails rather than silently dropping a currency.`,
      href: '/data/market/fx',
      action: 'FX rates',
      permission: 'data.view',
      orgOnly: true,
    },
    {
      key: 'curves',
      title: 'Load a yield curve for each functional currency',
      done: functional.length > 0 && missingCurves.length === 0,
      detail:
        functional.length === 0
          ? 'Appears once an affiliate exists.'
          : missingCurves.length === 0
            ? `Curves in place for ${functional.join(', ')}.`
            : `Missing: ${missingCurves.join(', ')}. Needed for EVE discounting and the FTP base rate.`,
      href: '/data/market/curves',
      action: 'Yield curves',
      permission: 'data.view',
      orgOnly: true,
    },
    {
      key: 'calendars',
      title: 'Assign a holiday calendar to each affiliate',
      done: real.length > 0 && withoutCalendar.length === 0,
      detail:
        real.length === 0
          ? 'Appears once an affiliate exists.'
          : withoutCalendar.length === 0
            ? 'Every affiliate has one.'
            : calendars.length === 0
              ? `Missing for: ${names(withoutCalendar)}. Create a calendar first, then pick it on the affiliate's Profile settings.`
              : `Missing for: ${names(withoutCalendar)}. Pick a calendar on the affiliate's Profile settings - payments due on a holiday roll to the next business day.`,
      // Calendars are defined once on the reference-data page but assigned per affiliate, on its Profile.
      href:
        calendars.length > 0 && withoutCalendar.length > 0
          ? `/affiliates/${withoutCalendar[0]!.code}/settings?section=profile`
          : '/data/market/calendars',
      action: calendars.length > 0 && withoutCalendar.length > 0 ? 'Assign calendar' : 'Holiday calendars',
      permission: 'data.view',
    },
    {
      key: 'positions',
      title: "Upload each Live affiliate's position book",
      done: live.length > 0 && withoutPositions.length === 0,
      detail:
        live.length === 0
          ? 'Appears once an affiliate is Live.'
          : withoutPositions.length === 0
            ? 'Every Live affiliate has committed positions.'
            : `No committed positions yet for: ${names(withoutPositions)}.`,
      href: '/data/operations',
      action: 'Upload data',
      permission: 'data.view',
    },
    {
      key: 'reconcile',
      title: 'Reconcile positions to the general ledger',
      done: live.length > 0 && withoutPositions.length === 0 && unreconciled.length === 0,
      detail:
        unreconciled.length > 0
          ? `Not yet signed off: ${names(unreconciled)}. Runs on unreconciled data are flagged.`
          : live.length > 0 && withoutPositions.length === 0
            ? "Every Live affiliate's committed book is signed off against the ledger."
            : 'Upload the trial balance and sign the period off.',
      href: '/data/operations?domain=GeneralLedger',
      action: 'Reconcile',
      permission: 'data.view',
    },
    {
      key: 'classification',
      title: 'Classify products for LCR and NSFR',
      done: committedIds.size > 0 && unclassifiedCodes.length === 0,
      detail:
        committedIds.size === 0
          ? 'Appears once a Live affiliate has committed positions.'
          : unclassifiedCodes.length === 0
            ? 'Every committed product carries its HQLA, run-off and ASF/RSF treatment.'
            : `No run-off or ASF/RSF factors for: ${unclassifiedCodes.slice(0, 6).join(', ')}${unclassifiedCodes.length > 6 ? '…' : ''}. Without them LCR and NSFR come out blank - define a Product Characteristics rule and have it approved.`,
      href: '/rules/product-characteristics',
      action: 'Product characteristics',
      permission: 'rules.edit',
    },
    {
      key: 'assumptions',
      title: 'Approve behavioural assumptions',
      done: activeBehaviour.length > 0,
      detail:
        activeBehaviour.length > 0
          ? `${activeBehaviour.length} active behaviour pattern rule(s).`
          : 'Calibrate deposit run-off, betas and prepayment from history, then approve them.',
      href: '/assumptions',
      action: 'Assumptions',
      permission: 'risk.view',
    },
    {
      key: 'run',
      title: 'Execute the first run',
      done: completedRuns.length > 0,
      detail:
        completedRuns.length > 0
          ? `${completedRuns.length} completed run(s). Results, limits and reports now read from them.`
          : 'Pick a preset and run. Every results screen reads from a completed run.',
      href: '/execution',
      action: 'Run now',
      permission: 'run.execute',
    },
  ];

  const items = ownCode ? allItems.filter((i) => !i.orgOnly) : allItems;
  const doneCount = items.filter((i) => i.done).length;

  // Organisation-level progress for the Organisation Admin.
  const withAdmin = real.filter((a) =>
    users.some((u) => u.affiliateCode === a.code && canonicalRole(u.role) === 'AFFILIATE_ADMIN' && u.isActive),
  );
  const marketDataReady =
    currencies.length > 0 && missingFx.length === 0 && functional.length > 0 && missingCurves.length === 0;
  const own = ownCode ? allAffiliates.find((a) => a.code === ownCode) : undefined;
  const nextKey = items.find((i) => !i.done)?.key;

  return (
    <>
      <ModuleHeader
        title={own ? `${own.name} setup` : 'Organisation setup'}
        description="What the setup needs before numbers mean anything."
        about={
          own
            ? 'The list is in order, and each item ticks itself off from live data as you complete it.'
            : 'The list is in order, and each item ticks itself off from live data as you complete it.'
        }
        asOfDate={null}
        metrics={
          isOrgAdmin
            ? [
                {
                  label: 'Organisation setup',
                  value: `${orgProgressPercent(orgRecord)}%`,
                  tone: orgRecord?.status === 'Complete' ? 'success' : 'warning',
                },
                {
                  label: 'Affiliates ready',
                  value: `${live.length} of ${real.length}`,
                  about: 'Live affiliates out of all affiliates.',
                },
                {
                  label: 'Affiliate Admins',
                  value: `${withAdmin.length} of ${real.length}`,
                  tone: withAdmin.length === real.length ? 'success' : 'warning',
                  about: `${users.filter((u) => u.isActive).length} active users in total.`,
                },
                {
                  label: 'Market data',
                  value: marketDataReady ? 'Loaded' : 'Incomplete',
                  tone: marketDataReady ? 'success' : 'warning',
                },
              ]
            : [
                { label: 'Steps complete', value: `${doneCount} of ${items.length}` },
                { label: 'Affiliate status', value: own?.status ?? '-' },
                { label: 'Completed runs', value: String(completedRuns.length) },
              ]
        }
        actions={
          isOrgAdmin ? (
            <Link
              href={orgRecord?.status === 'Complete' ? '/setup/organisation' : '/welcome/organisation'}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700"
            >
              {orgRecord?.status === 'Complete' ? 'Organisation & defaults' : 'Continue organisation setup'}
            </Link>
          ) : undefined
        }
      />

      <ol data-tour="setup-checklist" className="space-y-3">
        {items.map((item, i) => {
          const isNext = item.key === nextKey;
          const allowed = hasPermission(item.permission);
          return (
            <li
              key={item.key}
              data-tour-row={item.key}
              className={cn(
                'flex items-start gap-4 rounded-2xl border bg-white p-5 shadow-sm',
                isNext ? 'border-gold-500' : 'border-gray-100',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                  item.done ? 'bg-success text-white' : isNext ? 'bg-gold-500 text-white' : 'bg-gray-100 text-gray-500',
                )}
              >
                {item.done ? '✓' : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-navy-900">
                  {item.title}
                  <span className="sr-only">{item.done ? ' - done' : ' - not done'}</span>
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">{item.detail}</p>
              </div>
              {!allowed && !item.done && (
                <WhoCanFix
                  className="max-w-xs shrink-0"
                  hideAction
                  affiliateCode={ownCode}
                  item={{
                    fixPermission: item.permission,
                    fixHref: item.href,
                    fixLabel: item.action,
                    scope: item.orgOnly ? 'Group' : 'Affiliate',
                  }}
                />
              )}
              {allowed && (
                <Link
                  href={item.href}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold',
                    isNext
                      ? 'bg-navy-900 text-white hover:bg-navy-700'
                      : 'border border-gray-200 text-navy-900 hover:border-navy-700',
                  )}
                >
                  {item.action}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
