/**
 * Regression check for a reported bug: "role permissions aren't enforced,
 * when I log in with different users I see the same thing." Renders the
 * real AuthProvider (not a mock) and logs in as two roles with genuinely
 * different permission sets, asserting hasPermission actually differs.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthContext';
import { repository } from '@/store/localRepository';
import type { User } from '@/engine/types';

const ADMIN_USER: User = {
  id: 'U-TEST-ADMIN',
  name: 'Test Admin',
  email: 'test-admin@ecobank.com',
  passwordHash: 'test',
  role: 'ADMIN',
  affiliateCode: 'GROUP',
  isActive: true,
  mfaEnrolled: true,
  createdAt: new Date(0).toISOString(),
  lastLoginAt: null,
};

const VIEWER_USER: User = {
  ...ADMIN_USER,
  id: 'U-TEST-VIEWER',
  name: 'Test Viewer',
  email: 'test-viewer@ecobank.com',
  role: 'EXECUTIVE_VIEWER',
};

function Probe() {
  const { user, login, hasPermission } = useAuth();
  return (
    <div>
      <span data-testid="who">{user?.name ?? 'none'}</span>
      <span data-testid="admin-manage">{String(hasPermission('admin.manage'))}</span>
      <span data-testid="run-execute">{String(hasPermission('run.execute'))}</span>
      <button onClick={() => login(ADMIN_USER)}>as-admin</button>
      <button onClick={() => login(VIEWER_USER)}>as-viewer</button>
    </div>
  );
}

function renderProbe() {
  // Matches main.tsx's real defaults, including the 30s staleTime that was
  // the actual bug: combined with `initialData` (since removed from
  // AuthContext), that staleTime marked the seeded fallback "fresh" and
  // skipped the real database fetch for the first 30 seconds of every
  // session - precisely the window someone testing "log in as a different
  // user" would be in.
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('AuthContext permission enforcement', () => {
  it('gives an Admin admin.manage and run.execute', async () => {
    renderProbe();
    await act(async () => {
      screen.getByText('as-admin').click();
    });
    expect(screen.getByTestId('who').textContent).toBe('Test Admin');
    expect(screen.getByTestId('admin-manage').textContent).toBe('true');
    expect(screen.getByTestId('run-execute').textContent).toBe('true');
  });

  it('denies an Executive Viewer both, even after an Admin session in the same provider instance', async () => {
    renderProbe();
    await act(async () => {
      screen.getByText('as-admin').click();
    });
    await act(async () => {
      screen.getByText('as-viewer').click();
    });
    expect(screen.getByTestId('who').textContent).toBe('Test Viewer');
    expect(screen.getByTestId('admin-manage').textContent).toBe('false');
    expect(screen.getByTestId('run-execute').textContent).toBe('false');
  });

  it('picks up a real edit to a role stored in the database, not just the static default', async () => {
    // Simulates what Users & Roles actually does when an admin edits
    // permissions: write the changed role to the same table hasPermission
    // reads from. If this test fails while the two above pass, the bug is
    // specifically in the live-database path, not the static fallback.
    await repository.upsertRole({
      code: 'EXECUTIVE_VIEWER',
      name: 'Executive Viewer',
      description: 'Group-wide read-only view for senior leadership and ALCO.',
      permissions: ['dashboard.view', 'risk.view', 'treasury.view', 'reporting.view', 'commentary.review', 'admin.manage'],
    });

    renderProbe();
    await act(async () => {
      screen.getByText('as-viewer').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('admin-manage').textContent).toBe('true');
    });
  });
});
