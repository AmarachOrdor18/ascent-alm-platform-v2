// Single source of truth for "is this user confined to their own affiliate everywhere a
// picker offers a choice" — the sidebar scope switcher (AppShell.tsx) already enforces this;
// these helpers let every other affiliate picker and scoped list query apply the same rule
// instead of re-deriving it (or forgetting to).

import { GROUP_CODE } from '@/context/ScopeContext';
import type { User } from '@/engine/types';

/** True when this user must be confined to their own affiliate — not Group, and no Group-wide override. */
export function isRestrictedToOwnAffiliate(user: User | null, hasPermission: (permission: string) => boolean): boolean {
  return user !== null && user.affiliateCode !== GROUP_CODE && !hasPermission('group.manage');
}

/** The affiliates a restricted user may act on through a local (non-global) picker. */
export function accessibleAffiliates<T extends { code: string }>(
  affiliates: T[],
  user: User | null,
  hasPermission: (permission: string) => boolean,
): T[] {
  if (!isRestrictedToOwnAffiliate(user, hasPermission)) return affiliates;
  return affiliates.filter((a) => a.code === user!.affiliateCode);
}

/** The `affiliateCode` argument to pass to a `scoped()`-backed list query — `undefined` sees every affiliate. */
export function scopedListCode(user: User | null, hasPermission: (permission: string) => boolean): string | undefined {
  return isRestrictedToOwnAffiliate(user, hasPermission) ? user!.affiliateCode : undefined;
}
