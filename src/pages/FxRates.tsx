import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAuth } from '@/context/AuthContext';
import { useCurrencies, useFxRates, useSaveCurrency, useSaveFxRate, useAffiliates } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { buildFxTable, convert, missingRates } from '@/engine/fx';
import type { CurrencyRole, StoredCurrency, StoredFxRate } from '@/engine/types';

const ROLES: CurrencyRole[] = ['Functional', 'Reporting', 'Active'];

const ROLE_EXPLANATION: Record<CurrencyRole, string> = {
  Functional: 'The Group primary currency. Exactly one, and it cannot be changed once set.',
  Reporting: 'An active currency that other currencies consolidate into on the way to the functional currency.',
  Active: 'A currency the institution transacts in but does not consolidate through.',
};

export function FxRates() {
  const { hasPermission } = useAuth();
  const { data: currencies = [] } = useCurrencies();
  const { data: rates = [], isLoading } = useFxRates();
  const { data: affiliates = [] } = useAffiliates();
  const saveRate = useSaveFxRate();
  const saveCurrency = useSaveCurrency();
  const canEdit = hasPermission('data.configure');

  const [edits, setEdits] = useState<Record<string, number>>({});

  const asOfDate = rates[0]?.asOfDate ?? null;
  const table = buildFxTable('USD', rates, asOfDate ?? '');

  // Every currency an affiliate transacts in must be convertible, or a Group run will fail.
  const requiredCurrencies = Array.from(
    new Set(affiliates.flatMap((a) => [a.functionalCurrency, ...a.activeCurrencies])),
  );
  const missing = missingRates(requiredCurrencies, 'USD', table);

  const handleRateChange = (rate: StoredFxRate, value: number) => {
    setEdits({ ...edits, [rate.id]: value });
  };

  const commit = (rate: StoredFxRate) => {
    const value = edits[rate.id];
    if (value === undefined || value === rate.rate) return;
    saveRate.mutate(
      { ...rate, rate: value, updatedBy: 'current-user', updatedAt: new Date().toISOString() },
      {
        onSuccess: () =>
          setEdits((prev) => {
            const next = { ...prev };
            delete next[rate.id];
            return next;
          }),
      },
    );
  };

  const columns: ResultColumn<StoredFxRate>[] = [
    {
      key: 'pair',
      header: 'Pair',
      render: (r) => (
        <span className="font-mono font-bold text-navy-900">
          {r.base}/{r.quote}
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      render: (r) =>
        canEdit ? (
          <>
            <label htmlFor={`fx-${r.id}`} className="sr-only">
              {r.base} to {r.quote} rate
            </label>
            <input
              id={`fx-${r.id}`}
              type="number"
              step="any"
              value={edits[r.id] ?? r.rate}
              onChange={(e) => handleRateChange(r, Number(e.target.value))}
              onBlur={() => commit(r)}
              className="w-36 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
          </>
        ) : (
          <span className="font-mono">{r.rate.toPrecision(6)}</span>
        ),
    },
    {
      key: 'inverse',
      header: 'Units per USD',
      align: 'right',
      render: (r) => <span className="font-mono text-gray-600">{(1 / (edits[r.id] ?? r.rate)).toFixed(2)}</span>,
    },
    { key: 'source', header: 'Source', render: (r) => <span className="text-gray-500">{r.source}</span> },
    {
      key: 'asOf',
      header: 'As at',
      render: (r) => <span className="font-mono text-[11px]">{formatDate(r.asOfDate)}</span>,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Currency & FX Rates"
        description="Currency roles and the rates every consolidated figure converts through. Rates are a daily-SLA domain."
        asOfDate={asOfDate}
        scope="Group"
        currency="USD"
        staleWarning={
          missing.length > 0
            ? `No rate loaded for ${missing.join(', ')} — any Group run including these currencies will fail rather than silently omit them.`
            : null
        }
        metrics={[
          { label: 'Active currencies', value: String(currencies.filter((c) => c.isActive).length) },
          { label: 'Rates loaded', value: String(rates.length) },
          { label: 'Pivot currency', value: 'USD' },
          {
            label: 'Coverage',
            value: missing.length === 0 ? 'Complete' : `${missing.length} missing`,
            tone: missing.length === 0 ? 'success' : 'danger',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Exchange rates</h2>
          <ResultTable
            rows={rates}
            columns={columns}
            rowKey={(r) => r.id}
            emptyMessage={isLoading ? 'Loading…' : 'No rates loaded.'}
            renderDetail={(r) => (
              <div className="text-[11px] leading-relaxed text-gray-600">
                <p className="mb-2">
                  <span className="font-bold">Worked example.</span> 1,000,000 {r.base} converts to{' '}
                  <span className="font-mono font-bold text-navy-900">
                    {convert(1_000_000, r.base, 'USD', table).toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                    USD
                  </span>
                  .
                </p>
                <p>
                  Last updated by {r.updatedBy} on {formatDate(r.updatedAt.slice(0, 10))}.
                </p>
              </div>
            )}
          />
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Currency roles</h2>
          <ul className="space-y-3">
            {currencies.map((c) => (
              <li key={c.code} className="border-b border-gray-50 pb-3 last:border-0">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-[12px] font-bold text-navy-900">
                    {c.symbol} {c.code}
                  </span>
                  <StatusBadge status={c.role} tone={c.role === 'Functional' ? 'info' : 'neutral'} />
                </div>
                <p className="mb-1 text-[11px] text-gray-500">{c.name}</p>
                {canEdit && c.role !== 'Functional' && (
                  <>
                    <label htmlFor={`role-${c.code}`} className="sr-only">
                      {c.code} role
                    </label>
                    <select
                      id={`role-${c.code}`}
                      value={c.role}
                      onChange={(e) =>
                        saveCurrency.mutate({ ...c, role: e.target.value as CurrencyRole } satisfies StoredCurrency)
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    >
                      {ROLES.filter((r) => r !== 'Functional').map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-2 border-t border-gray-100 pt-4">
            {ROLES.map((r) => (
              <div key={r}>
                <dt className="text-[11px] font-bold text-navy-900">{r}</dt>
                <dd className="text-[11px] leading-relaxed text-gray-500">{ROLE_EXPLANATION[r]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
