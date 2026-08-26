/**
 * Approvals — screen 48.
 *
 * A real maker-checker queue. This used to render a fixed array of four
 * invented requests with Approve/Reject buttons that had no click handler
 * at all. It now reads and writes `ApprovalRequest` rows through the same
 * governance store the ALCO and Regulatory Reporting screens use, and a
 * decision is blocked, with a stated reason, when the signed-in user is
 * also the requester.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates } from '@/lib/hooks';
import { approvals, approvalBlockedReason, newId } from '@/lib/governanceHooks';
import type { ApprovalRequest } from '@/engine/types';

const ACTIONS = ['Create', 'Update', 'Delete', 'Activate', 'Override'] as const;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Withdrawn: 'neutral',
};

export function Approvals() {
  const { user } = useAuth();
  const { data: affiliates = [] } = useAffiliates();
  const { data: requests = [], isLoading } = approvals.useList();
  const save = approvals.useSave();

  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState({
    module: '',
    entityType: '',
    entityId: '',
    entityLabel: '',
    action: 'Update' as ApprovalRequest['action'],
    summary: '',
    affiliateCode: '',
  });

  const pending = requests.filter((r) => r.status === 'Pending');
  const history = requests.filter((r) => r.status !== 'Pending');
  const rows = tab === 'pending' ? pending : history;

  const { search, setSearch, page, setPage, density, setDensity, paged, totalItems, pageSize } = useTableControls(
    rows,
    10,
    ['module', 'entityLabel', 'summary', 'requestedBy'],
  );

  const decide = (request: ApprovalRequest, status: 'Approved' | 'Rejected') => {
    if (!user) return;
    void save.mutateAsync({
      ...request,
      status,
      decidedBy: user.name,
      decidedAt: new Date().toISOString(),
      decisionNote: status === 'Rejected' ? 'Rejected from the Approvals queue.' : null,
    });
  };

  const handleRaise = async () => {
    if (!user || !draft.module || !draft.entityLabel || !draft.summary) return;
    await save.mutateAsync({
      id: newId('APR'),
      module: draft.module,
      entityType: draft.entityType || draft.module,
      entityId: draft.entityId || newId('ENT'),
      entityLabel: draft.entityLabel,
      action: draft.action,
      summary: draft.summary,
      affiliateCode: draft.affiliateCode || null,
      status: 'Pending',
      requestedBy: user.name,
      requestedAt: new Date().toISOString(),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    });
    setNewOpen(false);
    setDraft({ module: '', entityType: '', entityId: '', entityLabel: '', action: 'Update', summary: '', affiliateCode: '' });
  };

  return (
    <>
      <ModuleHeader
        title="Approvals"
        description="Segregation-of-duties queue: the person who raises a request cannot also decide it."
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Pending', value: String(pending.length), tone: pending.length > 0 ? 'warning' : 'success' },
          { label: 'Approved', value: String(requests.filter((r) => r.status === 'Approved').length), tone: 'success' },
          { label: 'Rejected', value: String(requests.filter((r) => r.status === 'Rejected').length) },
          { label: 'Total', value: String(requests.length) },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
          >
            New request
          </button>
        }
      />

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setTab('pending');
            setPage(1);
          }}
          className={`rounded-lg px-4 py-2 text-[12px] font-bold transition-colors ${tab === 'pending' ? 'bg-navy-900 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:border-navy-700'}`}
        >
          Pending ({pending.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('history');
            setPage(1);
          }}
          className={`rounded-lg px-4 py-2 text-[12px] font-bold transition-colors ${tab === 'history' ? 'bg-navy-900 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:border-navy-700'}`}
        >
          History ({history.length})
        </button>
      </div>

      <div className="table-datagrid-container">
        <div className="border-b border-gray-100 bg-white/50 p-5">
          <div className="mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-navy-900">
              {tab === 'pending' ? 'Pending requests' : 'Decided requests'}
            </h3>
            <p className="text-[11px] font-medium text-gray-400">
              {tab === 'pending' ? 'Awaiting a decision from someone other than the requester.' : 'Approved, rejected or withdrawn.'}
            </p>
          </div>
          <TableToolbar
            searchValue={search}
            onSearchChange={setSearch}
            exportData={() => rows}
            exportFilename={`approvals-${tab}`}
            density={density}
            onDensityChange={setDensity}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="table-datagrid">
            <thead>
              <tr>
                <th>Module</th>
                <th>Request</th>
                <th>Requested by</th>
                <th>Requested</th>
                <th>Status</th>
                {tab === 'pending' && <th>Decision</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={tab === 'pending' ? 6 : 5} className="py-8 text-center text-gray-400">
                    Loading.
                  </td>
                </tr>
              )}
              {!isLoading && paged.length === 0 && (
                <tr>
                  <td colSpan={tab === 'pending' ? 6 : 5} className="py-8 text-center text-gray-400">
                    No {tab === 'pending' ? 'pending' : 'decided'} requests. {tab === 'pending' ? 'Click "New request" to raise one.' : 'Decided requests will appear here.'}
                  </td>
                </tr>
              )}
              {paged.map((r) => {
                const blocked = approvalBlockedReason(r, user?.name);
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="text-[11px] font-bold text-navy-900">{r.module}</span>
                    </td>
                    <td>
                      <p className="font-bold text-navy-900">{r.entityLabel}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-gray-400">
                        {r.action}. {r.summary}
                      </p>
                    </td>
                    <td>{r.requestedBy}</td>
                    <td>{new Date(r.requestedAt).toLocaleDateString()}</td>
                    <td>
                      <StatusBadge status={r.status} tone={STATUS_TONE[r.status]} />
                    </td>
                    {tab === 'pending' && (
                      <td>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!!blocked}
                            title={blocked ?? undefined}
                            onClick={() => decide(r, 'Approved')}
                            className="rounded bg-success px-3 py-1 text-[11px] font-bold text-white transition-colors hover:bg-success/80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={!!blocked}
                            title={blocked ?? undefined}
                            onClick={() => decide(r, 'Rejected')}
                            className="rounded bg-danger px-3 py-1 text-[11px] font-bold text-white transition-colors hover:bg-danger/80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
      </div>

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-[13px] font-bold uppercase tracking-wider text-navy-900">New approval request</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="apr-module" className="mb-1 block text-[11px] text-gray-600">
                  Module
                </label>
                <input
                  id="apr-module"
                  value={draft.module}
                  onChange={(e) => setDraft((d) => ({ ...d, module: e.target.value }))}
                  placeholder="e.g. Limits and Breaches"
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="apr-label" className="mb-1 block text-[11px] text-gray-600">
                  What is being changed
                </label>
                <input
                  id="apr-label"
                  value={draft.entityLabel}
                  onChange={(e) => setDraft((d) => ({ ...d, entityLabel: e.target.value }))}
                  placeholder="e.g. Nigeria LCR internal limit"
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="apr-action" className="mb-1 block text-[11px] text-gray-600">
                    Action
                  </label>
                  <select
                    id="apr-action"
                    value={draft.action}
                    onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value as ApprovalRequest['action'] }))}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  >
                    {ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="apr-affiliate" className="mb-1 block text-[11px] text-gray-600">
                    Affiliate
                  </label>
                  <select
                    id="apr-affiliate"
                    value={draft.affiliateCode}
                    onChange={(e) => setDraft((d) => ({ ...d, affiliateCode: e.target.value }))}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  >
                    <option value="">Group-wide</option>
                    {affiliates.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="apr-summary" className="mb-1 block text-[11px] text-gray-600">
                  Summary
                </label>
                <textarea
                  id="apr-summary"
                  value={draft.summary}
                  onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                  rows={3}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRaise()}
                disabled={!draft.module || !draft.entityLabel || !draft.summary}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Raise request
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
