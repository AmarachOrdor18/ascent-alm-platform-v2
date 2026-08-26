/**
 * Regression check for the real reported bug: two different logins showed
 * the same data. The permission mechanism (AuthContext.test.tsx) was never
 * the cause — ScopeContext always defaulted to Group and never looked at
 * who was signed in, so every account could freely browse every
 * affiliate's numbers regardless of which one it was actually assigned to.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthContext';
import { ScopeProvider, useScope, GROUP_CODE } from './ScopeContext';
import type { User } from '@/engine/types';

const NIGERIA_USER: User = {
  id: 'U-TEST-NG',
  name: 'Test Nigeria User',
  email: 'test-ng@ecobank.com',
  role: 'TREASURY_USER',
  affiliateCode: 'NG',
  isActive: true,
  mfaEnrolled: true,
  createdAt: new Date(0).toISOString(),
  lastLoginAt: null,
};

const GHANA_USER: User = {
  ...NIGERIA_USER,
  id: 'U-TEST-GH',
  name: 'Test Ghana User',
  email: 'test-gh@ecobank.com',
  affiliateCode: 'GH',
};

const GROUP_USER: User = {
  ...NIGERIA_USER,
  id: 'U-TEST-GROUP',
  name: 'Test Group User',
  email: 'test-group@ecobank.com',
  role: 'ADMIN',
  affiliateCode: GROUP_CODE,
};

function Probe() {
  const { login } = useAuth();
  const { affiliateCode } = useScope();
  return (
    <div>
      <span data-testid="scope">{affiliateCode}</span>
      <button onClick={() => login(NIGERIA_USER)}>as-nigeria</button>
      <button onClick={() => login(GHANA_USER)}>as-ghana</button>
      <button onClick={() => login(GROUP_USER)}>as-group</button>
    </div>
  );
}

function renderProbe() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ScopeProvider>
          <Probe />
        </ScopeProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('ScopeContext follows the logged-in user', () => {
  it('defaults to Group before anyone is logged in', () => {
    renderProbe();
    expect(screen.getByTestId('scope').textContent).toBe(GROUP_CODE);
  });

  it('scopes to a Nigeria-assigned user\'s own affiliate on login', async () => {
    renderProbe();
    await act(async () => {
      screen.getByText('as-nigeria').click();
    });
    expect(screen.getByTestId('scope').textContent).toBe('NG');
  });

  it('re-scopes to Ghana after switching accounts, not stuck on the previous affiliate', async () => {
    renderProbe();
    await act(async () => {
      screen.getByText('as-nigeria').click();
    });
    expect(screen.getByTestId('scope').textContent).toBe('NG');

    await act(async () => {
      screen.getByText('as-ghana').click();
    });
    expect(screen.getByTestId('scope').textContent).toBe('GH');
  });

  it('a Group-assigned user still gets Group scope', async () => {
    renderProbe();
    await act(async () => {
      screen.getByText('as-group').click();
    });
    expect(screen.getByTestId('scope').textContent).toBe(GROUP_CODE);
  });
});
