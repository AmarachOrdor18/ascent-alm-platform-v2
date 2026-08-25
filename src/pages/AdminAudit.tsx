/**
 * Audit Log — screen 58 (Phase 8).
 *
 * Comprehensive audit trail of all system events, configuration changes, and user actions.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function AdminAudit() {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'configuration' | 'data' | 'user'>('all');

  // Mock audit data
  const mockAuditEvents = [
    { id: 'AE-001', module: 'Affiliates', action: 'Upsert', entity: 'Affiliate', entityId: 'NG', userId: 'U-001', userName: 'Adaeze Okonkwo', role: 'ADMIN', outcome: 'Success', detail: 'Ecobank Nigeria (Live) saved', recordedAt: '2026-08-25T09:30:00Z' },
    { id: 'AE-002', module: 'Rate Management', action: 'Save', entity: 'Yield Curve', entityId: 'USD-3M', userId: 'U-002', userName: 'Chinwe Okafor', role: 'RISK_ANALYST', outcome: 'Success', detail: 'USD 3M Curve (USD), 12 term points', recordedAt: '2026-08-25T08:45:00Z' },
    { id: 'AE-003', module: 'Data Ingestion', action: 'Commit', entity: 'Load Batch', entityId: 'BATCH-2026-08-25-NG', userId: 'U-001', userName: 'Adaeze Okonkwo', role: 'ADMIN', outcome: 'Success', detail: '7,421 position(s) committed for NG as at 2026-08-25', recordedAt: '2026-08-25T08:15:00Z' },
    { id: 'AE-004', module: 'Dimensions', action: 'Upsert', entity: 'Product', entityId: 'PROD-001', userId: 'U-003', userName: 'Aminata Traoré', role: 'TREASURY_USER', outcome: 'Success', detail: '2 Product member(s) saved', recordedAt: '2026-08-24T16:30:00Z' },
    { id: 'AE-005', module: 'Rate Management', action: 'Save', entity: 'FX Rate', entityId: 'FX-USD-NGN', userId: 'U-002', userName: 'Chinwe Okafor', role: 'RISK_ANALYST', outcome: 'Success', detail: 'USD/NGN = 1550.00 as at 2026-08-24', recordedAt: '2026-08-24T14:20:00Z' },
    { id: 'AE-006', module: 'Reference Data', action: 'Save', entity: 'Economic Indicator', entityId: 'GDP-NG', userId: 'U-006', userName: 'Samuel Owusu', role: 'REPORTING_USER', outcome: 'Success', detail: 'Nigeria GDP, 12 observation(s)', recordedAt: '2026-08-24T11:00:00Z' },
    { id: 'AE-007', module: 'Affiliates', action: 'Delete', entity: 'Affiliate', entityId: 'DEMO-001', userId: 'U-001', userName: 'Adaeze Okonkwo', role: 'ADMIN', outcome: 'Success', detail: 'Demo affiliate deleted', recordedAt: '2026-08-23T17:45:00Z' },
    { id: 'AE-008', module: 'Rate Management', action: 'Save', entity: 'Currency', entityId: 'EUR', userId: 'U-002', userName: 'Chinwe Okafor', role: 'RISK_ANALYST', outcome: 'Success', detail: 'EUR set to Reporting', recordedAt: '2026-08-23T15:30:00Z' },
  ];

  const filteredEvents = selectedFilter === 'all' 
    ? mockAuditEvents 
    : mockAuditEvents.filter((e) => {
        if (selectedFilter === 'configuration') return ['Affiliates', 'Rate Management', 'Dimensions', 'Reference Data'].includes(e.module);
        if (selectedFilter === 'data') return ['Data Ingestion'].includes(e.module);
        if (selectedFilter === 'user') return e.action === 'Login' || e.action === 'Logout';
        return true;
      });

  const moduleColors = {
    'Affiliates': 'bg-navy-100 text-navy-900',
    'Rate Management': 'bg-warning-bg text-warning',
    'Data Ingestion': 'bg-success-bg text-success',
    'Dimensions': 'bg-gold-50 text-gold-700',
    'Reference Data': 'bg-gray-100 text-gray-600',
  } as const;

  function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  return (
    <>
      <ModuleHeader
        title="Audit Log"
        description="Comprehensive audit trail of all system events, configuration changes, and user actions"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Total Events', value: String(mockAuditEvents.length) },
          { label: 'Today', value: '5' },
          { label: 'This Week', value: '24' },
          { label: 'Success Rate', value: '99.8%', tone: 'success' },
        ]}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedFilter('all')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedFilter === 'all' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          All Events
        </button>
        <button
          onClick={() => setSelectedFilter('configuration')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedFilter === 'configuration' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          Configuration
        </button>
        <button
          onClick={() => setSelectedFilter('data')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedFilter === 'data' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          Data Operations
        </button>
        <button
          onClick={() => setSelectedFilter('user')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedFilter === 'user' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          User Activity
        </button>
      </div>

      <div className="table-datagrid-container">
        <div className="overflow-x-auto">
          <table className="table-datagrid density-compact">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Module</th>
                <th>Action</th>
                <th>Entity</th>
                <th>User</th>
                <th>Role</th>
                <th>Outcome</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr key={event.id}>
                  <td>
                    <p className="text-gray-500 text-[11px]">{formatTime(event.recordedAt)}</p>
                    <p className="text-gray-400 text-[10px]">{new Date(event.recordedAt).toLocaleString()}</p>
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${moduleColors[event.module as keyof typeof moduleColors] || 'bg-gray-100 text-gray-600'}`}>
                      {event.module}
                    </span>
                  </td>
                  <td>{event.action}</td>
                  <td>
                    <p className="font-bold text-navy-900">{event.entity}</p>
                    <p className="text-[10px] text-gray-400">{event.entityId}</p>
                  </td>
                  <td>
                    <p className="font-bold text-navy-900">{event.userName}</p>
                    <p className="text-[10px] text-gray-400">{event.userId}</p>
                  </td>
                  <td>{event.role}</td>
                  <td><StatusBadge status={event.outcome} /></td>
                  <td className="max-w-xs truncate">{event.detail}</td>
                </tr>
              ))}
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-gray-400 py-6">
                    No audit events found for the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex justify-between items-center">
        <p className="text-[11px] text-gray-400">Showing {filteredEvents.length} of {mockAuditEvents.length} events</p>
        <button className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:bg-gray-50 transition-colors">
          Export Audit Log
        </button>
      </div>
    </>
  );
}