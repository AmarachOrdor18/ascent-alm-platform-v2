import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BellIcon } from '@/components/icons/Icons';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates } from '@/lib/hooks';
import { notifications, newId } from '@/lib/governanceHooks';
import type { NotificationChannel, NotificationRule, Severity } from '@/engine/types';

const CHANNELS: NotificationChannel[] = ['Email', 'SMS', 'In-App', 'Webhook'];
const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];

const emptyDraft = {
  id: null as string | null,
  name: '',
  event: '',
  channel: 'Email' as NotificationChannel,
  recipients: '',
  minimumSeverity: 'Medium' as Severity,
  affiliateCode: '',
  escalateAfterHours: '',
  escalateTo: '',
  isActive: true,
};

export function Notifications() {
  const { user } = useAuth();
  const { data: affiliates = [] } = useAffiliates();
  const { data: rules = [], isLoading } = notifications.useList();
  const save = notifications.useSave();

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const active = rules.filter((r) => r.isActive);
  const withEscalation = rules.filter((r) => r.escalateAfterHours !== null);

  const { search, setSearch, page, setPage, density, setDensity, paged, totalItems, pageSize } = useTableControls(
    rules,
    10,
    ['name', 'event', 'channel'],
  );

  const openNew = () => {
    setDraft(emptyDraft);
    setEditorOpen(true);
  };

  const openEdit = (rule: NotificationRule) => {
    setDraft({
      id: rule.id,
      name: rule.name,
      event: rule.event,
      channel: rule.channel,
      recipients: rule.recipients.join(', '),
      minimumSeverity: rule.minimumSeverity,
      affiliateCode: rule.affiliateCode ?? '',
      escalateAfterHours: rule.escalateAfterHours !== null ? String(rule.escalateAfterHours) : '',
      escalateTo: rule.escalateTo.join(', '),
      isActive: rule.isActive,
    });
    setEditorOpen(true);
  };

  const toggleActive = async (rule: NotificationRule) => {
    if (!user) return;
    await save.mutateAsync({ ...rule, isActive: !rule.isActive, updatedBy: user.name, updatedAt: new Date().toISOString() });
  };

  const handleSave = async () => {
    if (!user || !draft.name || !draft.event) return;
    await save.mutateAsync({
      id: draft.id ?? newId('NOT'),
      name: draft.name,
      event: draft.event,
      channel: draft.channel,
      recipients: draft.recipients.split(',').map((r) => r.trim()).filter(Boolean),
      minimumSeverity: draft.minimumSeverity,
      affiliateCode: draft.affiliateCode || null,
      escalateAfterHours: draft.escalateAfterHours ? Number(draft.escalateAfterHours) : null,
      escalateTo: draft.escalateTo.split(',').map((r) => r.trim()).filter(Boolean),
      isActive: draft.isActive,
      updatedBy: user.name,
      updatedAt: new Date().toISOString(),
    });
    setEditorOpen(false);
  };

  return (
    <>
      <ModuleHeader
        title="Notifications"
        description="Which events raise an alert, over which channel, to whom, and when it escalates."
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Rules', value: String(rules.length) },
          { label: 'Active', value: String(active.length), tone: 'success' },
          { label: 'With escalation', value: String(withEscalation.length) },
          { label: 'Channels used', value: String(new Set(rules.map((r) => r.channel)).size) },
        ]}
        actions={
          <button
            type="button"
            onClick={openNew}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
          >
            New rule
          </button>
        }
      />

      {!isLoading && rules.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <BellIcon className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-400">No notification rules configured yet. Click "New rule" to raise the first one.</p>
        </div>
      )}

      {(isLoading || rules.length > 0) && (
        <div className="table-datagrid-container">
          <div className="border-b border-gray-100 bg-white/50 p-5">
            <div className="mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-navy-900">Notification rules</h3>
              <p className="text-[11px] font-medium text-gray-400">One row per event this platform can raise an alert for.</p>
            </div>
            <TableToolbar
              searchValue={search}
              onSearchChange={setSearch}
              exportData={() => rules}
              exportFilename="notification-rules"
              density={density}
              onDensityChange={setDensity}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="table-datagrid">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Event</th>
                  <th>Channel</th>
                  <th>Minimum severity</th>
                  <th>Recipients</th>
                  <th>Escalation</th>
                  <th>Status</th>
                  <th>Edit</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      Loading.
                    </td>
                  </tr>
                )}
                {paged.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <p className="font-bold text-navy-900">{r.name}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-gray-400">
                        {r.affiliateCode ? affiliates.find((a) => a.code === r.affiliateCode)?.name ?? r.affiliateCode : 'Group-wide'}
                      </p>
                    </td>
                    <td>{r.event}</td>
                    <td>
                      <span className="font-mono text-[11px]">{r.channel}</span>
                    </td>
                    <td>
                      <StatusBadge status={r.minimumSeverity} tone={r.minimumSeverity === 'Critical' || r.minimumSeverity === 'High' ? 'danger' : r.minimumSeverity === 'Medium' ? 'warning' : 'success'} />
                    </td>
                    <td>
                      <span className="text-[12px] text-gray-600">{r.recipients.length > 0 ? r.recipients.join(', ') : 'None set'}</span>
                    </td>
                    <td>
                      {r.escalateAfterHours !== null ? (
                        <span className="text-[12px] text-gray-600">
                          After {r.escalateAfterHours}h to {r.escalateTo.join(', ') || 'nobody set'}
                        </span>
                      ) : (
                        <span className="text-[12px] text-gray-300">None</span>
                      )}
                    </td>
                    <td>
                      <button type="button" onClick={() => void toggleActive(r)}>
                        <StatusBadge status={r.isActive ? 'Active' : 'Inactive'} tone={r.isActive ? 'success' : 'neutral'} />
                      </button>
                    </td>
                    <td>
                      <button type="button" onClick={() => openEdit(r)} className="text-[11px] font-bold text-navy-700 hover:underline">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination currentPage={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-[13px] font-bold uppercase tracking-wider text-navy-900">
              {draft.id ? 'Edit notification rule' : 'New notification rule'}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="not-name" className="mb-1 block text-[11px] text-gray-600">
                    Name
                  </label>
                  <input
                    id="not-name"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. LCR below floor"
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="not-event" className="mb-1 block text-[11px] text-gray-600">
                    Event
                  </label>
                  <input
                    id="not-event"
                    value={draft.event}
                    onChange={(e) => setDraft((d) => ({ ...d, event: e.target.value }))}
                    placeholder="e.g. Limit status turns Red"
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="not-channel" className="mb-1 block text-[11px] text-gray-600">
                    Channel
                  </label>
                  <select
                    id="not-channel"
                    value={draft.channel}
                    onChange={(e) => setDraft((d) => ({ ...d, channel: e.target.value as NotificationChannel }))}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  >
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="not-severity" className="mb-1 block text-[11px] text-gray-600">
                    Minimum severity
                  </label>
                  <select
                    id="not-severity"
                    value={draft.minimumSeverity}
                    onChange={(e) => setDraft((d) => ({ ...d, minimumSeverity: e.target.value as Severity }))}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="not-recipients" className="mb-1 block text-[11px] text-gray-600">
                  Recipients (comma separated)
                </label>
                <input
                  id="not-recipients"
                  value={draft.recipients}
                  onChange={(e) => setDraft((d) => ({ ...d, recipients: e.target.value }))}
                  placeholder="name@ecobank.com, name2@ecobank.com"
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="not-affiliate" className="mb-1 block text-[11px] text-gray-600">
                  Affiliate
                </label>
                <select
                  id="not-affiliate"
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="not-escalate-hours" className="mb-1 block text-[11px] text-gray-600">
                    Escalate after (hours, optional)
                  </label>
                  <input
                    id="not-escalate-hours"
                    type="number"
                    min={0}
                    value={draft.escalateAfterHours}
                    onChange={(e) => setDraft((d) => ({ ...d, escalateAfterHours: e.target.value }))}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="not-escalate-to" className="mb-1 block text-[11px] text-gray-600">
                    Escalate to (comma separated)
                  </label>
                  <input
                    id="not-escalate-to"
                    value={draft.escalateTo}
                    onChange={(e) => setDraft((d) => ({ ...d, escalateTo: e.target.value }))}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-gray-600">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                />
                Active
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!draft.name || !draft.event}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save rule
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
