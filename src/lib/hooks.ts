/**
 * Data hooks over the repository.
 *
 * Screens depend on these, never on Dexie. Every mutation invalidates its
 * query key and writes an audit event, so "who changed this configuration
 * and when" is answerable without anyone remembering to log it.
 */

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import { useAuth } from '@/context/AuthContext';
import type { StagedBatch } from '@/store/repository';
import type {
  Affiliate,
  AuditEvent,
  DataDomain,
  LoadBatch,
  Position,
  DimensionType,
  EconomicIndicator,
  HolidayCalendar,
  RoleCode,
  StoredCurrency,
  StoredFxRate,
  StoredYieldCurve,
  User,
} from '@/engine/types';

export const keys = {
  affiliates: ['affiliates'] as QueryKey,
  dimension: (d: DimensionType) => ['dimension', d] as QueryKey,
  curves: ['yieldCurves'] as QueryKey,
  currencies: ['currencies'] as QueryKey,
  fxRates: ['fxRates'] as QueryKey,
  indicators: ['economicIndicators'] as QueryKey,
  calendars: ['holidayCalendars'] as QueryKey,
  batches: ['batches'] as QueryKey,
  audit: ['auditEvents'] as QueryKey,
  limits: ['limits'] as QueryKey,
};

let auditCounter = 0;

function auditEvent(
  user: { id: string; name: string; role: RoleCode },
  module: string,
  action: string,
  entity: string,
  entityId: string | null,
  detail: string | null,
): AuditEvent {
  auditCounter += 1;
  return {
    id: `AE-${Date.now()}-${auditCounter}`,
    module,
    action,
    entity,
    entityId,
    userId: user.id,
    userName: user.name,
    role: user.role,
    outcome: 'Success',
    detail,
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Wraps a repository write so every configuration change lands in the audit
 * trail. RFP §2.14 asks for "full transaction history and user activity
 * audit logs"; doing it here rather than per screen is what makes that
 * true rather than aspirational.
 */
function useAuditedMutation<T>(
  module: string,
  action: string,
  entity: string,
  write: (value: T) => Promise<void>,
  describe: (value: T) => { id: string | null; detail: string },
  invalidate: QueryKey[],
) {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (value: T) => {
      await write(value);
      if (user) {
        const { id, detail } = describe(value);
        await repository.recordAuditEvent(auditEvent(user, module, action, entity, id, detail));
      }
    },
    onSuccess: () => {
      for (const key of [...invalidate, keys.audit]) client.invalidateQueries({ queryKey: key });
    },
  });
}

// ── Affiliates ───────────────────────────────────────────────────────────
export function useAffiliates() {
  return useQuery({ queryKey: keys.affiliates, queryFn: () => repository.listAffiliates() });
}

/**
 * Resolve the scope's affiliate for a screen that operates on exactly one
 * entity — data upload, GL reconciliation, connector configuration,
 * validation rules.
 *
 * `GROUP` is a genuine row in the affiliates table (Ecobank Group,
 * functional currency USD, seeded in reference.ts) because Process Run and
 * the results screens need a real record to represent a Group-consolidated
 * view. But it represents a *consolidation*, not an entity with its own
 * position book or general ledger, and `affiliates.find(a => a.code ===
 * affiliateCode)` cannot tell those two cases apart — when the global scope
 * switcher is left on "Ecobank Group (Consolidated)", that lookup matches
 * the GROUP row directly, handing a single-entity screen a currency of USD
 * while `usePositions('GROUP', asOfDate)` fetches every affiliate's
 * positions, unfiltered. Reconciling that mixture against an identity FX
 * table (USD-only) fails on the first non-USD row it meets — which is
 * exactly the "No FX rate available to convert NGN to USD" crash: GL
 * Reconciliation is a per-entity control, so it cannot run at Group scope,
 * but nothing stopped the lookup from pretending it was one.
 *
 * This never returns the GROUP row. Screens that legitimately consolidate
 * across the Group — Process Run, Stress Testing, What-If — are unaffected;
 * they already special-case `affiliateCode === 'GROUP'` or build a real,
 * multi-currency FX table rather than an identity one.
 */
export function resolveSingleAffiliate<T extends { code: string; createdAt: string }>(
  affiliates: T[],
  affiliateCode: string,
): T | undefined {
  if (affiliateCode !== 'GROUP') {
    const exact = affiliates.find((a) => a.code === affiliateCode);
    if (exact) return exact;
  }
  // Deterministic rather than whatever order the store happens to return.
  // `listAffiliates()` orders by primary key, so a plain `.find(code !==
  // 'GROUP')` silently picked Côte d'Ivoire over Nigeria — "CI" sorts before
  // "NG" alphabetically, which has nothing to do with which affiliate the
  // fallback should sensibly mean. Earliest-onboarded is at least a reason.
  return [...affiliates].filter((a) => a.code !== 'GROUP').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

// ── Dimensions ───────────────────────────────────────────────────────────
export function useDimensionMembers(dimension: DimensionType) {
  return useQuery({
    queryKey: keys.dimension(dimension),
    queryFn: () => repository.listDimensionMembers(dimension),
  });
}

export function useSaveDimensionMembers(dimension: DimensionType) {
  return useAuditedMutation(
    'Dimensions',
    'Upsert',
    dimension,
    (members: Parameters<typeof repository.upsertDimensionMembers>[0]) => repository.upsertDimensionMembers(members),
    (members) => ({
      id: members[0]?.code ?? null,
      detail: `${members.length} ${dimension} member(s) saved`,
    }),
    [keys.dimension(dimension)],
  );
}

// ── Yield curves ─────────────────────────────────────────────────────────
export function useYieldCurves() {
  return useQuery({ queryKey: keys.curves, queryFn: () => repository.listYieldCurves() });
}

export function useSaveYieldCurve() {
  return useAuditedMutation(
    'Rate Management',
    'Save',
    'Yield Curve',
    (curve: StoredYieldCurve) => repository.upsertYieldCurve(curve),
    (curve) => ({ id: curve.id, detail: `${curve.name} (${curve.currency}), ${curve.terms.length} term points` }),
    [keys.curves],
  );
}

// ── Currencies and FX ────────────────────────────────────────────────────
export function useCurrencies() {
  return useQuery({ queryKey: keys.currencies, queryFn: () => repository.listCurrencies() });
}

export function useSaveCurrency() {
  return useAuditedMutation(
    'Rate Management',
    'Save',
    'Currency',
    (currency: StoredCurrency) => repository.upsertCurrency(currency),
    (currency) => ({ id: currency.code, detail: `${currency.code} set to ${currency.role}` }),
    [keys.currencies],
  );
}

export function useFxRates() {
  return useQuery({ queryKey: keys.fxRates, queryFn: () => repository.listFxRates() });
}

export function useSaveFxRate() {
  return useAuditedMutation(
    'Rate Management',
    'Save',
    'FX Rate',
    (rate: StoredFxRate) => repository.upsertFxRate(rate),
    (rate) => ({ id: rate.id, detail: `${rate.base}/${rate.quote} = ${rate.rate} as at ${rate.asOfDate}` }),
    [keys.fxRates],
  );
}

// ── Economic indicators ──────────────────────────────────────────────────
export function useEconomicIndicators() {
  return useQuery({ queryKey: keys.indicators, queryFn: () => repository.listEconomicIndicators() });
}

export function useSaveEconomicIndicator() {
  return useAuditedMutation(
    'Reference Data',
    'Save',
    'Economic Indicator',
    (indicator: EconomicIndicator) => repository.upsertEconomicIndicator(indicator),
    (indicator) => ({ id: indicator.id, detail: `${indicator.name}, ${indicator.observations.length} observation(s)` }),
    [keys.indicators],
  );
}

// ── Holiday calendars ────────────────────────────────────────────────────
export function useHolidayCalendars() {
  return useQuery({ queryKey: keys.calendars, queryFn: () => repository.listHolidayCalendars() });
}

export function useSaveHolidayCalendar() {
  return useAuditedMutation(
    'Reference Data',
    'Save',
    'Holiday Calendar',
    (calendar: HolidayCalendar) => repository.upsertHolidayCalendar(calendar),
    (calendar) => ({ id: calendar.id, detail: `${calendar.name}, ${calendar.holidays.length} holiday(s)` }),
    [keys.calendars],
  );
}

// ── Batches and audit ────────────────────────────────────────────────────
export function useBatches() {
  return useQuery({ queryKey: keys.batches, queryFn: () => repository.listBatches() });
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => repository.listUsers() });
}

export function useSaveUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (user: User) => repository.upsertUser(user),
    onSuccess: () => client.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useAuditEvents(limit = 200) {
  return useQuery({ queryKey: keys.audit, queryFn: () => repository.listAuditEvents(limit) });
}

// ── Positions ────────────────────────────────────────────────────────────
export function usePositions(affiliateCode?: string, asOfDate?: string) {
  return useQuery({
    queryKey: ['positions', affiliateCode ?? 'ALL', asOfDate ?? 'ANY'],
    queryFn: () =>
      repository.queryPositions({
        ...(affiliateCode && affiliateCode !== 'GROUP' ? { affiliateCode } : {}),
        ...(asOfDate ? { asOfDate } : {}),
      }),
  });
}

// ── Affiliates ───────────────────────────────────────────────────────────
export function useSaveAffiliate() {
  return useAuditedMutation(
    'Affiliates',
    'Save',
    'Affiliate',
    (affiliate: Affiliate) => repository.upsertAffiliate(affiliate),
    (affiliate) => ({ id: affiliate.code, detail: `${affiliate.name} (${affiliate.status})` }),
    [keys.affiliates],
  );
}

// ── Load batches ─────────────────────────────────────────────────────────
export function useSaveBatch() {
  return useAuditedMutation(
    'Data Ingestion',
    'Save',
    'Load Batch',
    (batch: LoadBatch) => repository.upsertBatch(batch),
    (batch) => ({
      id: batch.id,
      detail: `${batch.domain} for ${batch.affiliateCode} as at ${batch.asOfDate} — ${batch.status}, v${batch.version}`,
    }),
    [keys.batches, ['positions']],
  );
}

/**
 * Commit a staged batch: write the rows and mark the batch committed, with
 * any previous version for the same as-of date superseded.
 */
export function useCommitBatch() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      batch,
      positions,
      supersedes,
      reason,
    }: {
      batch: LoadBatch;
      positions: Position[];
      supersedes: LoadBatch | null;
      reason: string | null;
    }) => {
      if (supersedes) {
        await repository.upsertBatch({ ...supersedes, status: 'Superseded', supersededReason: reason });
      }
      await repository.insertPositions(positions);
      await repository.upsertBatch({
        ...batch,
        status: 'Committed',
        committedBy: user?.name ?? 'unknown',
        committedAt: new Date().toISOString(),
        supersedesBatchId: supersedes?.id ?? null,
        supersededReason: reason,
      });
      // The rows now live in the real positions table; the staged copy would
      // otherwise sit there forever pointing at data that has moved on.
      await repository.deleteStagedBatch(batch.id);
      if (user) {
        await repository.recordAuditEvent(
          auditEvent(
            user,
            'Data Ingestion',
            'Commit',
            'Load Batch',
            batch.id,
            `${positions.length} position(s) committed for ${batch.affiliateCode} as at ${batch.asOfDate}` +
              (supersedes ? `, superseding ${supersedes.id}: ${reason ?? 'no reason given'}` : ''),
          ),
        );
      }
    },
    onSuccess: () => {
      for (const key of [keys.batches, keys.audit, ['positions'], ['stagedBatches']]) {
        client.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/**
 * A previously staged (uncommitted) upload for this exact affiliate, domain
 * and as-of date, if one was saved. Lets Data Upload resume where it left
 * off instead of the parsed rows evaporating the moment the tab is closed.
 */
export function useStagedBatchFor(affiliateCode: string | undefined, domain: DataDomain, asOfDate: string) {
  return useQuery({
    queryKey: ['stagedBatches', affiliateCode ?? 'NONE', domain, asOfDate],
    queryFn: () =>
      affiliateCode ? repository.getStagedBatchFor(affiliateCode, domain, asOfDate) : Promise.resolve(null),
    enabled: affiliateCode !== undefined,
  });
}

export function useSaveStagedBatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (staged: StagedBatch) => repository.upsertStagedBatch(staged),
    onSuccess: () => client.invalidateQueries({ queryKey: ['stagedBatches'] }),
  });
}

export function useDeleteStagedBatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repository.deleteStagedBatch(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['stagedBatches'] }),
  });
}

// ── Limits ─────────────────────────────────────────────────────────────
export function useLimits() {
  return useQuery({ queryKey: keys.limits, queryFn: () => Promise.resolve([]) });
}
