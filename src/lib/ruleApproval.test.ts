import { describe, expect, it } from 'vitest';
import {
  isApprovalGated,
  isRuleApproved,
  pickApprovedRule,
  ruleApprovalRequest,
  SEED_AUTHOR,
  supersededRequests,
  unapprovedRules,
} from './ruleApproval';
import type { ApprovalRequest, RuleMeta } from '@/engine/types';

function rule(overrides: Partial<RuleMeta> = {}): RuleMeta {
  return {
    id: 'R-1',
    kind: 'BehaviourPattern',
    name: 'Patterns',
    description: '',
    folder: 'Group Default',
    accessType: 'Read-Write',
    affiliateCode: null,
    version: 1,
    isActive: true,
    createdBy: 'maker',
    createdAt: '2026-01-01T00:00:00Z',
    updatedBy: 'maker',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const approve = (r: ApprovalRequest): ApprovalRequest => ({ ...r, status: 'Approved', decidedBy: 'checker' });

describe('rule approval gate', () => {
  it('gates behaviour, prepayment and product-characteristic rules only', () => {
    expect(isApprovalGated('BehaviourPattern')).toBe(true);
    expect(isApprovalGated('Prepayment')).toBe(true);
    expect(isApprovalGated('ProductCharacteristic')).toBe(true);
    expect(isApprovalGated('TimeBucket')).toBe(false);
  });

  it('gates the three profitability rule kinds the same way', () => {
    for (const kind of ['CostAllocation', 'CreditLoss', 'CapitalAllocation'] as const) {
      expect(isApprovalGated(kind)).toBe(true);
      const r = rule({ id: `R-${kind}`, kind, name: `${kind} rule`, version: 1 });
      const request = ruleApprovalRequest(r, 'maker', 'now');
      expect(request).toMatchObject({ entityType: kind, entityVersion: 1, status: 'Pending' });
      // Saved but not yet signed off: a run must refuse it.
      expect(isRuleApproved(r, [request])).toBe(false);
      expect(unapprovedRules([r], [request])).toEqual([`${kind} rule`]);
      expect(pickApprovedRule([r], 'NG', [request])).toBeNull();
      // Approved at this version: usable, and picked as the Group default.
      expect(isRuleApproved(r, [approve(request)])).toBe(true);
      expect(pickApprovedRule([r], 'NG', [approve(request)])?.id).toBe(r.id);
      // A later edit needs its own approval.
      expect(isRuleApproved({ ...r, version: 2 }, [approve(request)])).toBe(false);
    }
  });

  it('treats an unedited seeded rule as approved, but not once edited', () => {
    const seeded = rule({ createdBy: SEED_AUTHOR, updatedBy: null, updatedAt: null });
    expect(isRuleApproved(seeded, [])).toBe(true);
    expect(isRuleApproved({ ...seeded, version: 2, updatedBy: 'maker' }, [])).toBe(false);
  });

  it('approves only the version the request covered', () => {
    const r = rule({ version: 2 });
    const request = ruleApprovalRequest(r, 'maker', 'now');
    expect(request).toMatchObject({
      status: 'Pending',
      requestedBy: 'maker',
      entityVersion: 2,
      entityType: 'BehaviourPattern',
    });
    expect(isRuleApproved(r, [request])).toBe(false);
    expect(isRuleApproved(r, [approve(request)])).toBe(true);
    expect(isRuleApproved({ ...r, version: 3 }, [approve(request)])).toBe(false);
  });

  it('withdraws pending requests for older versions', () => {
    const v1 = ruleApprovalRequest(rule({ version: 1 }), 'maker', 'then');
    const stale = supersededRequests(rule({ version: 2 }), [v1], 'now');
    expect(stale).toHaveLength(1);
    expect(stale[0]!.status).toBe('Withdrawn');
  });

  it('names the unapproved gated rules a run refers to', () => {
    const pending = rule({ name: 'Pending patterns' });
    expect(unapprovedRules([pending, null], [])).toEqual(['Pending patterns']);
    expect(unapprovedRules([pending], [approve(ruleApprovalRequest(pending, 'maker', 'now'))])).toEqual([]);
  });

  it('picks the latest approved affiliate rule, else the Group default, never an unapproved one', () => {
    const group = rule({ id: 'G', createdBy: SEED_AUTHOR, updatedBy: null, updatedAt: null });
    const ngOld = rule({ id: 'NG-OLD', affiliateCode: 'NG', updatedAt: '2026-02-01T00:00:00Z' });
    const ngNew = rule({ id: 'NG-NEW', affiliateCode: 'NG', updatedAt: '2026-03-01T00:00:00Z' });
    const requests = [approve(ruleApprovalRequest(ngOld, 'maker', 'now'))];

    expect(pickApprovedRule([group, ngOld, ngNew], 'NG', requests)?.id).toBe('NG-OLD');
    expect(
      pickApprovedRule([group, ngOld, ngNew], 'NG', [...requests, approve(ruleApprovalRequest(ngNew, 'maker', 'now'))])
        ?.id,
    ).toBe('NG-NEW');
    expect(pickApprovedRule([group, ngNew], 'NG', [])?.id).toBe('G');
    expect(pickApprovedRule([ngNew], 'NG', [])).toBeNull();
  });
});
