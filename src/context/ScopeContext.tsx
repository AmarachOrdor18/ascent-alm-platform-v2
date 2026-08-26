/**
 * The reporting scope every results screen reads from.
 *
 * This is the architectural fix for defect D-01. In v1 the affiliate
 * switcher only changed a subtitle string, because the risk engines fetched
 * every position unconditionally and no screen passed a filter. Here the
 * scope — affiliate, as-of date and the selected run — is the thing results
 * are *derived from*, so a screen cannot accidentally show unscoped data:
 * there is no unscoped query to write.
 */

import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Affiliate, CurrencyCode, IsoDate, ProcessRun } from '@/engine/types';

export const GROUP_CODE = 'GROUP';

interface ScopeContextValue {
  /** `GROUP` consolidates every Live affiliate. */
  affiliateCode: string;
  setAffiliateCode: (code: string) => void;
  affiliate: Affiliate | null;

  asOfDate: IsoDate | null;
  setAsOfDate: (date: IsoDate) => void;

  /** The run results screens read from. Null until a run has been selected or executed. */
  run: ProcessRun | null;
  setRun: (run: ProcessRun | null) => void;

  /** Reporting currency for the current scope — the affiliate's own, or USD at Group. */
  currency: CurrencyCode;

  affiliates: Affiliate[];
  setAffiliates: (affiliates: Affiliate[]) => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [affiliateCode, setAffiliateCode] = useState<string>(GROUP_CODE);
  const [asOfDate, setAsOfDate] = useState<IsoDate | null>(null);
  const [run, setRun] = useState<ProcessRun | null>(null);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);

  const affiliate = useMemo(
    () => affiliates.find((a) => a.code === affiliateCode) ?? null,
    [affiliates, affiliateCode],
  );

  const value = useMemo<ScopeContextValue>(
    () => ({
      affiliateCode,
      // Changing scope invalidates the selected run — a run belongs to one
      // affiliate and one as-of date, so carrying it across would show the
      // previous affiliate's numbers under the new affiliate's name, which
      // is precisely the v1 failure this context exists to prevent.
      setAffiliateCode: (code: string) => {
        setAffiliateCode(code);
        setRun(null);
      },
      affiliate,
      asOfDate,
      setAsOfDate: (date: IsoDate) => {
        setAsOfDate(date);
        setRun(null);
      },
      run,
      setRun,
      // The affiliate's own functional currency, not its reporting currency
      // (which every affiliate here reports up to Group as, USD) — every
      // results screen computes and displays in functional currency at
      // affiliate scope, so the shell's badge showing reporting currency
      // instead just looked wrong next to the actual figures underneath.
      // Only Group scope, which genuinely consolidates through USD, shows USD.
      currency: affiliateCode === GROUP_CODE ? 'USD' : (affiliate?.functionalCurrency ?? 'USD'),
      affiliates,
      setAffiliates,
    }),
    [affiliateCode, affiliate, asOfDate, run, affiliates],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used within ScopeProvider');
  return ctx;
}
