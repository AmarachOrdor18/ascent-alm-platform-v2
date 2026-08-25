/**
 * Schedules — read, write, and fire.
 *
 * Firing a schedule clones its template run, stamps the new as-of date, and
 * executes it through the same path as a manual run. There is deliberately
 * no second execution route: a scheduled run and a hand-started one produce
 * results the same way, so a figure cannot depend on how it was triggered.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import { useAuth } from '@/context/AuthContext';
import { useExecuteRun } from './runHooks';
import type { IsoDate, ProcessRun, RunSchedule } from '@/engine/types';

export const scheduleKeys = {
  all: ['schedules'] as const,
};

export function useSchedules(affiliateCode?: string) {
  return useQuery({
    queryKey: [...scheduleKeys.all, affiliateCode ?? 'ALL'],
    queryFn: () => repository.listSchedules(affiliateCode === 'GROUP' ? undefined : affiliateCode),
  });
}

export function useSaveSchedule() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (schedule: RunSchedule) => {
      await repository.upsertSchedule({
        ...schedule,
        updatedBy: user?.name ?? null,
        updatedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: scheduleKeys.all }),
  });
}

export function useDeleteSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repository.deleteSchedule(id),
    onSuccess: () => client.invalidateQueries({ queryKey: scheduleKeys.all }),
  });
}

export interface FireOccurrence {
  schedule: RunSchedule;
  occurrenceDate: IsoDate;
}

/**
 * Execute one occurrence.
 *
 * The template run is copied rather than reused, so the schedule's history
 * is a series of distinct, independently auditable runs. `asOfDate` comes
 * from the occurrence, not from the template.
 */
export function useFireOccurrence() {
  const client = useQueryClient();
  const { user } = useAuth();
  const execute = useExecuteRun();

  return useMutation({
    mutationFn: async ({ schedule, occurrenceDate }: FireOccurrence) => {
      const template = await repository.getRun(schedule.templateRunId);
      if (!template) throw new Error(`Schedule "${schedule.name}" points at a run that no longer exists.`);

      const cloned: ProcessRun = {
        ...template,
        id: `RUN-${Date.now().toString(36).toUpperCase()}`,
        name: `${schedule.name} — ${occurrenceDate}`,
        asOfDate: occurrenceDate,
        status: 'Queued',
        createdBy: user?.name ?? 'scheduler',
        createdAt: new Date().toISOString(),
        completedAt: null,
        errorLog: [],
      };

      const outcome = await execute.mutateAsync(cloned);

      // Advance the watermark only on success. A failed occurrence stays in
      // the backlog, because the pack it was meant to produce still does not
      // exist.
      if (outcome.run.status === 'Completed') {
        await repository.upsertSchedule({
          ...schedule,
          lastRunDate: occurrenceDate,
          lastRunId: outcome.run.id,
          updatedBy: user?.name ?? null,
          updatedAt: new Date().toISOString(),
        });
      }

      return outcome;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}
