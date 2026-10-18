// React Query hooks over the pure readiness model (lib/readiness.ts). Readiness is derived, never stored:
// it is recomputed from the same queries every screen already reads, so whatever invalidates those (an
// upload, an approval, a market-data load, an affiliate going Live, a run being signed off or reopened)
// recalculates readiness everywhere at once. `invalidateReadinessInputs` refreshes them all explicitly.
import { useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAffiliates, useBatches, useEconomicIndicators, useFxRates, usePositions, useYieldCurves } from './hooks';
import { useRules } from './ruleHooks';
import { useRuns } from './runHooks';
import { approvals } from './governanceHooks';
import { repository } from '@/store/repositoryInstance';
import {
  committedDates,
  computeReadiness,
  DEFAULT_MARKET_DATA_SLA_DAYS,
  MARKET_DATA_SLA_SETTING,
  type Readiness,
  type ReadinessRules,
  type RunSelection,
} from './readiness';
import type { IsoDate, RuleMeta } from '@/engine/types';

const today = () => new Date().toISOString().slice(0, 10);

/** Every query readiness reads - invalidate these after anything that can change it. */
export const READINESS_INPUT_KEYS: ReadonlyArray<readonly unknown[]> = [
  ['affiliates'],
  ['batches'],
  ['positions'],
  ['fxRates'],
  ['yieldCurves'],
  ['economicIndicators'],
  ['rules'],
  ['approvals'],
  ['runs'],
  ['settings'],
];

export function invalidateReadinessInputs(client: QueryClient): void {
  for (const key of READINESS_INPUT_KEYS) void client.invalidateQueries({ queryKey: key });
}

/** Convenience hook form of invalidateReadinessInputs. */
export function useInvalidateReadiness(): () => void {
  const client = useQueryClient();
  return () => invalidateReadinessInputs(client);
}

/** The organisation's market-data freshness limit in days (setting marketData.slaDays, default 30). */
export function useMarketDataSlaDays(): number {
  const { data: settings = [] } = useQuery({
    queryKey: ['settings', 'GROUP'],
    queryFn: () => repository.listSettings('GROUP'),
  });
  const row = settings.find((s) => s.affiliateCode === 'GROUP' && s.key === MARKET_DATA_SLA_SETTING);
  const value = Number(row?.value);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MARKET_DATA_SLA_DAYS;
}

function useReadinessRules(): { rules: ReadinessRules; loading: boolean } {
  const tb = useRules<RuleMeta>('TimeBucket');
  const pc = useRules<RuleMeta>('ProductCharacteristic');
  const bp = useRules<RuleMeta>('BehaviourPattern');
  const pp = useRules<RuleMeta>('Prepayment');
  const ftp = useRules<RuleMeta>('FtpRule');
  const ca = useRules<RuleMeta>('CostAllocation');
  const cl = useRules<RuleMeta>('CreditLoss');
  const cap = useRules<RuleMeta>('CapitalAllocation');
  const rules = useMemo(
    () => ({
      timeBucket: tb.data ?? [],
      productCharacteristic: pc.data ?? [],
      behaviourPattern: bp.data ?? [],
      prepayment: pp.data ?? [],
      ftp: ftp.data ?? [],
      costAllocation: ca.data ?? [],
      creditLoss: cl.data ?? [],
      capital: cap.data ?? [],
    }),
    [tb.data, pc.data, bp.data, pp.data, ftp.data, ca.data, cl.data, cap.data],
  );
  return { rules, loading: [tb, pc, bp, pp, ftp, ca, cl, cap].some((q) => q.isLoading) };
}

export interface ReadinessResult {
  readiness: Readiness | null;
  isLoading: boolean;
}

/**
 * Readiness of one affiliate (or GROUP, for the consolidated run) for one as-of date. With no date given,
 * the latest committed date is used. `selection` is only passed by the Run screen (elements chosen and any
 * unapproved rule selected), adding those blockers.
 */
export function useReadiness(
  affiliateCode: string | null | undefined,
  asOfDate: IsoDate | null | undefined,
  selection?: RunSelection,
): ReadinessResult {
  const code = affiliateCode ?? '';
  const { data: affiliates = [], isLoading: la } = useAffiliates();
  const { data: batches = [], isLoading: lb } = useBatches();
  const { data: fxRates = [] } = useFxRates();
  const { data: yieldCurves = [] } = useYieldCurves();
  const { data: indicators = [] } = useEconomicIndicators();
  const { data: requests = [], isLoading: lr } = approvals.useList();
  const { data: runs = [] } = useRuns(code || undefined);
  const { rules, loading } = useReadinessRules();
  const slaDays = useMarketDataSlaDays();
  const date = asOfDate ?? (code ? (committedDates(batches, code, affiliates)[0] ?? null) : null);
  const wantsPositions = !!code && code !== 'GROUP' && !!date;
  const { data: positions } = usePositions(code, date ?? undefined, { enabled: wantsPositions });
  const scopedPositions = wantsPositions ? positions : undefined;

  const readiness = useMemo(
    () =>
      code
        ? computeReadiness({
            affiliateCode: code,
            affiliates,
            asOfDate: date,
            batches,
            fxRates,
            yieldCurves,
            indicators,
            rules,
            approvals: requests,
            runs,
            positions: scopedPositions,
            slaDays,
            today: today(),
            selection,
          })
        : null,
    [
      code,
      affiliates,
      date,
      batches,
      fxRates,
      yieldCurves,
      indicators,
      rules,
      requests,
      runs,
      scopedPositions,
      slaDays,
      selection,
    ],
  );
  return { readiness, isLoading: la || lb || lr || loading };
}

export interface GroupReadinessRow {
  affiliateCode: string;
  affiliateName: string;
  status: string;
  readiness: Readiness;
}

/**
 * Readiness of every affiliate (one row each), for the Group-scope view. With a date, every affiliate is
 * judged for that date; without one, each at its own latest committed date.
 */
export function useGroupReadiness(asOfDate: IsoDate | null | undefined): {
  rows: GroupReadinessRow[];
  isLoading: boolean;
} {
  const { data: affiliates = [], isLoading: la } = useAffiliates();
  const { data: batches = [], isLoading: lb } = useBatches();
  const { data: fxRates = [] } = useFxRates();
  const { data: yieldCurves = [] } = useYieldCurves();
  const { data: indicators = [] } = useEconomicIndicators();
  const { data: requests = [], isLoading: lr } = approvals.useList();
  const { data: runs = [] } = useRuns();
  const { rules, loading } = useReadinessRules();
  const slaDays = useMarketDataSlaDays();

  const rows = useMemo(
    () =>
      affiliates
        .filter((a) => a.code !== 'GROUP')
        .map((a) => ({
          affiliateCode: a.code,
          affiliateName: a.name,
          status: a.status,
          readiness: computeReadiness({
            affiliateCode: a.code,
            affiliates,
            asOfDate: asOfDate ?? committedDates(batches, a.code, affiliates)[0] ?? null,
            batches,
            fxRates,
            yieldCurves,
            indicators,
            rules,
            approvals: requests,
            runs,
            slaDays,
            today: today(),
          }),
        })),
    [affiliates, asOfDate, batches, fxRates, yieldCurves, indicators, rules, requests, runs, slaDays],
  );
  return { rows, isLoading: la || lb || lr || loading };
}
