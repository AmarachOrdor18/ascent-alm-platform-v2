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
import type {
  AuditEvent,
  DimensionType,
  EconomicIndicator,
  HolidayCalendar,
  RoleCode,
  StoredCurrency,
  StoredFxRate,
  StoredYieldCurve,
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

export function useAuditEvents(limit = 200) {
  return useQuery({ queryKey: keys.audit, queryFn: () => repository.listAuditEvents(limit) });
}
