/**
 * Instrument-to-general-ledger reconciliation.
 *
 * Oracle (ALM UG §7.3) defines reconciliation as comparing instrument-table
 * balances against the management ledger at a chosen level — one dimension
 * (GL account) or several (GL account within organisational unit) — and
 * posting plug entries where the variance sits inside tolerance.
 *
 * This is what banks actually do at month-end, and it is the mechanism that
 * lets a file-fed affiliate be held to the same standard as an API-fed one.
 */

import type { CurrencyCode, IsoDate, Position } from './types';
import { convert, type FxTable } from './fx';

export interface LedgerBalance {
  glAccountCode: string;
  orgUnitCode: string | null;
  currency: CurrencyCode;
  endingBalance: number;
  asOfDate: IsoDate;
}

export type ReconciliationLevel = 'GlAccount' | 'GlAccountByOrgUnit';

export interface ReconciliationLine {
  key: string;
  glAccountCode: string;
  orgUnitCode: string | null;
  instrumentBalance: number;
  ledgerBalance: number;
  variance: number;
  variancePercent: number | null;
  withinTolerance: boolean;
  requiresPlug: boolean;
}

export interface PlugEntry {
  key: string;
  glAccountCode: string;
  orgUnitCode: string | null;
  amount: number;
  reason: string;
}

export interface ReconciliationResult {
  lines: ReconciliationLine[];
  totalInstrumentBalance: number;
  totalLedgerBalance: number;
  totalVariance: number;
  linesOutOfTolerance: number;
  suggestedPlugs: PlugEntry[];
  canSignOff: boolean;
  currency: CurrencyCode;
  methodology: string;
}

export interface ReconciliationContext {
  reportingCurrency: CurrencyCode;
  fx: FxTable;
  level: ReconciliationLevel;
  /** Absolute variance below this is immaterial and may be plugged. */
  toleranceAmount: number;
  /** Variance above this share of the ledger balance blocks sign-off regardless of amount. */
  tolerancePercent: number;
}

function keyFor(glAccountCode: string, orgUnitCode: string | null, level: ReconciliationLevel): string {
  return level === 'GlAccountByOrgUnit' ? `${glAccountCode}|${orgUnitCode ?? '—'}` : glAccountCode;
}

/**
 * Reconcile positions against ledger balances.
 *
 * A variance inside tolerance yields a suggested plug entry, which is a
 * *proposal* requiring maker-checker approval — never an automatic
 * adjustment. Anything outside tolerance blocks sign-off and goes back to
 * the affiliate, which is the point of the control.
 */
export function reconcile(
  positions: Position[],
  ledger: LedgerBalance[],
  ctx: ReconciliationContext,
): ReconciliationResult {
  const instrumentByKey = new Map<string, { gl: string; ou: string | null; amount: number }>();

  for (const p of positions) {
    if (p.isOffBalanceSheet) continue;
    const key = keyFor(p.glAccountCode, p.orgUnitCode, ctx.level);
    const slot = instrumentByKey.get(key) ?? {
      gl: p.glAccountCode,
      ou: ctx.level === 'GlAccountByOrgUnit' ? p.orgUnitCode : null,
      amount: 0,
    };
    slot.amount += convert(p.amount, p.currency, ctx.reportingCurrency, ctx.fx);
    instrumentByKey.set(key, slot);
  }

  const ledgerByKey = new Map<string, { gl: string; ou: string | null; amount: number }>();
  for (const l of ledger) {
    const key = keyFor(l.glAccountCode, l.orgUnitCode, ctx.level);
    const slot = ledgerByKey.get(key) ?? {
      gl: l.glAccountCode,
      ou: ctx.level === 'GlAccountByOrgUnit' ? l.orgUnitCode : null,
      amount: 0,
    };
    slot.amount += convert(l.endingBalance, l.currency, ctx.reportingCurrency, ctx.fx);
    ledgerByKey.set(key, slot);
  }

  // Union of both sides: an account present in one and absent from the other
  // is the most important thing reconciliation finds, so neither side alone
  // may drive the row set.
  const keys = new Set([...instrumentByKey.keys(), ...ledgerByKey.keys()]);
  const lines: ReconciliationLine[] = [];
  const suggestedPlugs: PlugEntry[] = [];

  for (const key of Array.from(keys).sort()) {
    const instrument = instrumentByKey.get(key);
    const ledgerSlot = ledgerByKey.get(key);
    const instrumentBalance = instrument?.amount ?? 0;
    const ledgerBalance = ledgerSlot?.amount ?? 0;
    const variance = instrumentBalance - ledgerBalance;

    const variancePercent = ledgerBalance !== 0 ? (variance / Math.abs(ledgerBalance)) * 100 : null;
    const withinAmount = Math.abs(variance) <= ctx.toleranceAmount;
    const withinPercent = variancePercent === null || Math.abs(variancePercent) <= ctx.tolerancePercent;
    const withinTolerance = withinAmount && withinPercent;

    const glAccountCode = instrument?.gl ?? ledgerSlot?.gl ?? key;
    const orgUnitCode = instrument?.ou ?? ledgerSlot?.ou ?? null;

    lines.push({
      key,
      glAccountCode,
      orgUnitCode,
      instrumentBalance,
      ledgerBalance,
      variance,
      variancePercent,
      withinTolerance,
      requiresPlug: withinTolerance && variance !== 0,
    });

    if (withinTolerance && variance !== 0) {
      suggestedPlugs.push({
        key,
        glAccountCode,
        orgUnitCode,
        amount: -variance,
        reason: `Immaterial variance of ${variance.toFixed(2)} between instrument data and general ledger`,
      });
    }
  }

  const linesOutOfTolerance = lines.filter((l) => !l.withinTolerance).length;

  return {
    lines,
    totalInstrumentBalance: lines.reduce((s, l) => s + l.instrumentBalance, 0),
    totalLedgerBalance: lines.reduce((s, l) => s + l.ledgerBalance, 0),
    totalVariance: lines.reduce((s, l) => s + l.variance, 0),
    linesOutOfTolerance,
    suggestedPlugs,
    canSignOff: linesOutOfTolerance === 0,
    currency: ctx.reportingCurrency,
    methodology:
      `Instrument balances compared against the general ledger at ${ctx.level === 'GlAccountByOrgUnit' ? 'GL account within organisational unit' : 'GL account'} level. ` +
      'Accounts present on only one side appear as full variances rather than being omitted. Variances inside ' +
      'tolerance produce a suggested plug entry, which requires maker-checker approval — nothing is adjusted ' +
      'automatically. Any line outside tolerance blocks sign-off for the period.',
  };
}
