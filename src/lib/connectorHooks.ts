/**
 * Connector configuration.
 *
 * The catalogue used to be a `const` array inside the screen. Making it
 * stored data is what turns "here are the four sources we support" into
 * "configure your estate".
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import { useAuth } from '@/context/AuthContext';
import type { Connector, DataDomain } from '@/engine/types';

export const connectorKeys = { all: ['connectors'] as const };

export function useConnectors() {
  return useQuery({ queryKey: connectorKeys.all, queryFn: () => repository.listConnectors() });
}

export function useSaveConnector() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (connector: Connector) =>
      repository.upsertConnector({
        ...connector,
        updatedBy: user?.name ?? 'unknown',
        updatedAt: new Date().toISOString(),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: connectorKeys.all }),
  });
}

export function useDeleteConnector() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repository.deleteConnector(id),
    onSuccess: () => client.invalidateQueries({ queryKey: connectorKeys.all }),
  });
}

export function newConnector(): Connector {
  return {
    id: `C-${Date.now().toString(36).toUpperCase()}`,
    name: 'New connector',
    vendor: '',
    protocol: 'REST',
    domains: [],
    status: 'Planned',
    statusReason: 'Not yet assessed.',
    endpoint: '',
    authMode: 'ApiKey',
    credentialRef: '',
    cadenceDays: 1,
    scheduleWindow: '',
    timeoutSeconds: 60,
    maxRetries: 3,
    owner: '',
    notes: '',
    isActive: true,
    updatedBy: 'unknown',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * What is wrong with a connector's configuration.
 *
 * Returned as a list rather than a boolean so the screen can say which field
 * is at fault. A blocked connector still has to be *described* correctly —
 * the block is a reason to substitute files, not a reason to leave the
 * record half-filled.
 */
export function validateConnector(c: Connector): string[] {
  const problems: string[] = [];
  if (c.name.trim() === '') problems.push('Name is required.');
  if (c.domains.length === 0) problems.push('Choose at least one data domain, or the connector can feed nothing.');
  if (c.status !== 'Available' && !c.statusReason?.trim()) {
    problems.push('A connector that is not Available needs a reason — an unexplained block is not actionable.');
  }
  if (c.status === 'Available' && c.endpoint.trim() === '') {
    problems.push('An available connector needs an endpoint.');
  }
  if (c.authMode !== 'None' && c.credentialRef.trim() === '') {
    problems.push('Give a vault reference for the credential.');
  }
  // A credential pasted in clear text would sit in IndexedDB on every
  // machine that opens this page.
  if (/^[A-Za-z0-9+/=]{24,}$/.test(c.credentialRef.trim()) && !c.credentialRef.includes('://')) {
    problems.push('That looks like a secret rather than a vault reference. Store the pointer, not the credential.');
  }
  if (c.cadenceDays <= 0) problems.push('Cadence must be at least one day.');
  return problems;
}

/** Which connectors can serve a given domain and are usable today. */
export function availableFor(connectors: Connector[], domain: DataDomain): Connector[] {
  return connectors.filter((c) => c.isActive && c.status === 'Available' && c.domains.includes(domain));
}
