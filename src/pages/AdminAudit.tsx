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
import { useAuditEvents } from '@/lib/hooks';
import type { AuditEvent } from '@/engine/types';

export function AdminAudit() {
  const { data: events = [], isLoading } = useAuditEvents(500);

  const [module, setModule] = useState<string>('ALL');
  const [outcome, setOutcome] = useState<string>('ALL');
  const [query, setQuery] = useState('');

  const modules = useMemo(
    () => Array.from(new Set(events.map((e) => e.module))).sort(),
    [events],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (module !== 'ALL' && e.module !== module) return false;
      if (outcome !== 'ALL' && e.outcome !== outcome) return false;
      if (q === '') return true;
      return [e.userName, e.entity, e.entityId, e.detail, e.action]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [events, module, outcome, query]);

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
          { label: 'Showing', value: String(filtered.length) },
          { label: 'Distinct actors', value: String(actors) },
          {
            label: 'Failures',
            value: String(failures.length),
            tone: failures.length > 0 ? 'warning' : 'success',
          },
        ]}
      />

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="af-module" className="mb-1 block text-[11px] font-medium text-gray-600">
              Module
            </label>
            <select
              id="af-module"
              value={module}
              onChange={(e) => setModule(e.target.value)}
              className="rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
            >
              <option value="ALL">All modules</option>
              {modules.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="af-outcome" className="mb-1 block text-[11px] font-medium text-gray-600">
              Outcome
            </label>
            <select
              id="af-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
            >
              <option value="ALL">All</option>
              <option value="Success">Success</option>
              <option value="Failure">Failure</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label htmlFor="af-q" className="mb-1 block text-[11px] font-medium text-gray-600">
              Search
            </label>
            <input
              id="af-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="User, entity, detail…"
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
            />
          </div>
        </div>

        <ResultTable
          rows={filtered}
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

        <p className="mt-4 border-t border-gray-50 pt-3 text-[11px] leading-relaxed text-gray-500">
          Events are append-only and are written by the action itself, not by the screen — a run that fails records a
          failure with its reason. The trail is capped at the most recent 500 here for rendering; the store keeps all
          of them.
        </p>
      </section>
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
