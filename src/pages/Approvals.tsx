/**
 * Approvals — screen 48 (Phase 7).
 *
 * Maker-checker workflow for all approvals: affiliate activations, rule changes, limit adjustments, remediation closures.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface ApprovalItem {
  id: string;
  type: string;
  title: string;
  description: string;
  requester: string;
  requestedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requiresApprovalFrom: string;
}

export function Approvals() {
  const [selectedTab, setSelectedTab] = useState<'pending' | 'history'>('pending');

  // Mock approval data
  const mockApprovals: ApprovalItem[] = [
    {
      id: 'APP-001',
      type: 'Affiliate Activation',
      title: 'Ecobank Zambia - Go-Live Approval',
      description: 'Request to move Zambia affiliate from Testing to Live status. All onboarding steps completed, GL reconciliation approved.',
      requester: 'Adaeze Okonkwo',
      requestedAt: '2026-08-25',
      status: 'Pending',
      requiresApprovalFrom: 'Group Risk Committee',
    },
    {
      id: 'APP-002',
      type: 'Rule Change',
      title: 'LCR Warning Threshold Adjustment',
      description: 'Request to lower LCR warning threshold from 110% to 105% for NG affiliate based on updated risk appetite.',
      requester: 'Chinwe Okafor',
      requestedAt: '2026-08-24',
      status: 'Pending',
      requiresApprovalFrom: 'Chief Risk Officer',
    },
    {
      id: 'APP-003',
      type: 'Remediation Closure',
      title: 'Data Quality Issue Closure - CR-3',
      description: 'Request to close remediation issue CR-3 after successful GL reconciliation for Ghana affiliate.',
      requester: 'Samuel Owusu',
      requestedAt: '2026-08-23',
      status: 'Approved',
      requiresApprovalFrom: 'Control Testing Lead',
    },
    {
      id: 'APP-004',
      type: 'Limit Configuration',
      title: 'New Deposit Concentration Limit',
      description: 'Request to add new concentration limit for CI affiliate at 30% threshold.',
      requester: 'Aminata Traoré',
      requestedAt: '2026-08-22',
      status: 'Rejected',
      requiresApprovalFrom: 'Group Treasury',
    },
  ];

  const pendingApprovals = mockApprovals.filter((a) => a.status === 'Pending');
  const historyApprovals = mockApprovals.filter((a) => a.status !== 'Pending');

  const pendingCount = pendingApprovals.length;
  const approvedCount = mockApprovals.filter((a) => a.status === 'Approved').length;
  const rejectedCount = mockApprovals.filter((a) => a.status === 'Rejected').length;

  return (
    <>
      <ModuleHeader
        title="Approvals & Exceptions"
        description="Maker-checker workflow for all approvals: affiliate activations, rule changes, limit adjustments, remediation closures"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Pending Approvals', value: String(pendingCount), tone: pendingCount > 0 ? 'warning' : 'success' },
          { label: 'Approved Today', value: String(approvedCount), tone: 'success' },
          { label: 'Rejected Today', value: String(rejectedCount), tone: rejectedCount > 0 ? 'danger' : 'neutral' },
          { label: 'Total This Week', value: String(mockApprovals.length) },
        ]}
      />

      <div className="mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedTab('pending')}
            className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
              selectedTab === 'pending' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setSelectedTab('history')}
            className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
              selectedTab === 'history' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
            }`}
          >
            History ({historyApprovals.length})
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-white/50">
          <h3 className="font-bold text-navy-900 text-sm uppercase tracking-wider">
            {selectedTab === 'pending' ? 'Pending Approvals' : 'Approval History'}
          </h3>
          <p className="text-[11px] text-gray-400 font-medium">
            {selectedTab === 'pending' ? 'Items awaiting your review and approval' : 'Recently processed approvals'}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="table-datagrid">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Requester</th>
                <th>Requires Approval From</th>
                <th>Requested</th>
                <th>Status</th>
                {selectedTab === 'pending' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(selectedTab === 'pending' ? pendingApprovals : historyApprovals).map((approval) => (
                <tr key={approval.id}>
                  <td>
                    <span className="text-[11px] font-bold text-navy-900">{approval.type}</span>
                  </td>
                  <td>
                    <p className="font-bold text-navy-900">{approval.title}</p>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">{approval.description}</p>
                  </td>
                  <td>{approval.requester}</td>
                  <td>{approval.requiresApprovalFrom}</td>
                  <td>{new Date(approval.requestedAt).toLocaleDateString()}</td>
                  <td><StatusBadge status={approval.status} /></td>
                  {selectedTab === 'pending' && (
                    <td>
                      <div className="flex gap-2">
                        <button className="rounded bg-success px-3 py-1 text-[11px] font-bold text-white hover:bg-success/80 transition-colors">
                          Approve
                        </button>
                        <button className="rounded bg-danger px-3 py-1 text-[11px] font-bold text-white hover:bg-danger/80 transition-colors">
                          Reject
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {(selectedTab === 'pending' ? pendingApprovals : historyApprovals).length === 0 && (
                <tr>
                  <td colSpan={selectedTab === 'pending' ? 7 : 6} className="text-center text-gray-400 py-6">
                    No {selectedTab === 'pending' ? 'pending' : 'historical'} approvals found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}