/**
 * Authentication and role-based authorisation.
 *
 * `hasPermission` is checked at both the navigation and the action level.
 * v1 declared six roles but enforced `requirePermission` on only 11 of 68
 * endpoints, so a read-only Executive Viewer could run a stress test
 * (engineering register E-04). Here every mutating control asks first.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import type { Role, RoleCode, User } from '@/engine/types';

/**
 * The permission sets this build ships with. Seeded into the `roles` table
 * on first run and editable afterward from Users & Roles — this constant is
 * the default/fallback, not the live source of truth. `hasPermission` reads
 * the stored roles below, so an edited permission takes effect everywhere
 * that checks it, not just on the screen that changed it.
 */
export const ROLES: Record<RoleCode, Role> = {
  ADMIN: {
    code: 'ADMIN',
    name: 'Administrator',
    description: 'Runs the platform — users, permissions, dimensions, connectors, configuration, audit trail.',
    permissions: [
      'dashboard.view',
      'risk.view',
      'treasury.view',
      'reporting.view',
      'data.view',
      'admin.manage',
      'group.manage',
      'data.configure',
      'risk.configure',
      'rules.edit',
      'run.execute',
      'reporting.generate',
      'approvals.approve',
      'audit.view',
    ],
  },
  RISK_ANALYST: {
    code: 'RISK_ANALYST',
    name: 'Risk Analyst',
    description: 'Monitors liquidity risk, IRRBB and stress testing; configures assumptions, limits and scenarios.',
    permissions: [
      'dashboard.view',
      'risk.view',
      'treasury.view',
      'reporting.view',
      'data.view',
      'risk.configure',
      'rules.edit',
      'run.execute',
      'reporting.generate',
      'commentary.write',
    ],
  },
  TREASURY_USER: {
    code: 'TREASURY_USER',
    name: 'Treasury User',
    description: 'Manages funds transfer pricing, the balance sheet and transaction strategies.',
    permissions: [
      'dashboard.view',
      'risk.view',
      'treasury.view',
      'reporting.view',
      'data.view',
      'rules.edit',
      'run.execute',
      'commentary.write',
    ],
  },
  EXECUTIVE_VIEWER: {
    code: 'EXECUTIVE_VIEWER',
    name: 'Executive Viewer',
    description: 'Group-wide read-only view for senior leadership and ALCO.',
    permissions: ['dashboard.view', 'risk.view', 'treasury.view', 'reporting.view', 'commentary.review'],
  },
  CONTROL_TESTER: {
    code: 'CONTROL_TESTER',
    name: 'Control Tester',
    description: 'Checks data quality, runs validation and reconciliation, follows up control weaknesses.',
    permissions: [
      'dashboard.view',
      'risk.view',
      'data.view',
      'reporting.view',
      'data.configure',
      'rules.edit',
      'audit.view',
      'commentary.review',
    ],
  },
  REPORTING_USER: {
    code: 'REPORTING_USER',
    name: 'Reporting User',
    description: 'Generates and distributes regulatory, ALCO and management reports.',
    permissions: ['dashboard.view', 'risk.view', 'treasury.view', 'reporting.view', 'reporting.generate'],
  },
};

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // initialData is the static default so permission checks are correct from
  // the very first render — the live query then supersedes it once the
  // database (seeded before login is ever reachable) has answered. See
  // db.ts v7 and bootstrap.ts's refreshReferenceData for how an edited
  // permission set survives a reseed of everything else.
  const { data: liveRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => repository.listRoles(),
    initialData: () => Object.values(ROLES),
  });

  const roleByCode = useMemo(() => {
    const map = new Map<RoleCode, Role>();
    for (const role of liveRoles) map.set(role.code, role);
    return map;
  }, [liveRoles]);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      return roleByCode.get(user.role)?.permissions.includes(permission) ?? false;
    },
    [user, roleByCode],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user ? (roleByCode.get(user.role) ?? null) : null,
      isAuthenticated: user !== null,
      hasPermission,
      login: setUser,
      logout: () => setUser(null),
    }),
    [user, roleByCode, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
