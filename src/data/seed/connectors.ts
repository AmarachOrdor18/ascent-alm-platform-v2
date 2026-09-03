import type { Connector } from '@/engine/types';

const STAMP = { isActive: true, updatedBy: 'SEED', updatedAt: '2026-01-01T00:00:00.000Z' };

export const SEED_CONNECTORS: Connector[] = [
  {
    id: 'C-FLEXCUBE',
    name: 'Oracle Flexcube',
    vendor: 'Oracle',
    protocol: 'REST',
    domains: ['Positions', 'GeneralLedger', 'Counterparties'],
    status: 'Blocked',
    statusReason:
      'No production API credentials have been issued for this environment yet. The endpoint, cadence and window ' +
      'below are the target configuration each affiliate will point to once Core Banking provisions access - not a ' +
      'live connection today. Positions and the general ledger come in by file upload in the meantime.',
    endpoint: 'https://{affiliate}.flexcube.ecobank.internal/api/v2/extract',
    authMode: 'OAuth2',
    credentialRef: 'vault://alm/flexcube/{affiliate}',
    cadenceDays: 1,
    scheduleWindow: '02:00–04:00 local, after end-of-day',
    timeoutSeconds: 300,
    maxRetries: 3,
    owner: 'Ecobank Business Services - Core Banking',
    notes:
      'One instance per affiliate, so the endpoint is templated on the affiliate code. Once connected, the extract ' +
      'would run after end-of-day, which is why the window sits overnight in local time rather than at a single ' +
      'Group hour. Feeds Positions, General Ledger and Counterparties in this system’s terms - there is no ' +
      'separate transaction-level domain here; loan and deposit balances are the unit of record.',
    ...STAMP,
  },
  {
    id: 'C-REUTERS',
    name: 'Refinitiv / Reuters',
    vendor: 'LSEG',
    protocol: 'REST',
    domains: ['MarketRates', 'FxRates'],
    status: 'Blocked',
    statusReason:
      'No API key or entitlement has been provisioned for this environment yet. The endpoint and cadence below are ' +
      'the target configuration, not a live feed today. Curves and FX rates come in by manual entry in the meantime.',
    endpoint: 'https://api.refinitiv.com/data/pricing/v1/views',
    authMode: 'ApiKey',
    credentialRef: 'vault://alm/refinitiv/group',
    cadenceDays: 1,
    scheduleWindow: '17:30 GMT, after London close',
    timeoutSeconds: 60,
    maxRetries: 5,
    owner: 'Group Treasury - Market Data',
    notes: 'Once entitled, one Group-wide credential would cover every affiliate, with curves and FX in the same call.',
    ...STAMP,
  },
  {
    id: 'C-BLOOMBERG',
    name: 'Bloomberg',
    vendor: 'Bloomberg',
    protocol: 'Proprietary',
    domains: ['MarketRates', 'FxRates'],
    status: 'Available',
    statusReason: null,
    endpoint: 'localhost:8194 (BLPAPI session, via server-side adapter)',
    authMode: 'Certificate',
    credentialRef: 'vault://alm/bloomberg/bpipe',
    cadenceDays: 1,
    scheduleWindow: 'Intraday, session-held',
    timeoutSeconds: 30,
    maxRetries: 2,
    owner: 'Group Treasury - Market Data',
    notes:
      'An alternative to Refinitiv for the same two domains, useful where an affiliate prices specifically off ' +
      'Bloomberg benchmarks.',
    ...STAMP,
  },
  {
    id: 'C-CALYPSO',
    name: 'Calypso',
    vendor: 'Adenza (Nasdaq)',
    protocol: 'JDBC',
    domains: ['Positions', 'MarketRates'],
    status: 'Available',
    statusReason: null,
    endpoint: 'jdbc:oracle:thin:@calypso-db.ecobank.internal:1521/CALYPSO',
    authMode: 'Basic',
    credentialRef: 'vault://alm/calypso/readonly',
    cadenceDays: 1,
    scheduleWindow: '06:00 GMT, post batch',
    timeoutSeconds: 600,
    maxRetries: 2,
    owner: 'Group Treasury - Front Office Systems',
    notes:
      'Calypso holds the treasury and derivatives book, read via a read-only schema account against the vendor ' +
      'database. There is no separate trade-position or treasury-instrument domain here - Calypso-sourced exposures ' +
      'land as ordinary Positions, same as a Flexcube loan or deposit. When uploaded manually in the meantime, ' +
      'they’re typically tagged with the Treasury contributor - that tag identifies the submitting desk, not the ' +
      'source system.',
    ...STAMP,
  },
];
