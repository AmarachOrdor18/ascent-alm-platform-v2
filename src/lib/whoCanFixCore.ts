// Pure "who can fix this?" rule, shared by the local repository and the screens. The Supabase repository
// answers the same question in the database (app.who_can_fix), because an affiliate user cannot read Group
// users' records.
import type { Role, User } from '@/engine/types';
import type { Fixer } from '@/store/repository';

const groupLevel = (u: User, perms: string[]) => u.affiliateCode === 'GROUP' || perms.includes('group.manage');

/**
 * Active users holding `permission` ("a|b" = any) for a scope. A Group item (null / GROUP): Group-level users
 * only. An affiliate item: that affiliate's users plus Group-level users (capability cascades down).
 */
export function usersWhoCanFix(
  permission: string,
  affiliateCode: string | null,
  users: User[],
  roles: Role[],
): Fixer[] {
  const wanted = permission.split('|');
  return users
    .filter((u) => u.isActive)
    .map((u) => ({ u, role: roles.find((r) => r.code === u.role) }))
    .filter(({ u, role }) => {
      const perms = role?.permissions ?? [];
      if (!wanted.some((p) => perms.includes(p))) return false;
      if (groupLevel(u, perms)) return true;
      return !!affiliateCode && affiliateCode !== 'GROUP' && u.affiliateCode === affiliateCode;
    })
    .map(({ u, role }) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      roleName: role?.name ?? u.role,
      affiliateCode: u.affiliateCode,
    }))
    .sort(
      (a, b) =>
        Number(a.affiliateCode === 'GROUP') - Number(b.affiliateCode === 'GROUP') || a.name.localeCompare(b.name),
    );
}
