import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { useAuth } from '@/context/AuthContext';
import { useYieldCurves, useSaveYieldCurve } from '@/lib/hooks';
import { formatPct } from '@/lib/format';
import { interpolateCurve } from '@/engine/ftp';
import type { AccrualBasis, CompoundingBasis, RateFormat, StoredYieldCurve } from '@/engine/types';

const RATE_FORMATS: RateFormat[] = ['Zero Coupon', 'Yield to Maturity'];
const COMPOUNDING: CompoundingBasis[] = ['Annual', 'Semiannual', 'Monthly', 'Simple'];
const ACCRUAL: AccrualBasis[] = ['30/360', 'Actual/360', 'Actual/Actual', '30/365', 'Actual/365', '30/Actual'];

export function YieldCurves() {
  const { hasPermission } = useAuth();
  const { data: curves = [], isLoading } = useYieldCurves();
  const save = useSaveYieldCurve();
  const canEdit = hasPermission('data.configure') || hasPermission('rules.edit');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StoredYieldCurve | null>(null);
  const [probeTenor, setProbeTenor] = useState(197);

  useEffect(() => {
    if (!activeId && curves.length > 0) setActiveId(curves[0]!.id);
  }, [curves, activeId]);

  const active = curves.find((c) => c.id === activeId) ?? null;
  const editing = draft ?? active;

  const updateTerm = (index: number, ratePercent: number) => {
    if (!editing) return;
    const terms = editing.terms.map((t, i) => (i === index ? { ...t, ratePercent } : t));
    setDraft({ ...editing, terms });
  };

  const handleSave = () => {
    if (!draft) return;
    save.mutate(
      { ...draft, updatedBy: 'current-user', updatedAt: new Date().toISOString() },
      { onSuccess: () => setDraft(null) },
    );
  };

  const probeRate = editing
    ? interpolateCurve(
        { currency: editing.currency, indexCode: editing.code, points: editing.terms, asOfDate: editing.asOfDate },
        probeTenor,
      )
    : null;

  const inverted = editing ? isInverted(editing) : false;

  return (
    <>
      <ModuleHeader
        title="Interest Rates & Yield Curves"
        description="Curves per currency, with the rate format, compounding and accrual conventions that determine what each quoted rate actually means."
        asOfDate={editing?.asOfDate ?? null}
        scope="Group"
        metrics={[
          { label: 'Curves defined', value: String(curves.length), about: 'Yield curves on file across every currency — these are what FTP base rates and shock scenarios are read from.' },
          { label: 'Currencies covered', value: String(new Set(curves.map((c) => c.currency)).size), about: 'Distinct currencies with at least one curve defined.' },
          { label: 'Term points', value: editing ? String(editing.terms.length) : '—', about: 'Tenor points on the selected curve — rates between them are linearly interpolated.' },
        ]}
        actions={
          draft && canEdit ? (
            <>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={save.isPending}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {save.isPending ? 'Saving…' : 'Save curve'}
              </button>
            </>
          ) : null
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <label htmlFor="curve-picker" className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          Curve
        </label>
        <select
          id="curve-picker"
          value={activeId ?? ''}
          onChange={(e) => {
            setActiveId(e.target.value);
            setDraft(null);
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
        >
          {curves.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        {isLoading && <span className="text-[12px] text-gray-400">Loading…</span>}
      </div>

      {!editing ? (
        <p className="rounded-lg bg-gray-50 p-6 text-center text-[12px] text-gray-500">
          {isLoading ? 'Loading curves…' : 'No curves defined yet.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                {editing.name}
                <InfoButton label="What this curve drives">
                  This curve is what FTP base rates and interest-rate shock scenarios are read from for {editing.currency}.
                  An inverted curve — the long end below the short end — is a genuine market signal, not a data error.
                </InfoButton>
              </h2>
              {inverted && <StatusBadge status="Inverted curve" tone="warning" />}
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={editing.terms} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--gray-200))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'hsl(var(--gray-500))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--gray-500))' }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                  width={48}
                />
                <Tooltip formatter={(v: number) => formatPct(v, 2)} contentStyle={{ fontSize: 12, borderRadius: 9 }} />
                <Line
                  type="monotone"
                  dataKey="ratePercent"
                  name={editing.code}
                  stroke="hsl(var(--teal-700))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th
                      scope="col"
                      className="py-2 px-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400"
                    >
                      Term
                    </th>
                    <th
                      scope="col"
                      className="py-2 px-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400"
                    >
                      Days
                    </th>
                    <th
                      scope="col"
                      className="py-2 px-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400"
                    >
                      Rate %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {editing.terms.map((t, i) => (
                    <tr key={t.tenorDays} className="border-b border-gray-100">
                      <td className="py-2 px-3 font-medium text-navy-900">{t.label}</td>
                      <td className="py-2 px-3 text-right font-mono text-gray-500">{t.tenorDays}</td>
                      <td className="py-2 px-3 text-right">
                        {canEdit ? (
                          <>
                            <label htmlFor={`term-${t.tenorDays}`} className="sr-only">
                              {t.label} rate
                            </label>
                            <input
                              id={`term-${t.tenorDays}`}
                              type="number"
                              step="0.01"
                              value={t.ratePercent}
                              onChange={(e) => updateTerm(i, Number(e.target.value))}
                              className="w-24 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                            />
                          </>
                        ) : (
                          <span className="font-mono">{formatPct(t.ratePercent, 2)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Conventions
                <InfoButton label="Why these matter">
                  Rate format, compounding and accrual basis together determine what a quoted rate actually means in
                  cash-flow terms — the same number produces different results under different conventions, which is
                  why they're attributes of the curve rather than an assumption buried in the engine.
                </InfoButton>
              </h2>
              <div className="space-y-3">
                <Field label="Currency" value={editing.currency} />
                <Select
                  id="rate-format"
                  label="Rate format"
                  value={editing.rateFormat}
                  options={RATE_FORMATS}
                  disabled={!canEdit}
                  onChange={(v) => setDraft({ ...editing, rateFormat: v as RateFormat })}
                />
                <Select
                  id="compounding"
                  label="Compounding basis"
                  value={editing.compoundingBasis}
                  options={COMPOUNDING}
                  disabled={!canEdit}
                  onChange={(v) => setDraft({ ...editing, compoundingBasis: v as CompoundingBasis })}
                />
                <Select
                  id="accrual"
                  label="Accrual basis"
                  value={editing.accrualBasis}
                  options={ACCRUAL}
                  disabled={!canEdit}
                  onChange={(v) => setDraft({ ...editing, accrualBasis: v as AccrualBasis })}
                />
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-gray-500">
                The same quoted rate produces different cash flows under different conventions — which is why these are
                attributes of the curve rather than assumptions buried in the engine.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Interpolation probe
                <InfoButton label="How this is calculated">
                  Linearly interpolates between the two term points bracketing the tenor you enter, and holds flat
                  beyond either end of the curve — the same method FTP uses to price a position repricing at an
                  in-between tenor.
                </InfoButton>
              </h2>
              <label htmlFor="probe" className="mb-1 block text-[11px] text-gray-600">
                Tenor in days
              </label>
              <input
                id="probe"
                type="number"
                min={1}
                value={probeTenor}
                onChange={(e) => setProbeTenor(Number(e.target.value))}
                className="w-full rounded border border-gray-200 px-2 py-1 font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
              />
              <p className="mt-3 text-[24px] font-bold text-navy-900">{formatPct(probeRate, 3)}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                Linearly interpolated between the bracketing term points, and held flat beyond either end. This is the
                rate FTP would charge a position repricing in {probeTenor} days.
              </p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-gray-600">{label}</p>
      <p className="font-mono text-[12px] font-bold text-navy-900">{value}</p>
    </div>
  );
}

function Select({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] text-gray-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

// Inverted: long-end rate below the short end.
function isInverted(curve: StoredYieldCurve): boolean {
  if (curve.terms.length < 2) return false;
  const first = curve.terms[0]!;
  const last = curve.terms[curve.terms.length - 1]!;
  return last.ratePercent < first.ratePercent;
}
