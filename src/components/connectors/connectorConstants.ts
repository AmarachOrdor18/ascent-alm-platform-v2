// Split out of ConnectorFields.tsx so that file only exports the component (fast-refresh requires a component-only module).
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

export const STATUS_LABEL: Record<ConnectorStatus, string> = {
  Available: 'Available', Blocked: 'Blocked', Planned: 'Planned', Retired: 'Retired',
};

export const STATUS_TONE: Record<ConnectorStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Available: 'success', Blocked: 'danger', Planned: 'warning', Retired: 'neutral',
};
