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
import { InfoButton } from '@/components/ui/InfoButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useCurrencies, useEconomicIndicators, useFxRates, useYieldCurves } from '@/lib/hooks';
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
  records: MarketDataRecords;
  curveGroups: CurveGroup[];
  seriesGroups: Array<{ label: string; observations: number; asOfDate: string }>;
  errors: RowError[];
}

export function MarketDataHub() {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const { data: currencies = [] } = useCurrencies();
  const { data: fxRates = [], isLoading: fxLoading } = useFxRates();
  const { data: curves = [] } = useYieldCurves();
  const { data: indicators = [] } = useEconomicIndicators();
  // Market data is Group's: uploading it needs upload rights at Group level.
  const canUpload =
    (hasPermission('data.upload') || hasPermission('data.configure')) &&
    (user?.affiliateCode === 'GROUP' || hasPermission('group.manage'));
  const slaDays = useMarketDataSlaDays();
  const { asOfDate: workingDate } = useScope();
  const statusRef = workingDate ?? today();
  const status = useMemo(
    () => marketDataStatus(fxRates, curves, indicators, slaDays, statusRef),
    [fxRates, curves, indicators, slaDays, statusRef],
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [asOfDate, setAsOfDate] = useState(today());
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
  const curveCurrencies = Array.from(new Set(curves.map((c) => c.currency)));
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
    // The date is the fallback applied to rows without their own asOfDate - per-row dates win.
    const split = splitMarketData(text, asOfDate, user?.name ?? 'unknown');
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
      asOfDate,
      records: { fx: split.fx, curves: split.curves, indicators: split.indicators },
      curveGroups: [...curveGroups.values()],
      seriesGroups: [...seriesGroups.values()],
      errors: split.errors,
    });
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
      );
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
        `Loaded from ${stage.fileName}: ${result.fx} FX rate${result.fx === 1 ? '' : 's'}, ${result.curves} curve version${result.curves === 1 ? '' : 's'}, ${result.indicators} indicator series${result.indicators === 1 ? '' : 's'}. ` +
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

  return (
    <>
      <ModuleHeader
        title="Market data"
        description="Load the market data every calculation reads - rates, curves and macro drivers - from one file."
        about={`Loaded by Group and used by every affiliate. Data older than ${slaDays} days is flagged as stale.`}
        asOfDate={asOfBadges.length > 0 ? asOfBadges.sort().at(-1)! : null}
        scope="Group"
        metrics={[
          {
            label: 'FX rates',
            value: fxLoading ? '…' : String(fxRates.length),
            tone: fxRates.length === 0 ? 'warning' : 'neutral',
            about:
              'Exchange-rate rows on file. Conversions go through USD; a currency missing a rate fails any run that touches it.',
          },
          {
            label: 'Curves',
            value: `${curveCurrencies.length} ccy · ${curves.length} version${curves.length === 1 ? '' : 's'}`,
            tone: curves.length === 0 ? 'warning' : 'neutral',
            about:
              'Currencies with a curve defined, and dated curve versions on file. FTP base rates and shock scenarios read these.',
          },
          {
            label: 'Indicator series',
            value: String(indicators.length),
            tone: indicators.length === 0 ? 'warning' : 'neutral',
            about:
              'Macro series on file (policy rates, inflation, oil price...) driving behavioural assumptions and scenarios.',
          },
        ]}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {status.map((k) => (
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
                label="Last updated"
                value={
                  k.lastUpdatedAt
                    ? `${formatDate(k.lastUpdatedAt.slice(0, 10))}${k.lastUpdatedBy ? ` by ${k.lastUpdatedBy}` : ''}`
                    : '-'
                }
              />
              <Line2 label="Covers" value={k.coverage} />
              {k.kind !== 'Indicators' && k.ageDays !== null && (
                <Line2 label="Age" value={`${k.ageDays} day${k.ageDays === 1 ? '' : 's'} (limit ${slaDays})`} />
              )}
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-1 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
          One upload, every market dataset
          <InfoButton label="How one import fills all three">
            Each row (or workbook sheet) is recognised by its columns or its dataType: an FX rate row carries
            base/quote/rate; a curve row carries currency, curveCode, tenorDays and ratePercent; an indicator row
            carries indicatorCode, asOfDate and value. Rows that fit none of them are listed as errors and skipped; the
            rest are saved straight to the domain each belongs to, and the load is recorded per domain in Data →
            History.
          </InfoButton>
        </h2>
        <p className="mb-4 text-[13px] leading-relaxed text-gray-500">
          One file per load date. FX rates, yield curves and policy/macro series can sit on separate sheets of the same
          Excel workbook - they are read together and each lands on its own page below.
        </p>

        {canUpload ? (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="market-hub-asof" className="mb-1 block text-[12px] text-gray-600">
                As of date (fallback)
              </label>
              <input
                id="market-hub-asof"
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
              />
            </div>
            <div>
              <label htmlFor="market-hub-upload" className="mb-1 block text-[12px] text-gray-600">
                Market data file (CSV, Excel, JSON or XML)
              </label>
              <input
                ref={inputRef}
                id="market-hub-upload"
                type="file"
                accept={UPLOAD_ACCEPT}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
                className="text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-[13px] file:font-bold file:text-white hover:file:bg-navy-700"
              />
            </div>
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

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <HubCard
          title="Currency & FX rates"
          href="/data/market/fx"
          linkLabel="Open currencies & FX rates"
          badge={
            missing.length === 0
              ? { status: 'Complete', tone: 'success' }
              : { status: `${missing.length} missing`, tone: 'danger' }
          }
          detail={
            <>
              <Line2 label="Rows on file" value={String(fxRates.length)} />
              <Line2 label="Latest rate date" value={lastFx ? formatDate(lastFx) : 'Never'} />
              {missing.length > 0 && (
                <p className="mt-2 text-[12px] text-danger">No rate yet for: {missing.join(', ')}.</p>
              )}
            </>
          }
        />
        <HubCard
          title="Interest rates & yield curves"
          href="/data/market/curves"
          linkLabel="Open curves"
          badge={curves.length === 0 ? { status: 'None yet', tone: 'neutral' } : null}
          detail={
            <>
              <Line2
                label="Currencies covered"
                value={curveCurrencies.length > 0 ? curveCurrencies.join(', ') : 'None yet'}
              />
              <Line2 label="Latest curve date" value={lastCurve ? formatDate(lastCurve) : 'Never'} />
              {curvesByCurrency.slice(0, 4).map(([ccy, s]) => (
                <p key={ccy} className="text-[12px] text-gray-500">
                  <span className="font-mono font-bold text-navy-900">{ccy}</span> · {s.versions} version
                  {s.versions === 1 ? '' : 's'} · latest {formatDate(s.latest)}
                </p>
              ))}
            </>
          }
        />
        <HubCard
          title="Economic indicators"
          href="/data/market/indicators"
          linkLabel="Open economic indicators"
          badge={indicators.length === 0 ? { status: 'None yet', tone: 'neutral' } : null}
          detail={
            <>
              <Line2 label="Series" value={String(indicators.length)} />
              <Line2 label="Latest observation" value={lastIndicator ? formatDate(lastIndicator) : 'Never'} />
              {seriesPreview.map((s) => (
                <p key={s.code} className="text-[12px] text-gray-500">
                  <span className="font-bold text-navy-900">{s.name}</span>
                  {s.latest && (
                    <>
                      {' '}
                      · latest {s.latest.value}
                      {s.unit ? ` ${s.unit}` : ''} ({formatDate(s.latest.asOfDate)})
                    </>
                  )}
                </p>
              ))}
            </>
          }
        />
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-gray-500">
        Holiday calendars sit on{' '}
        <Link href="/data/market/calendars" className="font-bold text-navy-700 hover:underline">
          their own tab
        </Link>{' '}
        - each affiliate is assigned one on its Profile settings.
      </p>
    </>
  );
}

function HubCard({
  title,
  href,
  linkLabel,
  badge,
  detail,
}: {
  title: string;
  href: string;
  linkLabel: string;
  badge: { status: string; tone: 'success' | 'danger' | 'neutral' } | null;
  detail: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-[13px] font-bold text-navy-900">
        {title}
        {badge && <StatusBadge status={badge.status} tone={badge.tone} />}
      </h3>
      <div className="mt-3 space-y-1">{detail}</div>
      <Link href={href} className="mt-4 inline-block text-[12px] font-bold text-navy-700 hover:underline">
        {linkLabel} →
      </Link>
    </section>
  );
}

function Line2({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[12px] text-gray-500">
      <span className="text-gray-400">{label}</span> <span className="font-bold text-navy-900">{value}</span>
    </p>
  );
}
