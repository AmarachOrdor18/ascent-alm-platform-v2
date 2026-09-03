/**
 * Regression check: a role that can't see a link in the sidebar could still
 * render the full screen behind it via a typed URL or an already-open tab
 * from a more privileged session, because permission only ever gated the
 * edit buttons inside a page, never whether the page rendered at all.
 * `RouteGate` (used by every entry in ROUTE_ORDER) is what's supposed to
 * close that gap - this proves it actually blocks and actually allows.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ScopeProvider } from './context/ScopeContext';
import { RouteGate } from './App';
import type { User } from '@/engine/types';

const REPORTING_USER: User = {
  id: 'U-TEST-REPORTING',
  name: 'Test Reporting User',
  email: 'test-reporting@ecobank.com',
  passwordHash: 'test',
  role: 'REPORTING_USER',
  affiliateCode: 'GH',
  isActive: true,
  mfaEnrolled: true,
  createdAt: new Date(0).toISOString(),
  lastLoginAt: null,
};

function Harness({ permission }: { permission: string }) {
  const { login } = useAuth();
  return (
    <div>
      <button onClick={() => login(REPORTING_USER)}>sign-in</button>
      <RouteGate path="/affiliates/GROUP/settings" permission={permission} screenName="Business Rules">
        <div>real screen content</div>
      </RouteGate>
    </div>
  );
}

function renderHarness(permission: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ScopeProvider>
          <Harness permission={permission} />
        </ScopeProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('RouteGate', () => {
  it('blocks a screen the signed-in role does not have permission for, even though the component would happily render it', async () => {
    renderHarness('rules.edit'); // Reporting User doesn't have this
    await act(async () => {
      screen.getByText('sign-in').click();
    });
    expect(screen.queryByText('real screen content')).toBeNull();
    expect(screen.getByText('Access restricted')).toBeTruthy();
  });

  it('renders the real screen when the role does have the permission', async () => {
    renderHarness('reporting.view'); // Reporting User does have this
    await act(async () => {
      screen.getByText('sign-in').click();
    });
    expect(screen.getByText('real screen content')).toBeTruthy();
    expect(screen.queryByText('Access restricted')).toBeNull();
  });
});
