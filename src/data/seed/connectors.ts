/**
 * The connector catalogue, as starting data rather than as code.
 *
 * These four were previously a hardcoded array inside the Connectors screen,
 * which had two consequences worth naming: a bank could not add a source the
 * platform had never heard of, and it could not correct a status this
 * platform had asserted about *its* estate. "Calypso is blocked" is a fact
 * about one engagement, not a property of the software.
 *
 * Everything here is editable on screen, including status and the reason.
 */

import type { Connector } from '@/engine/types';

const STAMP = { isActive: true, updatedBy: 'SEED', updatedAt: '2026-01-01T00:00:00.000Z' };

export const SEED_CONNECTORS: Connector[] = [
  {
    id: 'C-FLEXCUBE',
    name: 'Oracle Flexcube',
    vendor: 'Oracle',
    protocol: 'REST',
    domains: ['Positions', 'GeneralLedger', 'Counterparties'],
    status: 'Available',
    statusReason: null,
    endpoint: 'https://{affiliate}.flexcube.ecobank.internal/api/v2/extract',
    authMode: 'OAuth2',
    credentialRef: 'vault://alm/flexcube/{affiliate}',
    cadenceDays: 1,
    scheduleWindow: '02:00–04:00 local, after end-of-day',
    timeoutSeconds: 300,
    maxRetries: 3,
    owner: 'Ecobank Business Services — Core Banking',
    notes:
      'One instance per affiliate, so the endpoint is templated on the affiliate code. The extract runs after ' +
      'end-of-day, which is why the window sits overnight in local time rather than at a single Group hour.',
    ...STAMP,
  },
  {
    id: 'C-REUTERS',
    name: 'Refinitiv / Reuters',
    vendor: 'LSEG',
    protocol: 'REST',
    domains: ['MarketRates', 'FxRates'],
    status: 'Available',
    statusReason: null,
    endpoint: 'https://api.refinitiv.com/data/pricing/v1/views',
    authMode: 'ApiKey',
    credentialRef: 'vault://alm/refinitiv/group',
    cadenceDays: 1,
    scheduleWindow: '17:30 GMT, after London close',
    timeoutSeconds: 60,
    maxRetries: 5,
    owner: 'Group Treasury — Market Data',
    notes: 'Group-wide entitlement, so one credential covers every affiliate. Curves and FX in the same call.',
    ...STAMP,
  },
  {
    id: 'C-BLOOMBERG',
    name: 'Bloomberg',
    vendor: 'Bloomberg',
    protocol: 'Proprietary',
    domains: ['MarketRates', 'FxRates'],
    status: 'Blocked',
    statusReason:
      'BLPAPI is a session-based binary protocol over a local Terminal or B-PIPE connection, not an HTTP API. ' +
      'It cannot be called from a browser at all, and needs a server-side adapter holding the session. That is a ' +
      'genuine protocol mismatch rather than a scheduling or entitlement gap.',
    endpoint: 'localhost:8194 (BLPAPI session)',
    authMode: 'Certificate',
    credentialRef: 'vault://alm/bloomberg/bpipe',
    cadenceDays: 1,
    scheduleWindow: 'Intraday, session-held',
    timeoutSeconds: 30,
    maxRetries: 2,
    owner: 'Group Treasury — Market Data',
    notes:
      'Refinitiv covers the same two domains and is available, so this is a redundancy rather than a dependency. ' +
      'File substitution is the interim path where an affiliate prices off Bloomberg specifically.',
    ...STAMP,
  },
  {
    id: 'C-CALYPSO',
    name: 'Calypso',
    vendor: 'Adenza (Nasdaq)',
    protocol: 'JDBC',
    domains: ['Positions', 'MarketRates'],
    status: 'Blocked',
    statusReason:
      'Awaiting vendor documentation access and a read-only schema account. The integration is not technically ' +
      'hard — it is a database read — but the schema is licensed and undocumented to third parties, so building ' +
      'against it without that access would be guesswork.',
    endpoint: 'jdbc:oracle:thin:@calypso-db.ecobank.internal:1521/CALYPSO',
    authMode: 'Basic',
    credentialRef: 'vault://alm/calypso/readonly',
    cadenceDays: 1,
    scheduleWindow: '06:00 GMT, post batch',
    timeoutSeconds: 600,
    maxRetries: 2,
    owner: 'Group Treasury — Front Office Systems',
    notes:
      'Calypso holds the treasury and derivatives book. Until it clears, those positions come in by file upload ' +
      'on the same cadence, and GL reconciliation holds them to exactly the same standard.',
    ...STAMP,
  },
];
