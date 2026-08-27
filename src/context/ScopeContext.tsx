import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
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
  const { user } = useAuth();
  const [affiliateCode, setAffiliateCode] = useState<string>(user?.affiliateCode ?? GROUP_CODE);
  const [asOfDate, setAsOfDate] = useState<IsoDate | null>(null);
  const [run, setRun] = useState<ProcessRun | null>(null);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);

  // Re-sync scope to the signed-in user's affiliate on every login/logout.
  useEffect(() => {
    setAffiliateCode(user?.affiliateCode ?? GROUP_CODE);
    setAsOfDate(null);
    setRun(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on identity, not the whole user object
  }, [user?.id]);

  const affiliate = useMemo(
    () => affiliates.find((a) => a.code === affiliateCode) ?? null,
    [affiliates, affiliateCode],
  );

  const value = useMemo<ScopeContextValue>(
    () => ({
      affiliateCode,
      // A run is scoped to one affiliate and one as-of date, so changing either invalidates it.
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
      // Functional currency at affiliate scope; Group consolidates in USD.
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
