/**
 * Economic Indicators — screen 14.
 *
 * Macro series feeding behavioural modelling and stress scenarios. Oracle
 * treats these as first-class reference data with a publication frequency
 * and a value type (ALM UG §5.6), because a monthly CPI print and a
 * quarterly GDP print cannot be trended the same way.
 */

import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useEconomicIndicators, useSaveEconomicIndicator } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import type { EconomicIndicator } from '@/engine/types';

export function EconomicIndicators() {
  const { hasPermission } = useAuth();
  const { data: indicators = [], isLoading } = useEconomicIndicators();
  const save = useSaveEconomicIndicator();
  const canEdit = hasPermission('data.configure') || hasPermission('risk.configure');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [newObs, setNewObs] = useState({ asOfDate: '', value: '' });

  useEffect(() => {
    if (!activeId && indicators.length > 0) setActiveId(indicators[0]!.id);
  }, [indicators, activeId]);

  const active = indicators.find((i) => i.id === activeId) ?? null;

  const handleAddObservation = () => {
    if (!active || !newObs.asOfDate || newObs.value === '') return;
    const value = Number(newObs.value);
    if (Number.isNaN(value)) return;

    // Re-observing the same date replaces it rather than duplicating —
    // statistical agencies revise, and a series with two values for one
    // month cannot be trended.
    const observations = [
      ...active.observations.filter((o) => o.asOfDate !== newObs.asOfDate),
      { asOfDate: newObs.asOfDate, value },
    ];
    save.mutate(
      { ...active, observations, updatedBy: 'current-user', updatedAt: new Date().toISOString() },
      { onSuccess: () => setNewObs({ asOfDate: '', value: '' }) },
    );
  };

  const latest = active?.observations[active.observations.length - 1] ?? null;
  const previous =
    active && active.observations.length > 1 ? active.observations[active.observations.length - 2]! : null;
  const change = latest && previous ? latest.value - previous.value : null;

  return (
    <>
      <ModuleHeader
        title="Economic Indicators"
        description="Macro series driving behavioural assumptions and stress scenarios — inflation, policy rates, and for Nigeria the oil price its fiscal position tracks."
        asOfDate={latest?.asOfDate ?? null}
        scope="Group"
        metrics={[
          { label: 'Series', value: String(indicators.length) },
          { label: 'Countries', value: String(new Set(indicators.map((i) => i.countryCode)).size) },
          { label: 'Latest value', value: latest ? `${latest.value} ${active?.unit ?? ''}` : '—' },
          {
            label: 'Period change',
            value: change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(2)}`,
            tone: change === null ? 'neutral' : change > 0 ? 'warning' : 'success',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-1">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">Series</h2>
          <ul className="space-y-2">
            {indicators.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(i.id)}
                  aria-current={activeId === i.id ? 'true' : undefined}
                  className={
                    activeId === i.id
                      ? 'w-full rounded-lg border border-navy-700 bg-navy-50 p-3 text-left'
                      : 'w-full rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-navy-700'
                  }
                >
                  <span className="block text-[12px] font-bold text-navy-900">{i.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
                    <span className="font-mono">{i.countryCode}</span>
                    <span aria-hidden="true">·</span>
                    <span>{i.frequency}</span>
                    <span aria-hidden="true">·</span>
                    <span>{i.unit}</span>
                  </span>
                </button>
              </li>
            ))}
            {isLoading && <li className="text-[12px] text-gray-400">Loading…</li>}
          </ul>
        </section>

        {active && (
          <section className="space-y-6 lg:col-span-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">{active.name}</h2>
                <StatusBadge status={active.valueType} tone="info" />
              </div>

              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={active.observations} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--gray-200))" vertical={false} />
                  <XAxis
                    dataKey="asOfDate"
                    tickFormatter={(d: string) => d.slice(0, 7)}
                    tick={{ fontSize: 11, fill: 'hsl(var(--gray-500))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--gray-500))' }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    labelFormatter={(d: string) => formatDate(d)}
                    formatter={(v: number) => `${v} ${active.unit}`}
                    contentStyle={{ fontSize: 12, borderRadius: 9 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={active.code}
                    stroke="hsl(var(--teal-700))"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Observations</h2>

              {canEdit && (
                <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-4">
                  <div>
                    <label htmlFor="obs-date" className="mb-1 block text-[11px] text-gray-600">
                      As-of date
                    </label>
                    <input
                      id="obs-date"
                      type="date"
                      value={newObs.asOfDate}
                      onChange={(e) => setNewObs({ ...newObs, asOfDate: e.target.value })}
                      className="rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="obs-value" className="mb-1 block text-[11px] text-gray-600">
                      Value ({active.unit})
                    </label>
                    <input
                      id="obs-value"
                      type="number"
                      step="any"
                      value={newObs.value}
                      onChange={(e) => setNewObs({ ...newObs, value: e.target.value })}
                      className="w-32 rounded border border-gray-200 px-2 py-1 font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddObservation}
                    disabled={save.isPending || !newObs.asOfDate || newObs.value === ''}
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  >
                    {save.isPending ? 'Saving…' : 'Record observation'}
                  </button>
                  <p className="w-full text-[11px] text-gray-500">
                    Re-recording an existing date replaces that observation — agencies revise, and a series cannot carry
                    two values for one period.
                  </p>
                </div>
              )}

              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th
                      scope="col"
                      className="py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400"
                    >
                      Period
                    </th>
                    <th
                      scope="col"
                      className="py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400"
                    >
                      Value
                    </th>
                    <th
                      scope="col"
                      className="py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400"
                    >
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...active.observations].reverse().map((o, i, arr) => {
                    const prior = arr[i + 1];
                    const delta = prior ? o.value - prior.value : null;
                    return (
                      <tr key={o.asOfDate} className="border-b border-gray-100">
                        <td className="py-2 font-mono text-navy-900">{formatDate(o.asOfDate)}</td>
                        <td className="py-2 text-right font-mono">
                          {o.value} {active.unit}
                        </td>
                        <td className="py-2 text-right font-mono text-gray-500">
                          {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

export type { EconomicIndicator };
