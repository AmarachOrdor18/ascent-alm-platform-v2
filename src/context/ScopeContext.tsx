import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { repository } from '@/store/repositoryInstance';
import type { Affiliate, CurrencyCode, IsoDate, LoadBatch, ProcessRun, WorkingContext } from '@/engine/types';

export const GROUP_CODE = 'GROUP';

/**
 * The working context (teardown §8): the scope (Group or one affiliate) and the working as-of date, set once
 * in the header and inherited by every screen - data upload, readiness, run, results. It is saved on the
 * user's own record (app_users.data.workingContext), so it survives a refresh and follows them across
 * devices. Market data keeps its own dates (the nearest on or before the working date is used).
 */
interface ScopeContextValue {
  /** `GROUP` consolidates every Live affiliate. */
  affiliateCode: string;
  setAffiliateCode: (code: string) => void;
  affiliate: Affiliate | null;

  /**
   * The working as-of date: the one chosen in the header when the scope has committed data for it, else the
   * scope's latest committed date. Null only when the scope has no committed position data at all.
   */
  asOfDate: IsoDate | null;
  /** Pick the working date (null = follow the latest committed date). */
  setAsOfDate: (date: IsoDate | null) => void;
  /** Dates with committed position data for the current scope, newest first. */
  availableDates: IsoDate[];
  /** True when the date was picked rather than defaulted to the latest. */
  asOfDateChosen: boolean;

  /** The run results screens read from (a session-only version choice). Null = the official run for the date. */
  run: ProcessRun | null;
  setRun: (run: ProcessRun | null) => void;

  /** Reporting currency for the current scope - the affiliate's own, or USD at Group. */
  currency: CurrencyCode;

  affiliates: Affiliate[];
  setAffiliates: (affiliates: Affiliate[]) => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

/** Committed position dates for a scope, newest first (Group: every Live affiliate's). */
export function datesForScope(batches: LoadBatch[], affiliateCode: string, affiliates: Affiliate[]): IsoDate[] {
  const codes =
    affiliateCode === GROUP_CODE
      ? new Set(affiliates.filter((a) => a.code !== GROUP_CODE && a.status === 'Live').map((a) => a.code))
      : new Set([affiliateCode]);
  return Array.from(
    new Set(
      batches
        .filter((b) => b.domain === 'Positions' && b.status === 'Committed' && codes.has(b.affiliateCode))
        .map((b) => b.asOfDate),
    ),
  ).sort((a, b) => b.localeCompare(a));
}

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const { user, hasPermission } = useAuth();
  const [affiliateCode, setAffiliateCodeState] = useState<string>(user?.affiliateCode ?? GROUP_CODE);
  const [chosenDate, setChosenDate] = useState<IsoDate | null>(null);
  const [run, setRun] = useState<ProcessRun | null>(null);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  // Saving starts only after this user's saved context has been applied, so restoring never writes back.
  const restoredFor = useRef<string | null>(null);

  // Same cache entry as useBatches() - the header and every screen share one list.
  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: () => repository.listBatches(),
    enabled: !!user,
  });

  const restricted = !!user && user.affiliateCode !== GROUP_CODE && !hasPermission('group.manage');

  // Restore the saved working context on every login/logout; an affiliate-scoped user is always fixed to
  // their own affiliate, whatever was saved.
  useEffect(() => {
    const saved = user?.workingContext;
    const code = !user
      ? GROUP_CODE
      : restricted
        ? user.affiliateCode
        : (saved?.affiliateCode ?? user.affiliateCode ?? GROUP_CODE);
    setAffiliateCodeState(code);
    setChosenDate(saved && saved.affiliateCode === code ? saved.asOfDate : null);
    setRun(null);
    restoredFor.current = user?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on identity, not the whole user object
  }, [user?.id]);

  const availableDates = useMemo(
    () => datesForScope(batches, affiliateCode, affiliates),
    [batches, affiliateCode, affiliates],
  );
  // The chosen date is the working date even before any data exists for it - uploads are stamped with it.
  const asOfDate = chosenDate ?? availableDates[0] ?? null;

  // Persist (debounced) to the user's own record - self-editable, like toursSeen.
  useEffect(() => {
    if (!user || restoredFor.current !== user.id) return;
    const saved = user.workingContext;
    if (saved && saved.affiliateCode === affiliateCode && saved.asOfDate === chosenDate) return;
    const handle = window.setTimeout(() => {
      const workingContext: WorkingContext = {
        affiliateCode,
        asOfDate: chosenDate,
        updatedAt: new Date().toISOString(),
      };
      repository
        .getUserByEmail(user.email)
        .then((fresh) => (fresh ? repository.upsertUser({ ...fresh, workingContext }) : undefined))
        .catch(() => {
          /* best effort - the context still applies for this session */
        });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [user, affiliateCode, chosenDate]);

  const affiliate = useMemo(
    () => affiliates.find((a) => a.code === affiliateCode) ?? null,
    [affiliates, affiliateCode],
  );

  const value = useMemo<ScopeContextValue>(
    () => ({
      affiliateCode,
      // A run is scoped to one affiliate and one as-of date, so changing either invalidates it.
      setAffiliateCode: (code: string) => {
        if (restricted && user && code !== user.affiliateCode) return;
        setAffiliateCodeState(code);
        setRun(null);
      },
      affiliate,
      asOfDate,
      setAsOfDate: (date: IsoDate | null) => {
        setChosenDate(date);
        setRun(null);
      },
      availableDates,
      asOfDateChosen: !!chosenDate,
      run,
      setRun,
      // Functional currency at affiliate scope; Group consolidates in USD.
      currency: affiliateCode === GROUP_CODE ? 'USD' : (affiliate?.functionalCurrency ?? 'USD'),
      affiliates,
      setAffiliates,
    }),
    [affiliateCode, affiliate, asOfDate, availableDates, chosenDate, run, affiliates, restricted, user],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used within ScopeProvider');
  return ctx;
}

/** The working context in one object - scope, affiliate, working date and the dates to choose from. */
export function useWorkingContext() {
  const {
    affiliateCode,
    affiliate,
    asOfDate,
    availableDates,
    setAffiliateCode,
    setAsOfDate,
    asOfDateChosen,
    currency,
  } = useScope();
  return {
    affiliateCode,
    affiliate,
    asOfDate,
    availableDates,
    setAffiliateCode,
    setAsOfDate,
    asOfDateChosen,
    currency,
    isGroup: affiliateCode === GROUP_CODE,
  };
}
