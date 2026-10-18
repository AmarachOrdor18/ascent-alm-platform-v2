// Onboarding state model - pure logic only (no React, no repository), so it is testable in isolation.
// Records live in the `onboarding` table ('ORG' for the organisation, 'AFF:<code>' per affiliate); settings
// in the `settings` table ('<GROUP|affiliate>:<key>'). Landing is applied by OnboardingGate (src/App.tsx).
import type { Affiliate, OnboardingRecord, SettingRecord, User } from '@/engine/types';

// The guided wizard is four steps: people are managed on the affiliates step itself (add affiliate → invite
// its admin → upload the team CSV). Assumptions ship pre-set as Group defaults; they remain an editable
// section of Admin → Organisation setup (ORG_SETUP_STEPS).
export const ORG_STEPS = ['organisation', 'affiliates', 'settings', 'review'] as const;
export const ORG_SETUP_STEPS = ['organisation', 'affiliates', 'settings', 'assumptions', 'review'] as const;
export const AFFILIATE_STEPS = [
  'confirm',
  'dataSources',
  'users',
  'configuration',
  'initialData',
  'readiness',
] as const;

export type OrgStep = (typeof ORG_SETUP_STEPS)[number];
export type AffiliateStep = (typeof AFFILIATE_STEPS)[number];

export const ORG_ONBOARDING_ID = 'ORG';
export const affiliateOnboardingId = (code: string) => `AFF:${code}`;

/** Something that answers "does the signed-in user hold this permission?" - a list or AuthContext's hasPermission. */
export type Perms = readonly string[] | ((permission: string) => boolean);

function has(perms: Perms, permission: string): boolean {
  return typeof perms === 'function' ? perms(permission) : perms.includes(permission);
}

type MinimalUser = Pick<User, 'id' | 'affiliateCode'> | null | undefined;

/** A blank record for the organisation or one affiliate. */
export function emptyOnboarding(scope: 'Organisation' | 'Affiliate', affiliateCode = 'GROUP'): OnboardingRecord {
  const isOrg = scope === 'Organisation';
  return {
    id: isOrg ? ORG_ONBOARDING_ID : affiliateOnboardingId(affiliateCode),
    scope,
    affiliateCode: isOrg ? 'GROUP' : affiliateCode,
    status: 'NotStarted',
    currentStep: null,
    steps: {},
    startedAt: null,
    startedBy: null,
    completedAt: null,
    completedBy: null,
    updatedBy: null,
    updatedAt: null,
  };
}

/** Marks one step done (or not), keeping status/currentStep consistent with the step list. */
export function markStep(
  record: OnboardingRecord,
  step: string,
  done: boolean,
  by: string,
  at = new Date().toISOString(),
): OnboardingRecord {
  const order: readonly string[] = record.scope === 'Organisation' ? ORG_STEPS : AFFILIATE_STEPS;
  const steps = { ...record.steps, [step]: { done, at: done ? at : null, by: done ? by : null } };
  const allDone = order.every((s) => steps[s]?.done);
  const nextStep = order.find((s) => !steps[s]?.done) ?? null;
  return {
    ...record,
    steps,
    status: allDone ? 'Complete' : 'InProgress',
    currentStep: nextStep,
    startedAt: record.startedAt ?? at,
    startedBy: record.startedBy ?? by,
    completedAt: allDone ? (record.completedAt ?? at) : null,
    completedBy: allDone ? (record.completedBy ?? by) : null,
    updatedBy: by,
    updatedAt: at,
  };
}

/** A Group administrator (group.manage) whose organisation set-up is not complete. */
export function needsOrgOnboarding(
  user: MinimalUser,
  perms: Perms,
  orgRecord: OnboardingRecord | null | undefined,
): boolean {
  if (!user) return false;
  return has(perms, 'group.manage') && orgRecord?.status !== 'Complete';
}

/** An Affiliate Administrator (affiliate.manage, not Group) whose own affiliate's set-up is not complete. */
export function needsAffiliateOnboarding(
  user: MinimalUser,
  perms: Perms,
  affRecord: OnboardingRecord | null | undefined,
  affiliate?: Pick<Affiliate, 'code'> | null,
): boolean {
  if (!user) return false;
  if (!has(perms, 'affiliate.manage') || has(perms, 'group.manage')) return false;
  if (user.affiliateCode === 'GROUP') return false;
  if (affiliate && affiliate.code !== user.affiliateCode) return false;
  return affRecord?.status !== 'Complete';
}

export type Landing = '/welcome/organisation' | '/welcome/affiliate' | '/dashboard';

export function resolveLanding(
  user: MinimalUser,
  perms: Perms,
  orgRecord: OnboardingRecord | null | undefined,
  affRecord: OnboardingRecord | null | undefined,
  affiliate?: Pick<Affiliate, 'code'> | null,
): Landing {
  if (needsOrgOnboarding(user, perms, orgRecord)) return '/welcome/organisation';
  if (needsAffiliateOnboarding(user, perms, affRecord, affiliate)) return '/welcome/affiliate';
  return '/dashboard';
}

export type DashboardKind = 'organisation' | 'affiliate' | 'approver' | 'analyst' | 'viewer';

export function dashboardKind(user: MinimalUser, perms: Perms): DashboardKind {
  if (!user) return 'viewer';
  if (has(perms, 'group.manage')) return 'organisation';
  if (has(perms, 'affiliate.manage')) return 'affiliate';
  if (has(perms, 'approvals.approve')) return 'approver';
  if (has(perms, 'run.execute') || has(perms, 'rules.edit')) return 'analyst';
  return 'viewer';
}

export interface EffectiveSetting<T> {
  value: T;
  source: 'Affiliate' | 'Organisation' | 'Default';
  /** Whether an affiliate may override the organisation value (true when the organisation set none). */
  overridable: boolean;
}

/**
 * The value that applies to `affiliateCode` for `key`: the affiliate's own override when the organisation
 * allows one, else the organisation (GROUP) value, else `fallback`.
 */
export function effectiveSetting<T>(
  key: string,
  affiliateCode: string | null | undefined,
  settings: readonly SettingRecord[],
  fallback: T,
): EffectiveSetting<T> {
  const org = settings.find((s) => s.affiliateCode === 'GROUP' && s.key === key);
  const overridable = org ? org.overridable === true : true;
  if (affiliateCode && affiliateCode !== 'GROUP' && overridable) {
    const own = settings.find((s) => s.affiliateCode === affiliateCode && s.key === key);
    if (own) return { value: own.value as T, source: 'Affiliate', overridable };
  }
  if (org) return { value: org.value as T, source: 'Organisation', overridable };
  return { value: fallback, source: 'Default', overridable };
}

/** The settings-table id for `key` at `scopeCode` (GROUP or an affiliate code). */
export const settingId = (scopeCode: string, key: string) => `${scopeCode}:${key}`;

// ─── Organisation onboarding (Phase 3) ──────────────────────────────────────

/** Moves the record to `step` (resume point) without marking anything done. */
export function atStep(
  record: OnboardingRecord,
  step: string,
  by: string,
  at = new Date().toISOString(),
): OnboardingRecord {
  return {
    ...record,
    currentStep: step,
    status: record.status === 'Complete' ? 'Complete' : 'InProgress',
    startedAt: record.startedAt ?? at,
    startedBy: record.startedBy ?? by,
    updatedBy: by,
    updatedAt: at,
  };
}

/** Marks every step of the record's scope done and the record Complete. */
export function completeOnboarding(
  record: OnboardingRecord,
  by: string,
  at = new Date().toISOString(),
): OnboardingRecord {
  const order: readonly string[] = record.scope === 'Organisation' ? ORG_STEPS : AFFILIATE_STEPS;
  const steps = { ...record.steps };
  for (const s of order) if (!steps[s]?.done) steps[s] = { done: true, at, by };
  return {
    ...record,
    steps,
    status: 'Complete',
    currentStep: null,
    startedAt: record.startedAt ?? at,
    startedBy: record.startedBy ?? by,
    completedAt: record.completedAt ?? at,
    completedBy: record.completedBy ?? by,
    updatedBy: by,
    updatedAt: at,
  };
}

/** Where to resume an organisation onboarding: its saved current step, else the first step not yet done. */
export function resumeStep(record: OnboardingRecord | null | undefined): OrgStep {
  const saved = record?.currentStep;
  if ((ORG_STEPS as readonly string[]).includes(saved ?? '')) return saved as OrgStep;
  // A saved step that is no longer part of the wizard (e.g. 'assumptions', or a pre-rename step) resumes
  // at the first not-yet-done step rather than restarting at the beginning.
  const firstNotDone = ORG_STEPS.find((s) => !record?.steps[s]?.done);
  return firstNotDone ?? ORG_STEPS[0];
}

/** Where to resume an affiliate onboarding: its saved current step, else the first step. */
export function resumeAffiliateStep(record: OnboardingRecord | null | undefined): AffiliateStep {
  const saved = record?.currentStep;
  return (AFFILIATE_STEPS as readonly string[]).includes(saved ?? '') ? (saved as AffiliateStep) : AFFILIATE_STEPS[0];
}

/** Share of the organisation steps done, 0-100. */
export function orgProgressPercent(record: OnboardingRecord | null | undefined): number {
  if (!record) return 0;
  if (record.status === 'Complete') return 100;
  const done = ORG_STEPS.filter((s) => record.steps[s]?.done).length;
  return Math.round((done / ORG_STEPS.length) * 100);
}

/**
 * The onboarding gate: a user who needs onboarding and arrives on Home is sent to their welcome route once
 * per session. `handled` = already redirected (or chose "Finish later") this session. Returns where to go,
 * or null to stay.
 */
export function onboardingRedirect(location: string, landing: Landing, handled: boolean): Landing | null {
  if (handled || landing === '/dashboard') return null;
  if (location !== '/dashboard' && location !== '/') return null;
  return landing;
}

/** sessionStorage key for "the onboarding redirect has happened (or was deferred) this session". */
export const onboardingHandledKey = (userId: string) => `ascent.onboarding.handled:${userId}`;

// Organisation settings ('GROUP:<key>' rows in public.settings) the organisation set-up writes.
export const ORG_SETTING = {
  cycleFrequency: 'cycle.frequency',
  monthEndConvention: 'cycle.monthEndConvention',
  fiscalYearEnd: 'cycle.fiscalYearEnd',
  ftpMethod: 'ftp.defaultMethod',
  ftpLiquidityPremium: 'ftp.liquidityPremium',
  marketDataLoadedBy: 'marketData.loadedBy',
  marketDataAffiliateOverrides: 'marketData.affiliateOverrides',
} as const;

export type CycleFrequency = 'Monthly' | 'Daily';
export type MonthEndConvention = 'LastCalendarDay' | 'LastBusinessDay';

/** What applies when the organisation has saved nothing yet. */
export const ORG_SETTING_DEFAULTS: Record<(typeof ORG_SETTING)[keyof typeof ORG_SETTING], unknown> = {
  'cycle.frequency': 'Monthly',
  'cycle.monthEndConvention': 'LastBusinessDay',
  'cycle.fiscalYearEnd': '12-31',
  'ftp.defaultMethod': 'MatchedMaturity',
  'ftp.liquidityPremium': true,
  'marketData.loadedBy': 'Group',
  'marketData.affiliateOverrides': false,
};

/** A GROUP settings row for `key`. */
export function orgSetting(
  key: string,
  value: unknown,
  overridable: boolean,
  by: string,
  at = new Date().toISOString(),
): SettingRecord {
  return { id: settingId('GROUP', key), affiliateCode: 'GROUP', key, value, overridable, updatedBy: by, updatedAt: at };
}
