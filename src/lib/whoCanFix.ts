// "Who can fix this?" - for any readiness item, the people holding the permission to clear it at that scope
// (teardown §5.2: show who CAN fix it, never one named owner). Capability cascades: Group-level users can
// fix an affiliate's item too; a Group item (market data, go-live) only Group-level users can.
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { repository } from '@/store/repositoryInstance';
import type { Fixer } from '@/store/repository';
import type { ReadinessScope } from './readiness';

export type { Fixer };
export { usersWhoCanFix } from './whoCanFixCore';

/** The users (name, role) who hold `permission` for a scope - affiliate code, or null / GROUP for a Group item. */
export function whoCanFix(permission: string, affiliateCode: string | null): Promise<Fixer[]> {
  return repository.listWhoCanFix(permission, affiliateCode);
}

export function useWhoCanFix(permission: string | null | undefined, affiliateCode: string | null) {
  return useQuery({
    queryKey: ['whoCanFix', permission ?? '', affiliateCode ?? 'GROUP'],
    queryFn: () => whoCanFix(permission!, affiliateCode),
    enabled: !!permission,
    staleTime: 5 * 60_000,
  });
}

/** Whether the signed-in user may fix an item of this scope for this affiliate. */
export function useCanFix(): (permission: string, scope: ReadinessScope, affiliateCode: string | null) => boolean {
  const { user, hasPermission } = useAuth();
  return (permission, scope, affiliateCode) => {
    if (!user || !hasPermission(permission)) return false;
    const groupLevel = user.affiliateCode === 'GROUP' || hasPermission('group.manage');
    if (groupLevel) return true;
    if (scope === 'Group' || !affiliateCode || affiliateCode === 'GROUP') return false;
    return user.affiliateCode === affiliateCode;
  };
}

/** "Ama Mensah (Organisation Admin), Kofi Boateng (ALM Analyst) and 3 others". */
export function fixerSentence(fixers: Fixer[], max = 3): string {
  if (fixers.length === 0) return 'nobody yet - an Organisation Admin can grant the permission';
  const shown = fixers.slice(0, max).map((f) => `${f.name} (${f.roleName})`);
  const rest = fixers.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
  if (shown.length === 1) return shown[0]!;
  return `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}
