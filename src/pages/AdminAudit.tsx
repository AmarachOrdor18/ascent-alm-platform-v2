/**
 * Audit Trail — screen 57.
 *
 * Reads the events the platform actually recorded. Until now it rendered a
 * fabricated list — invented users, invented timestamps, and a line claiming
 * "7,421 position(s) committed" for a load that never happened — while the
 * store held the real events the whole time. Six call sites write them: run
 * execution, rule changes, batch commits, affiliate changes, reference-data
 * edits and reconciliation sign-off.
 *
 * A fabricated audit trail is worse than none. It is the one screen whose
 * entire purpose is to be trustworthy.
 */

import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { useAuditEvents } from '@/lib/hooks';
import type { AuditEvent } from '@/engine/types';

export function AdminAudit() {
  const { data: events = [], isLoading } = useAuditEvents(500);

  const [module, setModule] = useState<string>('ALL');
  const [outcome, setOutcome] = useState<string>('ALL');

  const modules = useMemo(
    () => Array.from(new Set(events.map((e) => e.module))).sort(),
    [events],
  );

  const preFiltered = useMemo(
    () => events.filter((e) => (module === 'ALL' || e.module === module) && (outcome === 'ALL' || e.outcome === outcome)),
    [events, module, outcome],
  );

  const { search, setSearch, page, setPage, density, setDensity, paged, totalItems, pageSize } = useTableControls(
    preFiltered,
    10,
    ['userName', 'entity', 'entityId', 'detail', 'action'],
  );

  const failures = events.filter((e) => e.outcome === 'Failure');
  const actors = new Set(events.map((e) => e.userId)).size;

  const columns: ResultColumn<AuditEvent>[] = [
    {
      key: 'when',
      header: 'When',
      render: (e) => <span className="font-mono text-[11px]">{new Date(e.recordedAt).toLocaleString()}</span>,
    },
    { key: 'module', header: 'Module', render: (e) => e.module },
    { key: 'action', header: 'Action', render: (e) => <span className="font-medium">{e.action}</span> },
    {
      key: 'entity',
      header: 'Entity',
      render: (e) => (
        <span>
          {e.entity}
          {e.entityId && <span className="ml-1 font-mono text-[10px] text-gray-400">{e.entityId}</span>}
        </span>
      ),
    },
    {
      key: 'who',
      header: 'Who',
      render: (e) => (
        <span>
          {e.userName}
          <span className="ml-1 rounded border border-gray-200 px-1 text-[9px] text-gray-500">{e.role}</span>
        </span>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (e) => (
        <StatusBadge status={e.outcome} tone={e.outcome === 'Success' ? 'success' : 'danger'} />
      ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Audit Trail"
        description="Every recorded action, as it happened. Nothing on this screen is generated for display."
        asOfDate={null}
        metrics={[
          { label: 'Events recorded', value: String(events.length) },
          { label: 'Showing', value: String(totalItems) },
          { label: 'Distinct actors', value: String(actors) },
          {
            label: 'Failures',
            value: String(failures.length),
            tone: failures.length > 0 ? 'warning' : 'success',
          },
        ]}
      />

      <section className="table-datagrid-container">
        <div className="border-b border-gray-100 bg-white/50 p-5">
          <TableToolbar
            searchValue={search}
            onSearchChange={setSearch}
            exportData={() => preFiltered}
            exportFilename="audit-trail"
            density={density}
            onDensityChange={setDensity}
          >
            <select
              value={module}
              onChange={(e) => {
                setModule(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by module"
              className="rounded-lg border border-gray-200 bg-gray-50 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none"
            >
              <option value="ALL">All modules</option>
              {modules.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by outcome"
              className="rounded-lg border border-gray-200 bg-gray-50 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none"
            >
              <option value="ALL">All outcomes</option>
              <option value="Success">Success</option>
              <option value="Failure">Failure</option>
            </select>
          </TableToolbar>
        </div>

        <ResultTable
          rows={paged}
          columns={columns}
          rowKey={(e) => e.id}
          emptyMessage={
            isLoading
              ? 'Loading…'
              : events.length === 0
                ? 'No events recorded yet. Execute a run or edit a rule and it will appear here.'
                : 'No events match those filters.'
          }
          renderDetail={(e) => (
            <dl className="grid grid-cols-2 gap-3 text-[11px] md:grid-cols-4">
              <D label="Event ID" value={e.id} mono />
              <D label="User ID" value={e.userId} mono />
              <D label="Role" value={e.role} />
              <D label="Recorded at" value={e.recordedAt} mono />
              <div className="col-span-2 md:col-span-4">
                <dt className="font-bold uppercase tracking-wider text-gray-400">Detail</dt>
                <dd className="text-gray-700">{e.detail ?? '—'}</dd>
              </div>
            </dl>
          )}
        />
        <TablePagination currentPage={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-gray-500">
        Events are append-only and are written by the action itself, not by the screen. The trail is capped at the
        most recent 500 here for rendering; the store keeps all of them.
      </p>
    </>
  );
}

function D({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-gray-700' : 'text-gray-700'}>{value}</dd>
    </div>
  );
}
