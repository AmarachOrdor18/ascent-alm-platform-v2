import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { isRestrictedToOwnAffiliate } from '@/lib/scope';
import {
  useCurrencies,
  useFxRates,
  useSaveCurrency,
  useSaveFxRate,
  useDeleteCurrency,
  useDeleteFxRate,
  useAffiliates,
  useSaveBatch,
} from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { buildFxTable, convert, missingRates } from '@/engine/fx';
import { referenceLoadBatch } from '@/lib/referenceBatch';
import { useMarketDataSaved } from '@/lib/marketDataHooks';
import type { CurrencyRole, StoredCurrency, StoredFxRate } from '@/engine/types';

const ROLES: CurrencyRole[] = ['Functional', 'Reporting', 'Active'];

const ROLE_EXPLANATION: Record<CurrencyRole, string> = {
  Functional: 'The Group primary currency. Exactly one, and it cannot be changed once set.',
  Reporting: 'An active currency that other currencies consolidate into on the way to the functional currency.',
  Active: 'A currency the institution transacts in but does not consolidate through.',
};

export function FxRates() {
  const { hasPermission, user } = useAuth();
  const { data: currencies = [] } = useCurrencies();
  const { data: rates = [], isLoading } = useFxRates();
  const { data: affiliates = [] } = useAffiliates();
  const saveRate = useSaveFxRate();
  const saveCurrency = useSaveCurrency();
  const deleteCurrency = useDeleteCurrency();
  const deleteRate = useDeleteFxRate();
  const saveBatch = useSaveBatch();
  const marketDataSaved = useMarketDataSaved();
  // Market data is Group-wide: only Group-level users change it (affiliate users see it read-only).
  const canEdit = hasPermission('data.configure') && !isRestrictedToOwnAffiliate(user, hasPermission);

  // FX rates are Group-wide reference data, loaded here rather than staged like a Position file - but
  // Data Sources' freshness page only reads LoadBatch rows (checkFreshness, engine/vintage.ts), so
  // without recording one here that screen would read "Never loaded" forever no matter how current the
  // rates actually are.
  const recordFxLoad = (label: string, asOfDate: string, rowCount: number) =>
    saveBatch.mutate(
      referenceLoadBatch({
        domain: 'FxRates',
        affiliateCode: 'GROUP',
        asOfDate,
        label,
        uploadedBy: user?.name ?? 'unknown',
        rowCount,
      }),
    );

  const [edits, setEdits] = useState<Record<string, number>>({});
  const { asOfDate: workingDate } = useScope();
  const [showAdd, setShowAdd] = useState(false);
  const [newRate, setNewRate] = useState({ code: '', rate: '' });
  const rateDate = workingDate ?? new Date().toISOString().slice(0, 10);
  const [newCurrency, setNewCurrency] = useState({ code: '', name: '', symbol: '' });

  const handleAddCurrency = () => {
    const code = newCurrency.code.trim().toUpperCase();
    const name = newCurrency.name.trim();
    if (!code || !name || currencies.some((c) => c.code === code)) return;
    saveCurrency.mutate(
      { code, name, symbol: newCurrency.symbol.trim() || code, role: 'Active', isActive: true },
      { onSuccess: () => setNewCurrency({ code: '', name: '', symbol: '' }) },
    );
  };

  // Rates are a dated series (see engine/fx.ts) - "as of" here is the most recent one on file, the
  // same "latest wins" reading buildFxTable itself applies when resolving what a run actually converts at.
  const asOfDate = rates.reduce<string | null>(
    (latest, r) => (!latest || r.asOfDate > latest ? r.asOfDate : latest),
    null,
  );
  const table = buildFxTable('USD', rates, asOfDate ?? '');

  // A currency without a rate on any date at all - genuinely needs one before it can be added below.
  const ratelessCurrencies = currencies.filter((c) => c.code !== 'USD');

  const addRate = () => {
    if (!newRate.code || newRate.rate === '') return;
    const value = Number(newRate.rate);
    if (Number.isNaN(value) || value <= 0) return;
    saveRate.mutate(
      {
        // Dated, not just keyed by pair - adding a rate for a new date adds a row alongside whatever
        // that currency already has on file rather than overwriting it. Re-adding the same date instead
        // corrects that day's rate in place, same as editing it inline in the table below would.
        id: `FX-USD-${newRate.code}-${rateDate}`,
        base: 'USD',
        quote: newRate.code,
        rate: value,
        asOfDate: rateDate,
        source: 'Manual entry',
        updatedBy: user?.name ?? 'unknown',
        updatedAt: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          recordFxLoad(`Manual entry - ${newRate.code}`, rateDate, 1);
          marketDataSaved({
            fileName: 'Manual entry (FX rates)',
            asOfDate: rateDate,
            fx: [{ base: 'USD', quote: newRate.code }],
            curves: [],
            indicators: [],
          });
          setNewRate({ code: '', rate: '' });
        },
      },
    );
  };

  const rolesControls = useTableControls(currencies, 8, ['code', 'name']);
  const ratesControls = useTableControls(rates, 10, ['base', 'quote']);

  // Every currency an affiliate transacts in must be convertible, or a Group run will fail.
  const requiredCurrencies = Array.from(
    new Set(affiliates.flatMap((a) => [a.functionalCurrency, ...a.activeCurrencies])),
  );
  const missing = missingRates(requiredCurrencies, 'USD', table);

  const handleDeleteRate = (rate: StoredFxRate) => {
    if (!window.confirm(`Delete the ${rate.base}/${rate.quote} rate? This cannot be undone.`)) return;
    deleteRate.mutate(rate);
  };

  const handleDeleteCurrency = (currency: StoredCurrency) => {
    if (currency.role === 'Functional') return;
    if (requiredCurrencies.includes(currency.code)) {
      window.alert(
        `${currency.code} is still in use as a functional or active currency on at least one affiliate - cannot delete while referenced.`,
      );
      return;
    }
    // A currency can now carry several dated rate rows (a series, not a single record) - every one of
    // them references this currency and needs to go with it, not just whichever happens to be found first.
    const existingRates = rates.filter((r) => r.base === currency.code || r.quote === currency.code);
    if (
      !window.confirm(
        `Delete currency ${currency.code} - ${currency.name}? This also removes ${existingRates.length} FX rate${existingRates.length === 1 ? '' : 's'} on file for it. This cannot be undone.`,
      )
    )
      return;
    deleteCurrency.mutate(currency, {
      onSuccess: () => {
        for (const r of existingRates) deleteRate.mutate(r);
      },
    });
  };

  const handleRateChange = (rate: StoredFxRate, value: number) => {
    setEdits({ ...edits, [rate.id]: value });
  };

  const commit = (rate: StoredFxRate) => {
    const value = edits[rate.id];
    if (value === undefined || value === rate.rate) return;
    saveRate.mutate(
      { ...rate, rate: value, updatedBy: user?.name ?? 'unknown', updatedAt: new Date().toISOString() },
      {
        onSuccess: () => {
          recordFxLoad(`Rate correction - ${rate.base}/${rate.quote}`, rate.asOfDate, 1);
          marketDataSaved({
            fileName: 'Manual correction (FX rates)',
            asOfDate: rate.asOfDate,
            fx: [{ base: rate.base, quote: rate.quote }],
            curves: [],
            indicators: [],
          });
          setEdits((prev) => {
            const next = { ...prev };
            delete next[rate.id];
            return next;
          });
        },
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
              className="w-36 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[13px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
          </>
        ) : (
          <span className="font-mono">{r.rate.toPrecision(6)}</span>
        ),
    },
    { key: 'source', header: 'Source', render: (r) => <span className="text-gray-500">{r.source}</span> },
    {
      key: 'asOf',
      header: 'As at',
      render: (r) => <span className="font-mono text-[12px]">{formatDate(r.asOfDate)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        canEdit ? (
          <button
            type="button"
            onClick={() => handleDeleteRate(r)}
            className="text-[12px] font-bold text-danger hover:underline"
          >
            Delete
          </button>
        ) : null,
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
        warningLabel="Missing rates"
        staleWarning={
          missing.length > 0
            ? `No rate loaded for ${missing.join(', ')} - any Group run including these currencies will fail rather than silently omit them.`
            : null
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
            Exchange rates
            <InfoButton label="How conversion works">
              Every rate converts through USD as the pivot currency - an NGN/GHS conversion, for example, goes via each
              currency's own USD rate rather than a direct quote. A currency missing a rate here fails any run that
              touches it, rather than silently being converted at 1.0.
            </InfoButton>
          </h2>
          {canEdit && !showAdd && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              disabled={ratelessCurrencies.length === 0}
              className="mb-4 text-[12px] font-bold text-navy-700 hover:underline disabled:opacity-40"
            >
              + Add a rate by hand
            </button>
          )}
          {canEdit && showAdd && (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-4">
              <div>
                <label htmlFor="new-rate-currency" className="mb-1 block text-[12px] text-gray-600">
                  Currency
                </label>
                <select
                  id="new-rate-currency"
                  value={newRate.code}
                  onChange={(e) => setNewRate({ ...newRate, code: e.target.value })}
                  className="w-40 rounded border border-gray-200 px-2 py-1 text-[13px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                >
                  <option value="">Select…</option>
                  {ratelessCurrencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="new-rate-value" className="mb-1 block text-[12px] text-gray-600">
                  {newRate.code || 'Units'} per 1 USD
                </label>
                <input
                  id="new-rate-value"
                  type="number"
                  step="any"
                  value={newRate.rate}
                  onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })}
                  className="w-32 rounded border border-gray-200 px-2 py-1 font-mono text-[13px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  addRate();
                  setShowAdd(false);
                }}
                disabled={saveRate.isPending || !newRate.code || newRate.rate === ''}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {saveRate.isPending ? 'Saving…' : `Save for ${formatDate(rateDate)}`}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="text-[12px] font-bold text-gray-500 hover:text-navy-900"
              >
                Cancel
              </button>
            </div>
          )}
          <TableToolbar
            searchValue={ratesControls.search}
            onSearchChange={ratesControls.setSearch}
            exportData={() => ratesControls.filtered}
            exportFilename="fx-rates"
            density={ratesControls.density}
            onDensityChange={ratesControls.setDensity}
          />
          <ResultTable
            rows={ratesControls.paged}
            columns={columns}
            rowKey={(r) => r.id}
            className="mt-4"
            emptyMessage={isLoading ? 'Loading…' : 'No rates loaded.'}
            renderDetail={(r) => (
              <div className="text-[12px] leading-relaxed text-gray-600">
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
          <TablePagination
            currentPage={ratesControls.page}
            totalItems={ratesControls.totalItems}
            pageSize={ratesControls.pageSize}
            onPageChange={ratesControls.setPage}
          />
        </section>

        <details className="self-start rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
            Currencies ({currencies.length})
            <InfoButton label="What a role controls">
              {ROLES.map((r) => `${r}: ${ROLE_EXPLANATION[r]}`).join(' ')}
            </InfoButton>
          </summary>
          <div className="mt-3">
            {canEdit && (
              <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3">
                <div>
                  <label htmlFor="new-ccy-code" className="mb-1 block text-[12px] text-gray-600">
                    Code
                  </label>
                  <input
                    id="new-ccy-code"
                    value={newCurrency.code}
                    onChange={(e) => setNewCurrency({ ...newCurrency, code: e.target.value })}
                    placeholder="KES"
                    maxLength={3}
                    className="w-20 rounded border border-gray-200 px-2 py-1 font-mono text-[13px] uppercase focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  />
                </div>
                <div>
                  <label htmlFor="new-ccy-name" className="mb-1 block text-[12px] text-gray-600">
                    Name
                  </label>
                  <input
                    id="new-ccy-name"
                    value={newCurrency.name}
                    onChange={(e) => setNewCurrency({ ...newCurrency, name: e.target.value })}
                    placeholder="Kenyan Shilling"
                    className="w-40 rounded border border-gray-200 px-2 py-1 text-[13px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  />
                </div>
                <div>
                  <label htmlFor="new-ccy-symbol" className="mb-1 block text-[12px] text-gray-600">
                    Symbol
                  </label>
                  <input
                    id="new-ccy-symbol"
                    value={newCurrency.symbol}
                    onChange={(e) => setNewCurrency({ ...newCurrency, symbol: e.target.value })}
                    placeholder="KSh"
                    className="w-20 rounded border border-gray-200 px-2 py-1 text-[13px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddCurrency}
                  disabled={saveCurrency.isPending || !newCurrency.code.trim() || !newCurrency.name.trim()}
                  className="rounded-lg bg-navy-900 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                >
                  {saveCurrency.isPending ? 'Adding…' : 'New currency'}
                </button>
              </div>
            )}

            <TableToolbar
              searchValue={rolesControls.search}
              onSearchChange={rolesControls.setSearch}
              exportData={() => currencies}
              exportFilename="currency-roles"
              density={rolesControls.density}
              onDensityChange={rolesControls.setDensity}
            />
            <ResultTable
              rows={rolesControls.paged}
              rowKey={(c) => c.code}
              emptyMessage="No currencies."
              columns={[
                {
                  key: 'currency',
                  header: 'Currency',
                  render: (c) => (
                    <span>
                      <span className="font-mono text-[13px] font-bold text-navy-900">
                        {c.symbol} {c.code}
                      </span>
                      <span className="block text-[12px] text-gray-500">{c.name}</span>
                    </span>
                  ),
                },
                {
                  key: 'role',
                  header: 'Role',
                  render: (c) =>
                    canEdit && c.role !== 'Functional' ? (
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
                          className="rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                        >
                          {ROLES.filter((r) => r !== 'Functional').map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <StatusBadge status={c.role} tone={c.role === 'Functional' ? 'info' : 'neutral'} />
                    ),
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (c) =>
                    canEdit && c.role !== 'Functional' ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteCurrency(c)}
                        className="text-[12px] font-bold text-danger hover:underline"
                      >
                        Delete
                      </button>
                    ) : null,
                },
              ]}
            />
            <TablePagination
              currentPage={rolesControls.page}
              totalItems={rolesControls.totalItems}
              pageSize={rolesControls.pageSize}
              onPageChange={rolesControls.setPage}
            />
          </div>
        </details>
      </div>
    </>
  );
}
