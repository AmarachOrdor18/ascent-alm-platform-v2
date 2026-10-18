// React Query hooks for onboarding state and scoped settings. Logic lives in lib/onboarding.ts.
import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  ORG_ONBOARDING_ID,
  affiliateOnboardingId,
  atStep,
  completeOnboarding,
  emptyOnboarding,
  markStep,
} from '@/lib/onboarding';
import { repository } from '@/store/repositoryInstance';
import type { OnboardingRecord, SettingRecord } from '@/engine/types';

export const onboardingKeys = {
  all: ['onboarding'] as const,
  one: (id: string) => ['onboarding', id] as const,
  settings: (affiliateCode?: string) => ['settings', affiliateCode ?? 'ALL'] as const,
  settingsAll: ['settings'] as const,
};

export function useOnboardingRecords(enabled = true) {
  return useQuery({ queryKey: onboardingKeys.all, queryFn: () => repository.listOnboarding(), enabled });
}

export function useOnboardingRecord(id: string | null | undefined) {
  return useQuery({
    queryKey: onboardingKeys.one(id ?? ''),
    queryFn: () => repository.getOnboarding(id!),
    enabled: !!id,
  });
}

export function useSaveOnboarding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (record: OnboardingRecord) => repository.upsertOnboarding(record),
    onSuccess: () => client.invalidateQueries({ queryKey: onboardingKeys.all }),
  });
}

export function useSettings(affiliateCode?: string) {
  return useQuery({
    queryKey: onboardingKeys.settings(affiliateCode),
    queryFn: () => repository.listSettings(affiliateCode),
  });
}

export function useSaveSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (setting: SettingRecord) => repository.upsertSetting(setting),
    onSuccess: () => client.invalidateQueries({ queryKey: onboardingKeys.settingsAll }),
  });
}

export function useDeleteSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repository.deleteSetting(id),
    onSuccess: () => client.invalidateQueries({ queryKey: onboardingKeys.settingsAll }),
  });
}

/**
 * One onboarding record plus the three ways a guided set-up moves it on. Every change is saved immediately,
 * so a refresh resumes where the user was. Builds on the last saved copy rather than the (possibly not yet
 * refetched) query data, so quick successive steps never overwrite each other.
 */
function useOnboardingFlow(id: string | null, blank: () => OnboardingRecord) {
  const { user } = useAuth();
  const query = useOnboardingRecord(id);
  const save = useSaveOnboarding();
  const latest = useRef<OnboardingRecord | null>(null);
  useEffect(() => {
    if (query.data !== undefined) latest.current = query.data;
  }, [query.data]);
  const by = user?.name ?? 'unknown';
  const base = useCallback(() => latest.current ?? query.data ?? blank(), [query.data, blank]);
  const persist = useCallback(
    async (record: OnboardingRecord) => {
      latest.current = record;
      await save.mutateAsync(record);
      return record;
    },
    [save],
  );

  return {
    record: query.data ?? null,
    isLoading: !!id && query.isLoading,
    /** Saves `step` as the resume point. */
    goTo: (step: string) => persist(atStep(base(), step, by)),
    /** Marks `step` done and, when given, moves the resume point on to `next`. */
    markDone: (step: string, next?: string) => {
      let record = markStep(base(), step, true, by);
      if (next && record.status !== 'Complete') record = atStep(record, next, by);
      return persist(record);
    },
    complete: () => persist(completeOnboarding(base(), by)),
  };
}

const blankOrg = () => emptyOnboarding('Organisation');

/** The organisation onboarding record ('ORG'). */
export function useOrgOnboarding() {
  return useOnboardingFlow(ORG_ONBOARDING_ID, blankOrg);
}

/** One affiliate's onboarding record ('AFF:<code>'). */
export function useAffiliateOnboarding(affiliateCode: string | null | undefined) {
  const blank = useCallback(() => emptyOnboarding('Affiliate', affiliateCode ?? ''), [affiliateCode]);
  return useOnboardingFlow(affiliateCode ? affiliateOnboardingId(affiliateCode) : null, blank);
}
