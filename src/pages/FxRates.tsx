import { useRef, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { useAuth } from '@/context/AuthContext';
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
import { importFxRates, type RowError } from '@/lib/csvImport';
import { readUploadAsCsvText, UPLOAD_ACCEPT } from '@/lib/fileImport';
import { downloadCsvTemplate } from '@/lib/csvTemplates';
import { referenceLoadBatch } from '@/lib/referenceBatch';
import type { CurrencyRole, StoredCurrency, StoredFxRate } from '@/engine/types';

const FX_TEMPLATE_COLUMNS = ['base', 'quote', 'rate', 'asOfDate'];
const FX_TEMPLATE_SAMPLE = ['KES', 'USD', '129', '2026-07-31'];

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
  const canEdit = hasPermission('data.configure');

  // FX rates are Group-wide reference data, loaded here rather than staged like a Position file - but
  // Data Sources' freshness page only reads LoadBatch rows (checkFreshness, engine/vintage.ts), so
  // without recording one here that screen would read "Never loaded" forever no matter how current the
  // rates actually are.
  const recordFxLoad = (label: string, asOfDate: string, rowCount: number) =>
    saveBatch.mutate(
      referenceLoadBatch({ domain: 'FxRates', affiliateCode: 'GROUP', asOfDate, label, uploadedBy: user?.name ?? 'unknown', rowCount }),
    );

  const [edits, setEdits] = useState<Record<string, number>>({});
  const [newRate, setNewRate] = useState({ code: '', rate: '', asOfDate: new Date().toISOString().slice(0, 10) });
  const [newCurrency, setNewCurrency] = useState({ code: '', name: '', symbol: '' });

  const bulkFileInput = useRef<HTMLInputElement>(null);
  const [bulkStaged, setBulkStaged] = useState<StoredFxRate[] | null>(null);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkErrors, setBulkErrors] = useState<RowError[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);

  const handleBulkFile = async (file: File) => {
    let text: string;
    try {
      text = await readUploadAsCsvText(file);
    } catch (err) {
      setBulkStaged(null);
      setBulkFileName(file.name);
      setBulkErrors([{ line: 1, column: '', message: err instanceof Error ? err.message : 'This file could not be read.' }]);
      if (bulkFileInput.current) bulkFileInput.current.value = '';
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const result = importFxRates(text, today, user?.name ?? 'unknown');
    setBulkStaged(result.rows);
    setBulkFileName(file.name);
    setBulkErrors(result.errors);
    if (bulkFileInput.current) bulkFileInput.current.value = '';
  };

  const handleBulkImport = async () => {
    if (!bulkStaged || bulkStaged.length === 0) return;
    setBulkImporting(true);
    try {
      for (const rate of bulkStaged) await saveRate.mutateAsync(rate);
      const latestAsOf = bulkStaged.reduce((max, r) => (r.asOfDate > max ? r.asOfDate : max), bulkStaged[0]!.asOfDate);
      recordFxLoad(bulkFileName ?? 'FX rates bulk upload', latestAsOf, bulkStaged.length);
      setBulkStaged(null);
      setBulkFileName(null);
      setBulkErrors([]);
    } finally {
      setBulkImporting(false);
    }
  };

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
  const asOfDate = rates.reduce<string | null>((latest, r) => (!latest || r.asOfDate > latest ? r.asOfDate : latest), null);
  const table = buildFxTable('USD', rates, asOfDate ?? '');

  // A currency without a rate on any date at all - genuinely needs one before it can be added below.
  const ratelessCurrencies = currencies.filter((c) => c.code !== 'USD');

  const addRate = () => {
    if (!newRate.code || newRate.rate === '' || !newRate.asOfDate) return;
    const value = Number(newRate.rate);
    if (Number.isNaN(value) || value <= 0) return;
    saveRate.mutate(
      {
        // Dated, not just keyed by pair - adding a rate for a new date adds a row alongside whatever
        // that currency already has on file rather than overwriting it. Re-adding the same date instead
        // corrects that day's rate in place, same as editing it inline in the table below would.
        id: `FX-${newRate.code}-USD-${newRate.asOfDate}`,
        base: newRate.code,
        quote: 'USD',
        rate: value,
        asOfDate: newRate.asOfDate,
        source: 'Manual entry',
        updatedBy: 'current-user',
        updatedAt: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          recordFxLoad(`Manual entry - ${newRate.code}`, newRate.asOfDate, 1);
          setNewRate({ code: '', rate: '', asOfDate: newRate.asOfDate });
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
      window.alert(`${currency.code} is still in use as a functional or active currency on at least one affiliate - cannot delete while referenced.`);
      return;
    }
    // A currency can now carry several dated rate rows (a series, not a single record) - every one of
    // them references this currency and needs to go with it, not just whichever happens to be found first.
    const existingRates = rates.filter((r) => r.base === currency.code || r.quote === currency.code);
    if (!window.confirm(`Delete currency ${currency.code} - ${currency.name}? This also removes ${existingRates.length} FX rate${existingRates.length === 1 ? '' : 's'} on file for it. This cannot be undone.`)) return;
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
      { ...rate, rate: value, updatedBy: 'current-user', updatedAt: new Date().toISOString() },
      {
        onSuccess: () => {
          recordFxLoad(`Rate correction - ${rate.base}/${rate.quote}`, rate.asOfDate, 1);
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
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        canEdit ? (
          <button
            type="button"
            onClick={() => handleDeleteRate(r)}
            className="text-[11px] font-bold text-danger hover:underline"
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
        staleWarning={
          missing.length > 0
            ? `No rate loaded for ${missing.join(', ')} - any Group run including these currencies will fail rather than silently omit them.`
            : null
        }
        metrics={[
          { label: 'Active currencies', value: String(currencies.filter((c) => c.isActive).length), about: 'Currencies available for positions and rules to reference.' },
          { label: 'Rates loaded', value: String(rates.length), about: 'Exchange rate pairs currently on file.' },
          { label: 'Pivot currency', value: 'USD', about: 'Every rate converts through this currency - a NGN/GHS conversion, for example, goes via their respective USD rates.' },
          {
            label: 'Coverage',
            value: missing.length === 0 ? 'Complete' : `${missing.length} missing`,
            tone: missing.length === 0 ? 'success' : 'danger',
            about: 'Whether every currency an affiliate actually transacts in has a loaded rate. A gap here fails any run touching that currency rather than silently omitting it.',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
            Exchange rates
            <InfoButton label="How conversion works">
              Every rate converts through USD as the pivot currency - an NGN/GHS conversion, for example, goes via
              each currency's own USD rate rather than a direct quote. A currency missing a rate here fails any run
              that touches it, rather than silently being converted at 1.0.
            </InfoButton>
          </h2>

          {canEdit && (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-4">
              <div>
                <label htmlFor="new-rate-currency" className="mb-1 block text-[11px] text-gray-600">
                  Currency
                </label>
                <select
                  id="new-rate-currency"
                  value={newRate.code}
                  onChange={(e) => setNewRate({ ...newRate, code: e.target.value })}
                  disabled={ratelessCurrencies.length === 0}
                  className="w-40 rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                >
                  <option value="">{ratelessCurrencies.length === 0 ? 'No other currencies' : 'Select…'}</option>
                  {ratelessCurrencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="new-rate-value" className="mb-1 block text-[11px] text-gray-600">
                  Rate (per USD)
                </label>
                <input
                  id="new-rate-value"
                  type="number"
                  step="any"
                  value={newRate.rate}
                  onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })}
                  className="w-32 rounded border border-gray-200 px-2 py-1 font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                />
              </div>
              <div>
                <label htmlFor="new-rate-asof" className="mb-1 block text-[11px] text-gray-600">
                  As of date
                </label>
                <input
                  id="new-rate-asof"
                  type="date"
                  value={newRate.asOfDate}
                  onChange={(e) => setNewRate({ ...newRate, asOfDate: e.target.value })}
                  className="rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                />
              </div>
              <button
                type="button"
                onClick={addRate}
                disabled={saveRate.isPending || !newRate.code || newRate.rate === '' || !newRate.asOfDate}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {saveRate.isPending ? 'Saving…' : 'Add rate'}
              </button>
              <p className="w-full text-[11px] text-gray-500">
                A rate is a dated series, like a yield curve - adding one for a date that currency already has
                corrects that day's rate in place (same as editing it inline in the table below); a new date adds
                a new row alongside its history. Runs use whichever dated rate is most recent as of their own date.
              </p>
            </div>
          )}

          {canEdit && (
            <div className="mb-4 rounded-lg bg-gray-50 p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Bulk upload - new pairs or a refreshed set of rates
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="fx-bulk-file" className="mb-1 block text-[11px] text-gray-600">
                    CSV, Excel, JSON or XML file
                  </label>
                  <input
                    id="fx-bulk-file"
                    ref={bulkFileInput}
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleBulkFile(file);
                    }}
                    className="text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-[12px] file:font-bold file:text-white hover:file:bg-navy-700"
                  />
                  <button
                    type="button"
                    onClick={() => downloadCsvTemplate(FX_TEMPLATE_COLUMNS, FX_TEMPLATE_SAMPLE, 'fx_rates_template.csv')}
                    className="mt-1 block text-[10px] font-bold text-navy-700 hover:underline"
                  >
                    Download CSV template
                  </button>
                </div>
                {bulkStaged && bulkStaged.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleBulkImport()}
                    disabled={bulkImporting}
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  >
                    {bulkImporting ? 'Importing…' : `Import ${bulkStaged.length} rate${bulkStaged.length === 1 ? '' : 's'}`}
                  </button>
                )}
              </div>
              {bulkFileName && bulkStaged && (
                <p className="mt-2 text-[11px] text-gray-500">
                  {bulkFileName} - {bulkStaged.length} row{bulkStaged.length === 1 ? '' : 's'} parsed
                  {bulkErrors.length > 0 && `, ${bulkErrors.length} error${bulkErrors.length === 1 ? '' : 's'}`}.
                </p>
              )}
              {bulkErrors.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] text-danger">
                  {bulkErrors.slice(0, 10).map((e, i) => (
                    <li key={`${e.line}-${i}`}>
                      Line {e.line} ({e.column}): {e.message}
                    </li>
                  ))}
                </ul>
              )}
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

          <TablePagination
            currentPage={ratesControls.page}
            totalItems={ratesControls.totalItems}
            pageSize={ratesControls.pageSize}
            onPageChange={ratesControls.setPage}
          />
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
            Currency roles
            <InfoButton label="What a role controls">
              Functional is the Group's own primary currency, fixed once and never changed. Reporting currencies
              consolidate other currencies on their way to it. Active currencies are transacted in but never
              consolidated through. See the definitions below for the full detail.
            </InfoButton>
          </h2>

          {canEdit && (
            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3">
              <div>
                <label htmlFor="new-ccy-code" className="mb-1 block text-[11px] text-gray-600">Code</label>
                <input id="new-ccy-code" value={newCurrency.code} onChange={(e) => setNewCurrency({ ...newCurrency, code: e.target.value })} placeholder="KES" maxLength={3} className="w-20 rounded border border-gray-200 px-2 py-1 font-mono text-[12px] uppercase focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700" />
              </div>
              <div>
                <label htmlFor="new-ccy-name" className="mb-1 block text-[11px] text-gray-600">Name</label>
                <input id="new-ccy-name" value={newCurrency.name} onChange={(e) => setNewCurrency({ ...newCurrency, name: e.target.value })} placeholder="Kenyan Shilling" className="w-40 rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700" />
              </div>
              <div>
                <label htmlFor="new-ccy-symbol" className="mb-1 block text-[11px] text-gray-600">Symbol</label>
                <input id="new-ccy-symbol" value={newCurrency.symbol} onChange={(e) => setNewCurrency({ ...newCurrency, symbol: e.target.value })} placeholder="KSh" className="w-20 rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700" />
              </div>
              <button
                type="button"
                onClick={handleAddCurrency}
                disabled={saveCurrency.isPending || !newCurrency.code.trim() || !newCurrency.name.trim()}
                className="rounded-lg bg-navy-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {saveCurrency.isPending ? 'Adding…' : 'New currency'}
              </button>
              <p className="w-full text-[11px] text-gray-500">
                Registers with an Active role and no rate yet - add its rate above once it exists here.
              </p>
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
                    <span className="font-mono text-[12px] font-bold text-navy-900">
                      {c.symbol} {c.code}
                    </span>
                    <span className="block text-[11px] text-gray-500">{c.name}</span>
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
                        className="rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
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
                      className="text-[11px] font-bold text-danger hover:underline"
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
