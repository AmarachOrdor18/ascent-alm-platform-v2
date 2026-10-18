// What happens after market data arrives (teardown §16): nobody should discover it by accident. Every load -
// from the Group Market data source or the Market data screen - writes an audit record naming the
// affiliates whose readiness it affects, and notifies those affiliates' users (and Group). Readiness itself
// recalculates on its own because it is derived from the rates and curves the load just changed.
import { repository } from '@/store/repositoryInstance';
import { sendNotification } from './notify';
import type { Affiliate, StoredFxRate } from '@/engine/types';
import type { CurvePointRow, IndicatorSeriesRow } from './csvImport';

export interface MarketDataLoad {
  fileName: string;
  asOfDate: string;
  fx: Pick<StoredFxRate, 'base' | 'quote'>[];
  curves: Pick<CurvePointRow, 'currency' | 'curveCode'>[];
  indicators: Pick<IndicatorSeriesRow, 'indicatorCode' | 'countryCode'>[];
}

export interface MarketDataActor {
  id: string;
  name: string;
  role: string;
}

/** Affiliates using any of these currencies (functional or active). */
export function affectedAffiliates(currencies: string[], affiliates: Affiliate[]): Affiliate[] {
  const set = new Set(currencies.map((c) => c.toUpperCase()));
  return affiliates.filter(
    (a) => a.code !== 'GROUP' && [a.functionalCurrency, ...a.activeCurrencies].some((c) => set.has(c.toUpperCase())),
  );
}

function summary(load: MarketDataLoad) {
  const pairs = new Set(load.fx.map((r) => `${r.base}/${r.quote}`)).size;
  const curves = Array.from(new Set(load.curves.map((c) => `${c.currency} ${c.curveCode}`)));
  const series = new Set(load.indicators.map((i) => `${i.indicatorCode}|${i.countryCode ?? ''}`)).size;
  const parts = [
    pairs > 0 && `${pairs} FX pair${pairs === 1 ? '' : 's'}`,
    curves.length > 0 &&
      `${curves.length} curve${curves.length === 1 ? '' : 's'} (${curves.slice(0, 4).join(', ')}${curves.length > 4 ? '…' : ''})`,
    series > 0 && `${series} indicator series`,
  ].filter((x): x is string => !!x);
  return { pairs, curves, series, text: parts.join(', ') || 'no rows' };
}

/** Audit + notify after a market-data load. Never throws - the load itself has already succeeded. */
export async function afterMarketDataLoad(
  load: MarketDataLoad,
  actor: MarketDataActor | null,
): Promise<{ affected: Affiliate[] }> {
  try {
    const affiliates = await repository.listAffiliates();
    const currencies = [...load.fx.flatMap((r) => [r.base, r.quote]), ...load.curves.map((c) => c.currency)];
    const affected = affectedAffiliates(currencies, affiliates);
    const s = summary(load);
    const names = affected.map((a) => a.name).join(', ') || 'none yet';
    if (actor) {
      await repository.recordAuditEvent({
        id: `AE-MKT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        module: 'Market Data',
        action: 'Load',
        entity: 'Market data',
        entityId: load.fileName,
        userId: actor.id,
        userName: actor.name,
        role: actor.role as never,
        outcome: 'Success',
        detail: `${load.fileName}, as of ${load.asOfDate}: ${s.text}. Affiliates affected: ${names}.`,
        recordedAt: new Date().toISOString(),
      });
    }
    const title = `Market data updated for ${load.asOfDate}`;
    const body = `${s.text} loaded${actor ? ` by ${actor.name}` : ''}. Affiliates affected: ${names}.`;
    // Each affected affiliate's users, then Group-level users once.
    for (const a of affected) {
      await sendNotification(
        { affiliateCode: a.code, kind: 'marketData.loaded', title, body, link: '/data/market', groupUsers: false },
        actor,
      );
    }
    await sendNotification(
      { affiliateCode: 'GROUP', kind: 'marketData.loaded', title, body, link: '/data/market' },
      actor,
    );
    return { affected };
  } catch {
    return { affected: [] };
  }
}
