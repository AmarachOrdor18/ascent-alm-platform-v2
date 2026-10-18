/**
 * Data → Market data (/data/market): the one place market data arrives, with its status - per kind the
 * latest date, who loaded it, what it covers and whether it is older than the organisation's freshness
 * limit (setting marketData.slaDays). Every load is audited with the affiliates it affects, notifies their
 * users, and recalculates readiness everywhere. One Market data upload populates FX rates, yield curves and economic indicators in one pass -
 * splitMarketData reads each row kind, and each workbook sheet is read together - so the three detail
 * pages no longer need bulk imports of their own. They keep their manual entry, corrections and conventions.
 */
import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useBatches, useCurrencies, useEconomicIndicators, useFxRates, useYieldCurves } from '@/lib/hooks';
import { afterMarketDataLoad } from '@/lib/marketDataEvents';
import { WhoCanFix } from '@/components/readiness/WhoCanFix';
import { marketDataStatus } from '@/lib/readiness';
import { invalidateReadinessInputs, useMarketDataSlaDays } from '@/lib/readinessHooks';
import { notificationKeys } from '@/lib/notificationHooks';
import { useScope } from '@/context/ScopeContext';
import { readUploadAsCsvText, UPLOAD_ACCEPT } from '@/lib/fileImport';
import { splitMarketData, saveMarketDataRecords, type MarketDataRecords } from '@/lib/sourceIngest';
import { formatDate } from '@/lib/format';
import { buildFxTable, missingRates } from '@/engine/fx';
import type { RowError } from '@/lib/csvImport';

const today = () => new Date().toISOString().slice(0, 10);

interface CurveGroup {
  label: string;
  points: number;
  asOfDate: string;
}

interface Stage {
  fileName: string;
  asOfDate: string;
  /** Dates the file itself carried for FX rates and curves, when they differ from the header date. */
  otherFileDates: string[];
  records: MarketDataRecords;
  curveGroups: CurveGroup[];
  seriesGroups: Array<{ label: string; observations: number; asOfDate: string }>;
  errors: RowError[];
}

export function MarketDataHub() {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const { data: currencies = [] } = useCurrencies();
  const { data: fxRates = [] } = useFxRates();
  const { data: curves = [] } = useYieldCurves();
  const { data: indicators = [] } = useEconomicIndicators();
  const { data: batches = [] } = useBatches();
  // Earlier market-data uploads still in force - one entry per upload (a workbook records one load per kind).
  const previousUploads = useMemo(() => {
    const by = new Map<string, { id: string; fileName: string; uploadedAt: string; asOfDate: string }>();
    for (const b of batches) {
      if (b.affiliateCode !== 'GROUP' || b.status !== 'Committed') continue;
      if (!['FxRates', 'MarketRates', 'EconomicIndicators', 'MarketData'].includes(b.domain)) continue;
      const id = b.marketLoadId ?? b.id;
      if (!by.has(id))
        by.set(id, { id, fileName: b.fileName.split(' - ')[0]!, uploadedAt: b.uploadedAt, asOfDate: b.asOfDate });
    }
    return [...by.values()].sort((a, z) => z.uploadedAt.localeCompare(a.uploadedAt));
  }, [batches]);
  const [replaces, setReplaces] = useState('');
  // Market data is Group's: uploading it needs upload rights at Group level.
  const canUpload =
    (hasPermission('data.upload') || hasPermission('data.configure')) &&
    (user?.affiliateCode === 'GROUP' || hasPermission('group.manage'));
  const slaDays = useMarketDataSlaDays();
  const { asOfDate: scopeDate, asOfDateChosen } = useScope();
  // Only a date picked in the header counts as the working date.
  const workingDate = asOfDateChosen ? scopeDate : null;
  const newestLoaded = [...fxRates.map((r) => r.asOfDate), ...curves.map((c) => c.asOfDate)].sort().at(-1) ?? today();
  // Age is judged against the date being worked on (header As-of date), not today's calendar date.
  const statusRef = workingDate ?? newestLoaded;
  const status = useMemo(
    () =>
      marketDataStatus(fxRates, curves, indicators, slaDays, statusRef).map((k) =>
        workingDate ? k : { ...k, stale: false },
      ),
    [fxRates, curves, indicators, slaDays, statusRef, workingDate],
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const lastFx = fxRates.reduce<string | null>((m, r) => (!m || r.asOfDate > m ? r.asOfDate : m), null);
  const lastCurve = curves.reduce<string | null>((m, c) => (!m || c.asOfDate > m ? c.asOfDate : m), null);
  const lastIndicator = useMemo(
    () =>
      indicators.reduce<string | null>((m, i) => {
        const obs = i.observations[i.observations.length - 1]?.asOfDate ?? null;
        return !m || (obs && obs > m) ? obs : m;
      }, null),
    [indicators],
  );

  const fxAsOf = lastFx ?? '';
  const table = useMemo(() => buildFxTable('USD', fxRates, fxAsOf), [fxRates, fxAsOf]);
  const missing = useMemo(
    () => missingRates(Array.from(new Set(currencies.filter((c) => c.isActive).map((c) => c.code))), 'USD', table),
    [currencies, table],
  );
  const curvesByCurrency = useMemo(() => {
    const by = new Map<string, { latest: string; versions: number }>();
    for (const c of curves) {
      const cur = by.get(c.currency);
      by.set(c.currency, {
        latest: cur && cur.latest > c.asOfDate ? cur.latest : c.asOfDate,
        versions: (cur?.versions ?? 0) + 1,
      });
    }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [curves]);
  const seriesPreview = useMemo(
    () =>
      indicators
        .map((i) => {
          const latest = i.observations[i.observations.length - 1] ?? null;
          return i.isActive === false
            ? null
            : {
                name: i.name,
                code: i.code,
                unit: i.unit,
                latest: latest ? { asOfDate: latest.asOfDate, value: latest.value } : null,
              };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, 5),
    [indicators],
  );

  const handleFile = async (file: File) => {
    setError(null);
    setSaved(null);
    let text: string;
    try {
      // A market-data workbook keeps FX rates, curves and policy rates on separate sheets - read them all,
      // stacked into one table with a dataType column per sheet.
      text = await readUploadAsCsvText(file, { allSheets: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This file could not be read.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (!workingDate) {
      setError('Pick the As-of date at the top of the page first - the upload is loaded as of that date.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    const raw = splitMarketData(text, workingDate, user?.name ?? 'unknown');
    // FX rates and curves are loaded as of the header date whatever the file says; the policy-rate history
    // keeps its own monthly dates (it is a series the models are fitted on).
    const fileDates = [...new Set([...raw.fx, ...raw.curves].map((r) => r.asOfDate))].filter(
      (d) => d && d !== workingDate,
    );
    const split = {
      ...raw,
      fx: raw.fx.map((r) => ({ ...r, asOfDate: workingDate, id: `FX-${r.base}-${r.quote}-${workingDate}` })),
      curves: raw.curves.map((r) => ({ ...r, asOfDate: workingDate })),
    };
    const curveGroups = new Map<string, CurveGroup>();
    for (const p of split.curves) {
      const label = `${p.currency} · ${p.curveCode} @ ${p.asOfDate}`;
      const g = curveGroups.get(label);
      if (g) g.points += 1;
      else curveGroups.set(label, { label, points: 1, asOfDate: p.asOfDate });
    }
    const seriesGroups = new Map<string, { label: string; observations: number; asOfDate: string }>();
    for (const row of split.indicators) {
      const label = `${row.indicatorCode}${row.countryCode ? ` (${row.countryCode})` : ''}`;
      const g = seriesGroups.get(label);
      if (g) {
        g.observations += 1;
        if (row.asOfDate > g.asOfDate) g.asOfDate = row.asOfDate;
      } else seriesGroups.set(label, { label, observations: 1, asOfDate: row.asOfDate });
    }
    setStage({
      fileName: file.name,
      asOfDate: workingDate,
      otherFileDates: fileDates,
      records: { fx: split.fx, curves: split.curves, indicators: split.indicators },
      curveGroups: [...curveGroups.values()],
      seriesGroups: [...seriesGroups.values()],
      errors: split.errors,
    });
    setReplaces(previousUploads.find((u) => u.fileName === file.name)?.id ?? '');
    if (inputRef.current) inputRef.current.value = '';
  };

  const commit = async () => {
    if (!stage) return;
    setSaving(true);
    try {
      const result = await saveMarketDataRecords(
        stage.records,
        stage.asOfDate,
        stage.fileName,
        user?.name ?? 'unknown',
        replaces || null,
      );
      setReplaces('');
      // Audit (with the affiliates affected) and notify those affiliates' users and Group.
      const { affected } = await afterMarketDataLoad(
        { fileName: stage.fileName, asOfDate: stage.asOfDate, ...stage.records },
        user ? { id: user.id, name: user.name, role: user.role } : null,
      );
      // Readiness everywhere recalculates from the refreshed rates and curves.
      invalidateReadinessInputs(qc);
      void qc.invalidateQueries({ queryKey: ['auditEvents'] });
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
      setSaved(
        `Loaded from ${stage.fileName}: ${result.fx} FX rate${result.fx === 1 ? '' : 's'}, ${result.curves} curve version${result.curves === 1 ? '' : 's'}, ${result.indicators} indicator series. ` +
          (affected.length > 0
            ? `Affiliates affected and notified: ${affected.map((a) => a.name).join(', ')}.`
            : 'No affiliate uses these currencies yet.'),
      );
      setStage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const curriedRows = stage
    ? stage.records.fx.length + stage.records.curves.length + stage.records.indicators.length
    : 0;
  const asOfBadges = [lastFx, lastCurve, lastIndicator].filter((x): x is string => !!x);
  const DETAIL_TAB: Record<string, { href: string; extra: string | null }> = {
    'FX rates': {
      href: '/data/market/fx',
      extra: missing.length > 0 ? `No rate yet for ${missing.join(', ')}` : null,
    },
    'Yield curves': {
      href: '/data/market/curves',
      extra: curvesByCurrency.length > 0 ? curvesByCurrency.map(([ccy]) => ccy).join(', ') : null,
    },
    Indicators: {
      href: '/data/market/indicators',
      extra: seriesPreview.length > 0 ? seriesPreview.map((x) => x.name).join(', ') : null,
    },
  };

  return (
    <>
      <ModuleHeader
        title="Market data"
        description="FX rates, yield curves and economic indicators - loaded once by Group from one file and used by every affiliate."
        about={`Data older than ${slaDays} days before the As-of date in the header is flagged as stale. Each row (or workbook sheet) is recognised by its columns: base/quote/rate for FX, currency/curveCode/tenorDays/ratePercent for curves, indicatorCode/asOfDate/value for indicators.`}
        asOfDate={asOfBadges.length > 0 ? asOfBadges.sort().at(-1)! : null}
        scope="Group"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {status.map((k) => {
          const detail = DETAIL_TAB[k.kind];
          return (
            <section key={k.kind} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center justify-between gap-2 text-[13px] font-bold text-navy-900">
                {k.kind}
                <StatusBadge
                  status={k.lastDate === null ? 'Not loaded' : k.stale ? `Stale - ${k.ageDays} days` : 'Current'}
                  tone={k.lastDate === null ? 'danger' : k.stale ? 'warning' : 'success'}
                />
              </h3>
              <div className="mt-2 space-y-0.5">
                <Line2 label="Latest data" value={k.lastDate ? formatDate(k.lastDate) : 'Never'} />
                <Line2
                  label="Loaded"
                  value={
                    k.lastUpdatedAt
                      ? `${formatDate(k.lastUpdatedAt.slice(0, 10))}${k.lastUpdatedBy ? ` by ${k.lastUpdatedBy}` : ''}`
                      : '-'
                  }
                />
                <Line2 label="Covers" value={k.coverage} />
                {detail?.extra && <p className="text-[12px] text-gray-500">{detail.extra}</p>}
              </div>
              {detail && (
                <Link
                  href={detail.href}
                  className="mt-3 inline-block text-[12px] font-bold text-navy-700 hover:underline"
                >
                  Open {k.kind.toLowerCase()} →
                </Link>
              )}
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-widest text-navy-900">Upload market data</h2>

        {canUpload ? (
          <div>
            <input
              ref={inputRef}
              id="market-hub-upload"
              type="file"
              aria-label="Market data file"
              accept={UPLOAD_ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-[13px] file:font-bold file:text-white hover:file:bg-navy-700"
            />
            <p className="mt-2 text-[12px] text-gray-500">
              {workingDate
                ? `Loaded as of ${formatDate(workingDate)} - the As-of date at the top of the page.`
                : 'Pick the As-of date at the top of the page first - the upload is loaded as of that date.'}
            </p>
          </div>
        ) : (
          <div className="text-[13px] text-gray-500">
            <p>Market data is loaded once at Group level for every affiliate - you are notified when it arrives.</p>
            <WhoCanFix
              item={{
                fixPermission: 'data.upload',
                fixHref: '/data/market',
                fixLabel: 'Upload market data',
                scope: 'Group',
              }}
              affiliateCode={null}
              hideAction
              className="mt-1"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[12px] text-danger">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-3 text-[12px] text-success">
            {saved}
          </p>
        )}

        {stage && (
          <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="text-[13px] font-bold text-navy-900">
              {stage.fileName} - {curriedRows} row{curriedRows === 1 ? '' : 's'} recognised
              {stage.errors.length > 0 && ', ' + stage.errors.length + ' not recognised'}
            </p>
            <p className="mt-1 text-[12px] text-gray-600">
              FX rates and curves are loaded as of <span className="font-bold">{formatDate(stage.asOfDate)}</span>.
              {stage.otherFileDates.length > 0 && (
                <span className="font-bold text-warning">
                  {' '}
                  The file says {stage.otherFileDates.join(', ')} - loaded as {formatDate(stage.asOfDate)}.
                </span>
              )}
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-navy-900">
              {stage.records.fx.length > 0 && <li>• {stage.records.fx.length} FX rate row(s)</li>}
              {stage.curveGroups.map((g) => (
                <li key={g.label}>
                  • Curve {g.label}: {g.points} point{g.points === 1 ? '' : 's'}
                </li>
              ))}
              {stage.seriesGroups.map((g) => (
                <li key={g.label}>
                  • Series {g.label}: {g.observations} observation(s) to {formatDate(g.asOfDate)}
                </li>
              ))}
              {curriedRows === 0 && <li>• Nothing recognised - check the file&apos;s columns.</li>}
            </ul>
            {stage.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-[12px] text-danger">
                {stage.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    {e.line ? `Line ${e.line}` : ''}
                    {e.column ? ` (${e.column})` : ''}: {e.message}
                  </li>
                ))}
                {stage.errors.length > 10 && <li>…and {stage.errors.length - 10} more.</li>}
              </ul>
            )}
            {previousUploads.length > 0 && (
              <div className="mt-3">
                <label htmlFor="market-replaces" className="mb-1 block text-[12px] font-bold text-navy-900">
                  Replaces an earlier upload
                </label>
                <select
                  id="market-replaces"
                  value={replaces}
                  onChange={(e) => setReplaces(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-navy-900"
                >
                  <option value="">No - add to what is loaded</option>
                  {previousUploads.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fileName} (loaded {formatDate(u.uploadedAt.slice(0, 10))})
                    </option>
                  ))}
                </select>
                {replaces && (
                  <p className="mt-1 text-[12px] text-warning">
                    Everything that upload loaded is taken out first - including dates this file doesn&apos;t have.
                  </p>
                )}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void commit()}
                disabled={saving || curriedRows === 0}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {saving ? 'Saving…' : `Import ${curriedRows} row${curriedRows === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                onClick={() => setStage(null)}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-[13px] font-bold text-gray-500 hover:text-navy-900"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function Line2({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[12px] text-gray-500">
      <span className="text-gray-400">{label}</span> <span className="font-bold text-navy-900">{value}</span>
    </p>
  );
}
