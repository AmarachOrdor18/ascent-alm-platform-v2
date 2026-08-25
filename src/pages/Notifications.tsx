/**
 * Notifications — screen 50 (Phase 7).
 *
 * Real-time notification feed for breaches, approvals, audit events, and system alerts.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';

interface Notification {
  id: string;
  type: 'breach' | 'approval' | 'audit' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'high' | 'medium' | 'low';
}

export function Notifications() {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'unread' | 'breach' | 'approval'>('all');

  // Mock notification data
  const mockNotifications: Notification[] = [
    {
      id: 'NOTIF-001',
      type: 'breach',
      title: 'LCR Breach Detected',
      message: 'Group LCR has fallen to 88.4%, below the 100% regulatory minimum. Auto-remediation issue CR-1 created.',
      timestamp: '2026-08-25T09:30:00Z',
      read: false,
      priority: 'high',
    },
    {
      id: 'NOTIF-002',
      type: 'approval',
      title: 'Affiliate Activation Pending',
      message: 'Ecobank Zambia go-live approval is pending your review. All onboarding steps completed.',
      timestamp: '2026-08-25T08:15:00Z',
      read: false,
      priority: 'high',
    },
    {
      id: 'NOTIF-003',
      type: 'audit',
      title: 'Rule Change Logged',
      message: 'User Chinwe Okafor modified LCR warning threshold for NG affiliate from 110% to 105%.',
      timestamp: '2026-08-24T16:45:00Z',
      read: true,
      priority: 'medium',
    },
    {
      id: 'NOTIF-004',
      type: 'system',
      title: 'Data Upload Completed',
      message: 'Ghana position book upload completed successfully. 7,421 positions validated and committed.',
      timestamp: '2026-08-24T14:20:00Z',
      read: true,
      priority: 'low',
    },
    {
      id: 'NOTIF-005',
      type: 'breach',
      title: 'Concentration Warning',
      message: 'Deposit concentration for CI affiliate at 35.4% exceeds internal threshold of 35%.',
      timestamp: '2026-08-24T11:00:00Z',
      read: true,
      priority: 'medium',
    },
    {
      id: 'NOTIF-006',
      type: 'approval',
      title: 'Remediation Closure Approved',
      message: 'Remediation issue CR-3 closure has been approved by Control Testing Lead.',
      timestamp: '2026-08-23T17:30:00Z',
      read: true,
      priority: 'medium',
    },
  ];

  const unreadCount = mockNotifications.filter((n) => !n.read).length;
  const breachCount = mockNotifications.filter((n) => n.type === 'breach').length;
  const approvalCount = mockNotifications.filter((n) => n.type === 'approval').length;

  const filteredNotifications = mockNotifications.filter((n) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'unread') return !n.read;
    if (selectedFilter === 'breach') return n.type === 'breach';
    if (selectedFilter === 'approval') return n.type === 'approval';
    return true;
  });

  const typeIcon = {
    breach: '⚠️',
    approval: '✋',
    audit: '📋',
    system: 'ℹ️',
  } as const;

  const priorityColor = {
    high: 'bg-danger',
    medium: 'bg-warning',
    low: 'bg-success',
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
        title="Notifications"
        description="Real-time notification feed for breaches, approvals, audit events, and system alerts"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Unread', value: String(unreadCount), tone: unreadCount > 0 ? 'warning' : 'success' },
          { label: 'Breaches', value: String(breachCount), tone: breachCount > 0 ? 'danger' : 'neutral' },
          { label: 'Approvals', value: String(approvalCount) },
          { label: 'Total', value: String(mockNotifications.length) },
        ]}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedFilter('all')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedFilter === 'all' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          All ({mockNotifications.length})
        </button>
        <button
          onClick={() => setSelectedFilter('unread')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedFilter === 'unread' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          Unread ({unreadCount})
        </button>
        <button
          onClick={() => setSelectedFilter('breach')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedFilter === 'breach' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          Breaches ({breachCount})
        </button>
        <button
          onClick={() => setSelectedFilter('approval')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedFilter === 'approval' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          Approvals ({approvalCount})
        </button>
      </div>

      <div className="table-datagrid-container">
        <div className="overflow-x-auto">
          <table className="table-datagrid">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Message</th>
                <th>Priority</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredNotifications.map((notification) => (
                <tr
                  key={notification.id}
                  className={!notification.read ? 'bg-navy-50/20' : ''}
                >
                  <td>
                    <span className="text-lg" title={notification.type}>
                      {typeIcon[notification.type]}
                    </span>
                  </td>
                  <td>
                    <p className={`font-bold text-navy-900 ${!notification.read ? 'font-extrabold' : ''}`}>{notification.title}</p>
                  </td>
                  <td>
                    <p className="text-gray-600 max-w-md">{notification.message}</p>
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${priorityColor[notification.priority]} text-white`}>
                      {notification.priority}
                    </span>
                  </td>
                  <td className="text-gray-500 text-[11px]">{formatTime(notification.timestamp)}</td>
                  <td>
                    {!notification.read && (
                      <span className="inline-block w-2 h-2 rounded-full bg-gold-500" />
                    )}
                  </td>
                </tr>
              ))}
              {filteredNotifications.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-6">
                    No notifications found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {unreadCount > 0 && (
        <div className="mt-4 flex justify-end">
          <button className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 transition-colors">
            Mark All as Read
          </button>
        </div>
      )}
    </>
  );
}