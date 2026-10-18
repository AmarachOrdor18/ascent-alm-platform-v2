import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/repositoryInstance';
import { assertSupabaseReachable, isSupabaseMode, supabase } from '@/lib/supabase';
import { loadSignedInUser } from '@/lib/supabaseAuth';
import { onboardingHandledKey } from '@/lib/onboarding';
import type { ActiveRoleCode, RetiredRoleCode, Role, RoleCode, User } from '@/engine/types';

// The five roles (approved simplification of the original eight). Default/fallback permission sets, seeded
// into the `roles` table on first run and editable afterward from Users & Roles; `hasPermission` reads the
// live table, not this constant.
export const ROLES: Record<ActiveRoleCode, Role> = {
  ADMIN: {
    code: 'ADMIN',
    name: 'Organisation Admin',
    description: 'Sets up and runs the organisation - affiliates, defaults, users and roles, configuration and audit.',
    permissions: [
      'dashboard.view',
      'risk.view',
      'treasury.view',
      'reporting.view',
      'data.view',
      'admin.manage',
      'group.manage',
      'affiliate.manage',
      'users.manage',
      'data.configure',
      'data.upload',
      'risk.configure',
      'rules.edit',
      'run.execute',
      'reporting.generate',
      'approvals.approve',
      'audit.view',
    ],
  },
  AFFILIATE_ADMIN: {
    code: 'AFFILIATE_ADMIN',
    name: 'Affiliate Admin',
    description:
      'Runs one affiliate end to end - everything an ALM Analyst can do (data, assumptions and rules, models, runs, reports), plus its users and thresholds. Never Group-wide.',
    // Capability cascades (teardown §5.1): an Affiliate Admin holds every ALM Analyst permission for their own
    // affiliate; RLS (app.affiliate_write_ok) keeps every write to that affiliate. Not approvals.approve.
    permissions: [
      'dashboard.view',
      'risk.view',
      'treasury.view',
      'reporting.view',
      'data.view',
      'data.configure',
      'data.upload',
      'users.manage',
      'affiliate.manage',
      'risk.configure',
      'rules.edit',
      'run.execute',
      'reporting.generate',
      'commentary.write',
      'limits.manage',
    ],
  },
  RISK_ANALYST: {
    code: 'RISK_ANALYST',
    name: 'ALM Analyst',
    description:
      'Uploads data for their affiliate, maintains assumptions and rules, runs liquidity, IRRBB, FTP and stress, and prepares reports.',
    permissions: [
      'dashboard.view',
      'risk.view',
      'treasury.view',
      'reporting.view',
      'data.view',
      'data.upload',
      'risk.configure',
      'rules.edit',
      'run.execute',
      'reporting.generate',
      'commentary.write',
    ],
  },
  APPROVER: {
    code: 'APPROVER',
    name: 'Approver',
    description: 'Reviews and approves or rejects changes and results raised by others; can read the audit trail.',
    permissions: [
      'dashboard.view',
      'risk.view',
      'treasury.view',
      'reporting.view',
      'data.view',
      'approvals.approve',
      'commentary.review',
      'audit.view',
    ],
  },
  EXECUTIVE_VIEWER: {
    code: 'EXECUTIVE_VIEWER',
    name: 'Viewer',
    description: 'Read-only access to results and reports, and can generate report packs to share.',
    permissions: [
      'dashboard.view',
      'risk.view',
      'treasury.view',
      'reporting.view',
      'reporting.generate',
      'commentary.review',
    ],
  },
};

/** The selectable roles, in display order. */
export const ROLE_LIST: Role[] = Object.values(ROLES);

/** Retired role codes and the role their users were moved to (supabase/migrations/20261019000000_roles_onboarding.sql). */
export const RETIRED_ROLE_MAP: Record<RetiredRoleCode, ActiveRoleCode> = {
  TREASURY_USER: 'RISK_ANALYST',
  CONTROL_TESTER: 'APPROVER',
  REPORTING_USER: 'EXECUTIVE_VIEWER',
};

/** The live role a stored role code means - a retired code resolves to the role that replaced it. */
export function canonicalRole(code: RoleCode): ActiveRoleCode {
  return (RETIRED_ROLE_MAP as Record<string, ActiveRoleCode>)[code] ?? (code as ActiveRoleCode);
}

export const isActiveRole = (code: string): code is ActiveRoleCode => code in ROLES;

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  isAuthenticated: boolean;
  /** True while a saved Supabase session is being restored on page load - render nothing auth-dependent yet. */
  isRestoring: boolean;
  /** Set when restoring a session failed (e.g. Supabase unreachable). */
  restoreError: string | null;
  hasPermission: (permission: string) => boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(isSupabaseMode);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Supabase mode: the session survives a reload (supabase-js keeps it in localStorage), so restore it
  // and resolve it to the app_users record rather than sending the user back to the sign-in screen.
  useEffect(() => {
    if (!isSupabaseMode) return;
    let cancelled = false;
    const client = supabase();
    assertSupabaseReachable()
      .then(() => client.auth.getSession())
      .then(async ({ data, error }) => {
        if (error) throw error;
        const restored = data.session ? await loadSignedInUser(data.session.user.id) : null;
        if (!cancelled) setUser(restored);
      })
      .catch((err: unknown) => {
        if (!cancelled) setRestoreError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });
    // Only sign-out is acted on here (another tab, an expired refresh token); sign-in is driven by Login.
    // No Supabase calls inside this callback - supabase-js holds its auth lock while it runs.
    const { data: subscription } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        queryClient.clear();
      }
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [queryClient]);

  // No `initialData`: it would mark seeded data "fresh" under the app's global staleTime
  // and skip the real fetch, hiding roles-table edits for the first 30s of a session.
  // On Supabase the roles table is only readable once signed in, so it waits for a user.
  const { data: liveRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => repository.listRoles(),
    enabled: !isSupabaseMode || user !== null,
  });

  const roleByCode = useMemo(() => {
    const live = (liveRoles ?? []).filter((r) => isActiveRole(r.code));
    const source = live.length > 0 ? live : ROLE_LIST;
    const map = new Map<RoleCode, Role>();
    for (const role of source) map.set(role.code, role);
    return map;
  }, [liveRoles]);

  // `a|b` means "either permission" - e.g. Organisation setup is for group.manage or affiliate.manage.
  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      const granted = roleByCode.get(canonicalRole(user.role))?.permissions ?? [];
      return permission.split('|').some((p) => granted.includes(p));
    },
    [user, roleByCode],
  );

  // A fresh sign-in starts a fresh onboarding session: the "redirect once" / "Finish later" flag is cleared.
  const forgetOnboardingRedirect = (id: string | undefined) => {
    if (!id) return;
    try {
      sessionStorage.removeItem(onboardingHandledKey(id));
    } catch {
      /* storage unavailable - nothing to forget */
    }
  };

  const login = useCallback((next: User) => {
    forgetOnboardingRedirect(next.id);
    setUser(next);
  }, []);

  const logout = useCallback(() => {
    forgetOnboardingRedirect(user?.id);
    setUser(null);
    if (isSupabaseMode) {
      // Cached query data belongs to the signed-out user's row-level-security view; never show it to the next.
      queryClient.clear();
      void supabase().auth.signOut();
    }
  }, [queryClient, user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user ? (roleByCode.get(canonicalRole(user.role)) ?? null) : null,
      isAuthenticated: user !== null,
      isRestoring,
      restoreError,
      hasPermission,
      login,
      logout,
    }),
    [user, roleByCode, hasPermission, isRestoring, restoreError, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
