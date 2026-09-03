// Editable snapshots: an investigative/what-if copy of one committed batch's
// positions, kept separate from the Position Book until (if ever) approved
// and committed as a new, superseding batch version. See engine/types.ts
// `PositionSnapshot` for the invariants this enforces.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import { useAuth } from '@/context/AuthContext';
import { executeRun, draftRun, ALL_ELEMENTS, type RunOutcome } from '@/engine/run';
import { assembleInputs } from '@/lib/runHooks';
import { newId } from '@/lib/governanceHooks';
import type { LoadBatch, Position, PositionSnapshot, SnapshotChange, SnapshotEditableField } from '@/engine/types';

export const snapshotKeys = {
  all: ['snapshots'] as const,
  one: (id: string) => ['snapshots', id] as const,
};

export function useSnapshots(affiliateCode?: string) {
  return useQuery({
    queryKey: [...snapshotKeys.all, affiliateCode ?? 'ALL'],
    queryFn: () => repository.listSnapshots(affiliateCode === 'GROUP' ? undefined : affiliateCode),
  });
}

export function useSnapshot(id: string | null) {
  return useQuery({
    queryKey: snapshotKeys.one(id ?? 'none'),
    queryFn: () => (id ? repository.getSnapshot(id) : Promise.resolve(null)),
    enabled: id !== null,
  });
}

/** Clones a committed batch's positions into a new, independently editable Draft snapshot. Never touches the batch. */
export function useCreateSnapshot() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      batch,
      positions,
      reason,
      parentRunId,
    }: {
      batch: LoadBatch;
      positions: Position[];
      reason: string;
      parentRunId: string | null;
    }) => {
      const now = new Date().toISOString();
      const snapshot: PositionSnapshot = {
        id: newId('SNAP'),
        name: `${batch.id} snapshot - ${reason.slice(0, 60) || 'investigation'}`,
        parentBatchId: batch.id,
        parentRunId,
        affiliateCode: batch.affiliateCode,
        asOfDate: batch.asOfDate,
        status: 'Draft',
        reason,
        // Deep-cloned so editing the snapshot can never mutate the array the Position Book screen is holding.
        positions: positions.map((p) => ({ ...p })),
        changes: [],
        createdBy: user?.name ?? 'unknown',
        createdAt: now,
        updatedAt: now,
        lastRecalculatedAt: null,
        committedBatchId: null,
      };
      await repository.upsertSnapshot(snapshot);
      if (user) {
        await repository.recordAuditEvent({
          id: newId('AE-SNAP'),
          module: 'Position Book',
          action: 'Create',
          entity: 'Position Snapshot',
          entityId: snapshot.id,
          userId: user.id,
          userName: user.name,
          role: user.role,
          outcome: 'Success',
          detail: `Editable snapshot opened from ${batch.id} (${positions.length} positions): ${reason}`,
          recordedAt: now,
        });
      }
      return snapshot;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: snapshotKeys.all }),
  });
}

/** Edits one field on one position within a Draft/Recalculated snapshot, appending to its change log. */
export function useEditSnapshotPosition() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      snapshot,
      positionId,
      field,
      newValue,
    }: {
      snapshot: PositionSnapshot;
      positionId: string;
      field: SnapshotEditableField;
      newValue: string | number | boolean | null;
    }) => {
      const position = snapshot.positions.find((p) => p.id === positionId);
      if (!position) throw new Error(`Position ${positionId} is not part of this snapshot.`);
      const oldValue = (position as unknown as Record<string, string | number | boolean | null>)[field] ?? null;
      if (oldValue === newValue) return snapshot;

      const now = new Date().toISOString();
      const change: SnapshotChange = {
        positionId,
        field,
        oldValue,
        newValue,
        changedBy: user?.name ?? 'unknown',
        changedAt: now,
      };
      const updated: PositionSnapshot = {
        ...snapshot,
        status: 'Draft', // an edit after recalculation invalidates the last comparison - back to Draft until recalculated again
        positions: snapshot.positions.map((p) => (p.id === positionId ? { ...p, [field]: newValue } : p)),
        changes: [...snapshot.changes, change],
        updatedAt: now,
        lastRecalculatedAt: null,
      };
      await repository.upsertSnapshot(updated);
      return updated;
    },
    onSuccess: (updated) => {
      client.invalidateQueries({ queryKey: snapshotKeys.all });
      client.invalidateQueries({ queryKey: snapshotKeys.one(updated.id) });
    },
  });
}

/** Moves a Recalculated snapshot into the approval queue - segregation of duties applies from here on: the requester cannot also approve it. */
export function useSubmitSnapshotForApproval() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (snapshot: PositionSnapshot) => {
      if (!user) throw new Error('Not signed in.');
      const now = new Date().toISOString();
      await repository.upsertSnapshot({ ...snapshot, status: 'PendingApproval', updatedAt: now });
      await repository.upsertApprovalRequest({
        id: newId('APR'),
        module: 'Position Snapshot',
        entityType: 'PositionSnapshot',
        entityId: snapshot.id,
        entityLabel: snapshot.name,
        action: 'Update',
        summary: `${snapshot.changes.length} field change(s) on ${snapshot.parentBatchId}: ${snapshot.reason}`,
        affiliateCode: snapshot.affiliateCode,
        status: 'Pending',
        requestedBy: user.name,
        requestedAt: now,
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
      });
    },
    onSuccess: (_r, snapshot) => {
      client.invalidateQueries({ queryKey: snapshotKeys.all });
      client.invalidateQueries({ queryKey: snapshotKeys.one(snapshot.id) });
      client.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useDiscardSnapshot() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (snapshot: PositionSnapshot) => {
      await repository.upsertSnapshot({ ...snapshot, status: 'Discarded', updatedAt: new Date().toISOString() });
      if (user) {
        await repository.recordAuditEvent({
          id: newId('AE-SNAP'),
          module: 'Position Book',
          action: 'Discard',
          entity: 'Position Snapshot',
          entityId: snapshot.id,
          userId: user.id,
          userName: user.name,
          role: user.role,
          outcome: 'Success',
          detail: `Snapshot discarded without affecting ${snapshot.parentBatchId}.`,
          recordedAt: new Date().toISOString(),
        });
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: snapshotKeys.all }),
  });
}

export interface SnapshotComparison {
  baseline: RunOutcome;
  edited: RunOutcome;
}

/**
 * Recalculates the full element set twice over the same scope - once against
 * the parent batch's untouched positions (baseline) and once with this
 * snapshot's edited positions substituted in (edited) - so Original vs
 * Snapshot reflects exactly one difference: the edits.
 */
export function useRecalculateSnapshot() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (snapshot: PositionSnapshot): Promise<SnapshotComparison> => {
      const affiliate = await repository.getAffiliate(snapshot.affiliateCode);
      const compareRun = draftRun({
        id: `${snapshot.id}-COMPARE`,
        name: `${snapshot.name} - comparison`,
        asOfDate: snapshot.asOfDate,
        affiliateCode: snapshot.affiliateCode,
        reportingCurrency: affiliate?.functionalCurrency ?? 'USD',
        timeBucketRuleId: '',
        batchIds: [snapshot.parentBatchId],
        createdBy: 'system',
        createdAt: new Date().toISOString(),
        elements: ALL_ELEMENTS,
      });

      const inputs = await assembleInputs(compareRun);
      const now = new Date().toISOString();

      const baseline = executeRun(compareRun, inputs, now);

      const editedById = new Map(snapshot.positions.map((p) => [p.id, p]));
      const editedPositions = inputs.positions.map((p) => editedById.get(p.id) ?? p);
      const edited = executeRun({ ...compareRun, id: `${snapshot.id}-COMPARE-EDITED` }, { ...inputs, positions: editedPositions }, now);

      const updated: PositionSnapshot = { ...snapshot, status: 'Recalculated', lastRecalculatedAt: now, updatedAt: now };
      await repository.upsertSnapshot(updated);

      return { baseline, edited };
    },
    onSuccess: (_result, snapshot) => {
      client.invalidateQueries({ queryKey: snapshotKeys.all });
      client.invalidateQueries({ queryKey: snapshotKeys.one(snapshot.id) });
    },
  });
}

/**
 * Turns an approved snapshot into official data: a new Position Book
 * version, committed through the ordinary supersede path (never overwriting
 * the parent batch), plus the audit trail linking the two. Called from
 * Approvals once a maker-checker request against this snapshot is approved.
 */
export function useCommitSnapshot() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (snapshot: PositionSnapshot) => {
      const parent = await repository.getBatch(snapshot.parentBatchId);
      if (!parent) throw new Error(`Parent batch ${snapshot.parentBatchId} no longer exists.`);

      const now = new Date().toISOString();
      const newBatch: LoadBatch = {
        ...parent,
        id: `${parent.id}-ADJ-${Date.now().toString(36).toUpperCase()}`,
        version: parent.version + 1,
        fileName: `${snapshot.name} (adjustment)`,
        fileHash: `snapshot:${snapshot.id}`,
        rowCount: snapshot.positions.length,
        rowsAccepted: snapshot.positions.length,
        rowsRejected: 0,
        status: 'Committed',
        supersedesBatchId: parent.id,
        supersededReason: `Editable snapshot approved: ${snapshot.reason}`,
        uploadedBy: snapshot.createdBy,
        uploadedAt: snapshot.createdAt,
        committedBy: user?.name ?? 'unknown',
        committedAt: now,
        reconciledBy: null,
        reconciledAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectedReason: null,
      };

      // The adjusted rows carry both a new id and the new batch's id: positions are keyed by id alone
      // (see AscentDb.positions in store/db.ts), so reusing the parent's position id here would overwrite
      // that row in place - silently mutating the very history this flow exists to protect.
      const adjustedPositions = snapshot.positions.map((p) => ({ ...p, id: `${p.id}-v${newBatch.version}`, batchId: newBatch.id }));

      await repository.upsertBatch({ ...parent, status: 'Superseded', supersededReason: newBatch.supersededReason });
      await repository.insertPositions(adjustedPositions);
      await repository.upsertBatch(newBatch);
      await repository.upsertSnapshot({ ...snapshot, status: 'Committed', committedBatchId: newBatch.id, updatedAt: now });

      if (user) {
        await repository.recordAuditEvent({
          id: newId('AE-SNAP'),
          module: 'Position Book',
          action: 'Commit',
          entity: 'Position Snapshot',
          entityId: snapshot.id,
          userId: user.id,
          userName: user.name,
          role: user.role,
          outcome: 'Success',
          detail: `Approved snapshot committed as ${newBatch.id} (v${newBatch.version}), superseding ${parent.id}. ${snapshot.changes.length} field change(s).`,
          recordedAt: now,
        });
      }

      return newBatch;
    },
    onSuccess: () => {
      for (const key of [['batches'], ['positions'], snapshotKeys.all, ['auditEvents']]) {
        client.invalidateQueries({ queryKey: key });
      }
    },
  });
}
