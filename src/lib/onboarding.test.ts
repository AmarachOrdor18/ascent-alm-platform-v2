import { describe, expect, it } from 'vitest';
import { ROLES } from '@/context/AuthContext';
import type { SettingRecord } from '@/engine/types';
import {
  AFFILIATE_STEPS,
  ORG_SETUP_STEPS,
  ORG_STEPS,
  dashboardKind,
  effectiveSetting,
  emptyOnboarding,
  markStep,
  needsAffiliateOnboarding,
  needsOrgOnboarding,
  orgProgressPercent,
  resolveLanding,
  resumeStep,
} from './onboarding';
import type { OnboardingRecord } from '@/engine/types';

const groupAdmin = { id: 'U-1', affiliateCode: 'GROUP' };
const affAdmin = { id: 'U-2', affiliateCode: 'GH' };
const perms = (code: keyof typeof ROLES) => ROLES[code].permissions;

describe('onboarding records', () => {
  it('completes once every step is done, tracking the next step', () => {
    let org = emptyOnboarding('Organisation');
    expect(org.id).toBe('ORG');
    for (const step of ORG_STEPS.slice(0, -1)) org = markStep(org, step, true, 'U-1', '2026-10-17T00:00:00Z');
    expect(org.status).toBe('InProgress');
    expect(org.currentStep).toBe('review');
    org = markStep(org, 'review', true, 'U-1', '2026-10-18T00:00:00Z');
    expect(org.status).toBe('Complete');
    expect(org.completedAt).toBe('2026-10-18T00:00:00Z');
    expect(org.startedAt).toBe('2026-10-17T00:00:00Z');
  });

  it('keys affiliate records by code', () => {
    const rec = emptyOnboarding('Affiliate', 'GH');
    expect(rec.id).toBe('AFF:GH');
    expect(markStep(rec, AFFILIATE_STEPS[0], true, 'U-2').currentStep).toBe(AFFILIATE_STEPS[1]);
  });

  it('locks liquidity treatment between initial data and readiness in the affiliate wizard', () => {
    // Products are created by the file upload, so their treatment is set right after the book lands,
    // before readiness sees what is still uncovered.
    expect(AFFILIATE_STEPS).toEqual([
      'confirm',
      'dataSources',
      'users',
      'configuration',
      'initialData',
      'liquidity',
      'readiness',
    ]);
    expect(AFFILIATE_STEPS.indexOf('liquidity')).toBeLessThan(AFFILIATE_STEPS.indexOf('readiness'));
  });

  it('keeps people on the affiliates step: the wizard runs four steps with no users step', () => {
    expect(ORG_STEPS).toEqual(['organisation', 'affiliates', 'settings', 'review']);
    // The Admin page keeps the assumptions section on top of the wizard steps; 'users' belongs to
    // neither - its management is folded into the affiliates step.
    expect(ORG_SETUP_STEPS.filter((s) => !(ORG_STEPS as readonly string[]).includes(s))).toEqual(['assumptions']);
  });

  it('computes progress against the four wizard steps', () => {
    let org = emptyOnboarding('Organisation');
    expect(orgProgressPercent(org)).toBe(0);
    org = markStep(org, 'organisation', true, 'U-1', '2026-10-17T00:00:00Z');
    org = markStep(org, 'affiliates', true, 'U-1', '2026-10-17T00:05:00Z');
    expect(orgProgressPercent(org)).toBe(50);
  });
});

describe('landing', () => {
  const done = { ...emptyOnboarding('Organisation'), status: 'Complete' as const };
  const affDone = { ...emptyOnboarding('Affiliate', 'GH'), status: 'Complete' as const };

  it('sends a Group administrator to organisation onboarding until it is complete', () => {
    expect(needsOrgOnboarding(groupAdmin, perms('ADMIN'), null)).toBe(true);
    expect(resolveLanding(groupAdmin, perms('ADMIN'), null, null)).toBe('/welcome/organisation');
    expect(resolveLanding(groupAdmin, perms('ADMIN'), done, null)).toBe('/dashboard');
  });

  it('sends an Affiliate Administrator to affiliate onboarding, never organisation onboarding', () => {
    expect(needsOrgOnboarding(affAdmin, perms('AFFILIATE_ADMIN'), null)).toBe(false);
    expect(needsAffiliateOnboarding(affAdmin, perms('AFFILIATE_ADMIN'), null, { code: 'GH' })).toBe(true);
    expect(resolveLanding(affAdmin, perms('AFFILIATE_ADMIN'), null, null)).toBe('/welcome/affiliate');
    expect(resolveLanding(affAdmin, perms('AFFILIATE_ADMIN'), null, affDone)).toBe('/dashboard');
  });

  it('never sends other roles to onboarding', () => {
    expect(resolveLanding(groupAdmin, perms('APPROVER'), null, null)).toBe('/dashboard');
    expect(resolveLanding({ id: 'U-3', affiliateCode: 'GROUP' }, perms('AFFILIATE_ADMIN'), null, null)).toBe(
      '/dashboard',
    );
    expect(resolveLanding(null, perms('ADMIN'), null, null)).toBe('/dashboard');
  });

  it('picks a dashboard by role', () => {
    expect(dashboardKind(groupAdmin, perms('ADMIN'))).toBe('organisation');
    expect(dashboardKind(affAdmin, perms('AFFILIATE_ADMIN'))).toBe('affiliate');
    expect(dashboardKind(groupAdmin, perms('APPROVER'))).toBe('approver');
    expect(dashboardKind(groupAdmin, perms('RISK_ANALYST'))).toBe('analyst');
    expect(dashboardKind(groupAdmin, perms('EXECUTIVE_VIEWER'))).toBe('viewer');
    expect(dashboardKind(groupAdmin, (p) => p === 'group.manage')).toBe('organisation');
  });

  it('resumes at the first not-done step when the saved step no longer exists (records saved at the old users step)', () => {
    // Records from before the users step was folded into affiliates keep steps.users.done; the
    // wizard must fall back to the first genuinely unfinished step, not restart or break.
    const oldRecord: OnboardingRecord = {
      ...emptyOnboarding('Organisation'),
      status: 'InProgress',
      steps: {
        organisation: { done: true, at: '2026-10-16T00:00:00Z', by: 'U-1' },
        users: { done: true, at: '2026-10-16T00:00:00Z', by: 'U-1' },
      },
      currentStep: 'users',
      startedAt: '2026-10-16T00:00:00Z',
    };
    expect(resumeStep(oldRecord)).toBe('affiliates');
    const allDoneButOld = {
      ...oldRecord,
      steps: {
        ...oldRecord.steps,
        affiliates: { done: true, at: '2026-10-16T00:00:00Z', by: 'U-1' },
        settings: { done: true, at: '2026-10-16T00:00:00Z', by: 'U-1' },
      },
    };
    expect(resumeStep(allDoneButOld)).toBe('review');
  });
});

describe('effectiveSetting', () => {
  const s = (affiliateCode: string, key: string, value: unknown, overridable?: boolean): SettingRecord => ({
    id: `${affiliateCode}:${key}`,
    affiliateCode,
    key,
    value,
    overridable,
    updatedBy: null,
    updatedAt: null,
  });

  it('falls back to the default when nothing is set', () => {
    expect(effectiveSetting('tz', 'GH', [], 'UTC')).toEqual({ value: 'UTC', source: 'Default', overridable: true });
  });

  it('uses the affiliate override only where the organisation allows it', () => {
    const rows = [s('GROUP', 'tz', 'Africa/Lagos', true), s('GH', 'tz', 'Africa/Accra')];
    expect(effectiveSetting('tz', 'GH', rows, 'UTC')).toMatchObject({ value: 'Africa/Accra', source: 'Affiliate' });
    expect(effectiveSetting('tz', 'KE', rows, 'UTC')).toMatchObject({ value: 'Africa/Lagos', source: 'Organisation' });
    const locked = [s('GROUP', 'tz', 'Africa/Lagos', false), s('GH', 'tz', 'Africa/Accra')];
    expect(effectiveSetting('tz', 'GH', locked, 'UTC')).toEqual({
      value: 'Africa/Lagos',
      source: 'Organisation',
      overridable: false,
    });
  });
});
