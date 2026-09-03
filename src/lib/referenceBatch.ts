import { newId } from './governanceHooks';
import type { DataDomain, LoadBatch } from '@/engine/types';

/**
 * A LoadBatch for a reference-data domain that's edited a row or value at a time - FX rates, yield
 * curves, economic indicators, GL trial balances - rather than staged from a discrete file the way
 * Positions is. The Data Sources freshness page (`checkFreshness` in engine/vintage.ts) only ever reads
 * LoadBatch rows to compute "last loaded" and SLA age; without one of these recorded on every save, that
 * screen reads "Never loaded" forever for these domains no matter how current the underlying data
 * actually is. Call this and `useSaveBatch().mutate(...)` it after every successful save.
 */
export function referenceLoadBatch(params: {
  domain: DataDomain;
  affiliateCode: string;
  asOfDate: string;
  label: string;
  uploadedBy: string;
  rowCount?: number;
}): LoadBatch {
  const now = new Date().toISOString();
  const rowCount = params.rowCount ?? 1;
  return {
    id: newId('B'),
    affiliateCode: params.affiliateCode,
    domain: params.domain,
    contributor: null,
    asOfDate: params.asOfDate,
    version: 1,
    fileName: params.label,
    fileHash: newId('H'),
    rowCount,
    rowsAccepted: rowCount,
    rowsRejected: 0,
    status: 'Committed',
    supersedesBatchId: null,
    supersededReason: null,
    uploadedBy: params.uploadedBy,
    uploadedAt: now,
    committedBy: params.uploadedBy,
    committedAt: now,
    reconciledBy: null,
    reconciledAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
  };
}
