import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import type { Role, RoleCode, User } from '@/engine/types';

// Default/fallback permission sets, seeded into the `roles` table on first run and
// editable afterward from Users & Roles; `hasPermission` reads the live table, not this constant.
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
      'users.manage',
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
  AFFILIATE_ADMIN: {
    code: 'AFFILIATE_ADMIN',
    name: 'Affiliate Administrator',
    description:
      'Local admin for one affiliate — provisions and manages that affiliate’s own users, runs its processes and sets its reporting thresholds. Never Group-wide, never able to grant Group Administrator access.',
    permissions: [
      'dashboard.view',
      'risk.view',
      'treasury.view',
      'reporting.view',
      'data.view',
      'users.manage',
      'run.execute',
      'limits.manage',
    ],
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

  // No `initialData`: it would mark seeded data "fresh" under the app's global staleTime
  // and skip the real fetch, hiding roles-table edits for the first 30s of a session.
  const { data: liveRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => repository.listRoles(),
  });

  const roleByCode = useMemo(() => {
    const source = liveRoles && liveRoles.length > 0 ? liveRoles : Object.values(ROLES);
    const map = new Map<RoleCode, Role>();
    for (const role of source) map.set(role.code, role);
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
