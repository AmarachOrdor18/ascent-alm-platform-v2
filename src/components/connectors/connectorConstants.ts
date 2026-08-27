/**
 * Display constants shared by `ConnectorFields`, `Connectors.tsx` and
 * `OnboardAffiliate.tsx` — split out of `ConnectorFields.tsx` itself so that
 * file only exports the component (fast-refresh needs a component-only
 * module to hot-reload without losing state).
 */
import type { ConnectorStatus, DataDomain } from '@/engine/types';

export const DOMAINS: DataDomain[] = [
  'Positions', 'GeneralLedger', 'MarketRates', 'FxRates', 'Counterparties', 'EconomicIndicators',
];

export const DOMAIN_LABEL: Record<DataDomain, string> = {
  Positions: 'Position book',
  GeneralLedger: 'General ledger / trial balance',
  MarketRates: 'Yield curves & market rates',
  FxRates: 'FX rates',
  Counterparties: 'Counterparty register',
  EconomicIndicators: 'Economic indicators',
};

/** "Blocked" is the stored value everywhere (the audit trail, the tone, the reachability check
 * that deliberately fails) — this only softens what a viewer reads, from a word that implies
 * something is wrong to one that reads as simply not done yet. */
export const STATUS_LABEL: Record<ConnectorStatus, string> = {
  Available: 'Available', Blocked: 'Not configured', Planned: 'Planned', Retired: 'Retired',
};

export const STATUS_TONE: Record<ConnectorStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Available: 'success', Blocked: 'danger', Planned: 'warning', Retired: 'neutral',
};
