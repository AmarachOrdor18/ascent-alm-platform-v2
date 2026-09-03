import { useEffect, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable } from '@/components/ui/ResultTable';
import { useAuth } from '@/context/AuthContext';
import { useEconomicIndicators, useSaveEconomicIndicator, useSaveBatch } from '@/lib/hooks';
import { importIndicatorObservations, type RowError } from '@/lib/csvImport';
import { readUploadAsCsvText, UPLOAD_ACCEPT } from '@/lib/fileImport';
import { formatDate } from '@/lib/format';
import { referenceLoadBatch } from '@/lib/referenceBatch';
import type { EconomicIndicator, IndicatorFrequency, IndicatorValueType } from '@/engine/types';

const FREQUENCIES: IndicatorFrequency[] = ['Weekly', 'Monthly', 'Quarterly', 'Semi-Annually', 'Annually'];
const VALUE_TYPES: IndicatorValueType[] = ['Numeric', 'Percentage', 'Amount'];

const emptySeriesDraft = () => ({
  code: '',
  name: '',
  countryCode: '',
  frequency: 'Monthly' as IndicatorFrequency,
  valueType: 'Percentage' as IndicatorValueType,
  unit: '',
});

export function EconomicIndicators() {
  const { hasPermission, user } = useAuth();
  const { data: indicators = [], isLoading } = useEconomicIndicators();
  const save = useSaveEconomicIndicator();
  const saveBatch = useSaveBatch();
  const canEdit = hasPermission('data.configure') || hasPermission('risk.configure');

  // Group-wide reference data, entered here rather than staged like a Position file - but Data Sources'
  // freshness page only reads LoadBatch rows, so without recording one this domain reads "Never loaded"
  // forever no matter how current the indicator history actually is.
  const recordIndicatorLoad = (label: string, asOfDate: string, rowCount: number) =>
    saveBatch.mutate(
      referenceLoadBatch({ domain: 'EconomicIndicators', affiliateCode: 'GROUP', asOfDate, label, uploadedBy: user?.name ?? 'unknown', rowCount }),
    );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [newObs, setNewObs] = useState({ asOfDate: '', value: '' });
  const [creatingSeries, setCreatingSeries] = useState(false);
  const [seriesDraft, setSeriesDraft] = useState(emptySeriesDraft());
  const [uploadErrors, setUploadErrors] = useState<RowError[]>([]);
  const [uploadResult, setUploadResult] = useState<{ count: number; ignoredColumns: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleCreateSeries = () => {
    const code = seriesDraft.code.trim().toUpperCase();
    const name = seriesDraft.name.trim();
    const countryCode = seriesDraft.countryCode.trim().toUpperCase();
    const unit = seriesDraft.unit.trim();
    if (!code || !name || !countryCode || !unit) return;
    if (indicators.some((i) => i.code === code)) return;
    const created: EconomicIndicator = {
      id: `EI-${code}`,
      code,
      name,
      countryCode,
      frequency: seriesDraft.frequency,
      valueType: seriesDraft.valueType,
      unit,
      observations: [],
      isActive: true,
      updatedBy: 'current-user',
      updatedAt: new Date().toISOString(),
    };
    save.mutate(created, {
      onSuccess: () => {
        setActiveId(created.id);
        setCreatingSeries(false);
        setSeriesDraft(emptySeriesDraft());
      },
    });
  };

  useEffect(() => {
    if (!activeId && indicators.length > 0) setActiveId(indicators[0]!.id);
  }, [indicators, activeId]);

  // Switching series should never leave the previous series' upload feedback showing.
  useEffect(() => {
    setUploadErrors([]);
    setUploadResult(null);
  }, [activeId]);

  const active = indicators.find((i) => i.id === activeId) ?? null;

  const handleAddObservation = () => {
    if (!active || !newObs.asOfDate || newObs.value === '') return;
    const value = Number(newObs.value);
    if (Number.isNaN(value)) return;

    // Re-observing the same date replaces it rather than duplicating (agencies revise history).
    const observations = [
      ...active.observations.filter((o) => o.asOfDate !== newObs.asOfDate),
      { asOfDate: newObs.asOfDate, value },
    ];
    save.mutate(
      { ...active, observations, updatedBy: 'current-user', updatedAt: new Date().toISOString() },
      {
        onSuccess: () => {
          recordIndicatorLoad(`${active.code} - manual observation`, newObs.asOfDate, 1);
          setNewObs({ asOfDate: '', value: '' });
        },
      },
    );
  };

  const handleUploadObservations = async (file: File) => {
    if (!active) return;
    let text: string;
    try {
      text = await readUploadAsCsvText(file);
    } catch (err) {
      setUploadErrors([{ line: 1, column: '', message: err instanceof Error ? err.message : 'This file could not be read.' }]);
      setUploadResult(null);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    const result = importIndicatorObservations(text);
    setUploadErrors(result.errors);
    if (fileInput.current) fileInput.current.value = '';
    if (result.rows.length === 0) {
      setUploadResult(null);
      return;
    }

    // Same replace-by-date rule as a single manual entry - a bulk file re-observing an existing
    // date restates history rather than duplicating it.
    const uploadedDates = new Set(result.rows.map((o) => o.asOfDate));
    const observations = [...active.observations.filter((o) => !uploadedDates.has(o.asOfDate)), ...result.rows].sort(
      (a, b) => a.asOfDate.localeCompare(b.asOfDate),
    );

    const latestUploadedDate = result.rows.reduce((max, o) => (o.asOfDate > max ? o.asOfDate : max), result.rows[0]!.asOfDate);
    save.mutate(
      { ...active, observations, updatedBy: 'current-user', updatedAt: new Date().toISOString() },
      {
        onSuccess: () => {
          recordIndicatorLoad(`${active.code} - bulk upload`, latestUploadedDate, result.rows.length);
          setUploadResult({ count: result.rows.length, ignoredColumns: result.ignoredColumns });
        },
      },
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
        description="Macro series driving behavioural assumptions and stress scenarios - inflation, policy rates, and for Nigeria the oil price its fiscal position tracks."
        asOfDate={latest?.asOfDate ?? null}
        scope="Group"
        metrics={[
          {
            label: 'Series',
            value: String(indicators.length),
            about:
              'Macro series on file - inflation, policy rates and similar drivers of behavioural and scenario assumptions.',
          },
          {
            label: 'Countries',
            value: String(new Set(indicators.map((i) => i.countryCode)).size),
            about: 'Distinct countries with at least one series tracked.',
          },
          {
            label: 'Latest value',
            value: latest ? `${latest.value} ${active?.unit ?? ''}` : '-',
            about: 'The most recent observation on the selected series.',
          },
          {
            label: 'Period change',
            value: change === null ? '-' : `${change > 0 ? '+' : ''}${change.toFixed(2)}`,
            tone: change === null ? 'neutral' : change > 0 ? 'warning' : 'success',
            about: 'Move from the prior observation to the latest one on the selected series.',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-1">
          <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
            Series
            <InfoButton label="What these drive">
              These macro series feed forecast scenarios and behavioural assumptions - an economic-indicator-conditioned
              scenario only applies when the indicator crosses the threshold set on it.
            </InfoButton>
          </h2>
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
            {!isLoading && indicators.length === 0 && (
              <li className="rounded-lg bg-gray-50 p-4 text-center text-[12px] text-gray-500">
                No indicator series defined yet.
              </li>
            )}
          </ul>

          {canEdit && (
            <div className="mt-4">
              {creatingSeries ? (
                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <label htmlFor="series-code" className="mb-1 block text-[11px] text-gray-600">
                      Code
                    </label>
                    <input
                      id="series-code"
                      value={seriesDraft.code}
                      onChange={(e) => setSeriesDraft({ ...seriesDraft, code: e.target.value })}
                      placeholder="KE-CPI"
                      className="w-full rounded border border-gray-200 px-2 py-1 font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="series-name" className="mb-1 block text-[11px] text-gray-600">
                      Name
                    </label>
                    <input
                      id="series-name"
                      value={seriesDraft.name}
                      onChange={(e) => setSeriesDraft({ ...seriesDraft, name: e.target.value })}
                      placeholder="Kenya - Headline Inflation"
                      className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="series-country" className="mb-1 block text-[11px] text-gray-600">
                      Country code
                    </label>
                    <input
                      id="series-country"
                      value={seriesDraft.countryCode}
                      onChange={(e) => setSeriesDraft({ ...seriesDraft, countryCode: e.target.value })}
                      placeholder="KE"
                      className="w-full rounded border border-gray-200 px-2 py-1 font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="series-unit" className="mb-1 block text-[11px] text-gray-600">
                      Unit
                    </label>
                    <input
                      id="series-unit"
                      value={seriesDraft.unit}
                      onChange={(e) => setSeriesDraft({ ...seriesDraft, unit: e.target.value })}
                      placeholder="% y/y"
                      className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="series-freq" className="mb-1 block text-[11px] text-gray-600">
                      Frequency
                    </label>
                    <select
                      id="series-freq"
                      value={seriesDraft.frequency}
                      onChange={(e) =>
                        setSeriesDraft({ ...seriesDraft, frequency: e.target.value as IndicatorFrequency })
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="series-valuetype" className="mb-1 block text-[11px] text-gray-600">
                      Value type
                    </label>
                    <select
                      id="series-valuetype"
                      value={seriesDraft.valueType}
                      onChange={(e) =>
                        setSeriesDraft({ ...seriesDraft, valueType: e.target.value as IndicatorValueType })
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    >
                      {VALUE_TYPES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingSeries(false);
                        setSeriesDraft(emptySeriesDraft());
                      }}
                      className="flex-1 rounded-lg px-3 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateSeries}
                      disabled={
                        save.isPending ||
                        !seriesDraft.code.trim() ||
                        !seriesDraft.name.trim() ||
                        !seriesDraft.countryCode.trim() ||
                        !seriesDraft.unit.trim()
                      }
                      className="flex-1 rounded-lg bg-navy-900 px-3 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                    >
                      {save.isPending ? 'Creating…' : 'Create series'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingSeries(true)}
                  className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-[12px] font-bold text-gray-500 hover:border-navy-700 hover:text-navy-900"
                >
                  + New series
                </button>
              )}
            </div>
          )}
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
              <h2 className="mb-4 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Observations
                <InfoButton label="How revisions are handled">
                  Recording a new value for a date that's already on file replaces that observation rather than
                  duplicating it - statistical agencies revise history, and a series can't hold two values for one
                  period.
                </InfoButton>
              </h2>

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
                    Re-recording an existing date replaces that observation - agencies revise, and a series cannot carry
                    two values for one period.
                  </p>
                </div>
              )}

              {canEdit && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-gray-300 p-4">
                  <div className="min-w-[220px] flex-1">
                    <p className="text-[11px] font-bold text-navy-900">Or load a full history at once</p>
                    <p className="text-[11px] text-gray-500">
                      CSV, Excel, JSON or XML with <span className="font-mono">asOfDate</span> (or{' '}
                      <span className="font-mono">date</span>) and <span className="font-mono">value</span> columns -
                      one row per period. Same replace-by-date rule as a single entry.
                    </p>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    aria-label="Upload observation history file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUploadObservations(file);
                    }}
                    className="text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-[12px] file:font-bold file:text-white hover:file:bg-navy-700"
                  />
                </div>
              )}

              {uploadResult && (
                <p role="status" className="mb-4 rounded-lg bg-success-bg px-4 py-3 text-[12px] text-success">
                  <span className="font-bold">
                    {uploadResult.count} observation{uploadResult.count === 1 ? '' : 's'} loaded.
                  </span>
                  {uploadResult.ignoredColumns.length > 0 && (
                    <> Columns not used: {uploadResult.ignoredColumns.join(', ')}.</>
                  )}
                </p>
              )}

              {uploadErrors.length > 0 && (
                <div className="mb-4 rounded-lg border border-danger/20 bg-danger-bg p-4">
                  <p className="mb-1 text-[11px] font-bold text-danger">
                    {uploadErrors.length} row{uploadErrors.length === 1 ? '' : 's'} could not be read
                  </p>
                  <ul className="space-y-0.5 text-[11px] text-gray-700">
                    {uploadErrors.slice(0, 10).map((e, i) => (
                      <li key={i}>
                        <span className="font-mono">line {e.line}</span> - {e.message}
                      </li>
                    ))}
                  </ul>
                  {uploadErrors.length > 10 && (
                    <p className="mt-1 text-[11px] text-gray-500">…and {uploadErrors.length - 10} more.</p>
                  )}
                </div>
              )}

              <ResultTable
                rows={[...active.observations].reverse().map((o, i, arr) => ({
                  ...o,
                  delta: arr[i + 1] ? o.value - arr[i + 1]!.value : null,
                }))}
                rowKey={(o) => o.asOfDate}
                emptyMessage="No observations recorded for this series yet."
                columns={[
                  {
                    key: 'period',
                    header: 'Period',
                    render: (o) => <span className="font-mono text-navy-900">{formatDate(o.asOfDate)}</span>,
                  },
                  {
                    key: 'value',
                    header: 'Value',
                    align: 'right',
                    render: (o) => (
                      <span className="font-mono">
                        {o.value} {active.unit}
                      </span>
                    ),
                  },
                  {
                    key: 'change',
                    header: 'Change',
                    align: 'right',
                    render: (o) => (
                      <span className="font-mono text-gray-500">
                        {o.delta === null ? '-' : `${o.delta > 0 ? '+' : ''}${o.delta.toFixed(2)}`}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </section>
        )}
      </div>
    </>
  );
}

export type { EconomicIndicator };
