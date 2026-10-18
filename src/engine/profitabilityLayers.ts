// Multi-layer (fully-loaded) profitability: client margin → FTP → operating expense → expected credit loss →
// capital charge, computed per position in the reporting currency and rolled up Group → affiliate → business
// unit → product → position, with a parallel by-customer view. Every amount is annualised: balances are the
// as-of snapshot, rates are annual, and cost pools are annual budgets.

import type { CurrencyCode, PerformingStatus, Position } from './types';
import { convert, type FxTable } from './fx';
import type { TransferRateLine } from './ftp';

// ─────────────────────────────────────────────────────────────────────────
// Configuration (shaped to become rule kinds later)
// ─────────────────────────────────────────────────────────────────────────

export type CostDriver = 'Balance' | 'AccountCount' | 'Headcount' | 'Fixed';

export interface CostPoolTargets {
  /** Only positions in these org units carry the pool. Absent or empty = all. */
  orgUnitCodes?: string[];
  /** Only positions with these product codes carry the pool. Absent or empty = all. */
  productCodes?: string[];
}

export interface CostPool {
  id: string;
  name: string;
  /** Annual cost, already in the reporting currency. */
  amount: number;
  driver: CostDriver;
  targets?: CostPoolTargets;
  /** Fixed driver: percentage of the pool per key (org unit or product code, per `fixedShareKey`). */
  fixedShares?: Record<string, number>;
  /** Which dimension `fixedShares` is keyed on. Default 'orgUnitCode'. */
  fixedShareKey?: 'orgUnitCode' | 'productCode';
}

export interface CostAllocationRule {
  pools: CostPool[];
}

export type CreditLossMethod = 'ProvisionChange' | 'PdLgd';

export interface CreditLossConfig {
  method: CreditLossMethod;
  /** PdLgd: 12-month probability of default by product code, in percent. */
  pdByProduct?: Record<string, number>;
  /** PdLgd: loss given default by product code, in percent. */
  lgdByProduct?: Record<string, number>;
  /** PdLgd: used for a product with no entry in `pdByProduct`. Absent = no ECL for that product (reported as missing). */
  defaultPdPct?: number;
  /** PdLgd: used for a product with no entry in `lgdByProduct`. */
  defaultLgdPct?: number;
  /**
   * ProvisionChange: with no prior provisions supplied, the provision stock on the position is taken as the
   * annual charge. PdLgd: non-performing positions that carry a provision use it instead of PD × LGD.
   */
  useProvisionAmount: boolean;
  /** ProvisionChange: provision held at the prior period end, by position id, in the position's own currency. */
  priorProvisionByPositionId?: Record<string, number>;
}

export interface CapitalConfig {
  /** Risk weight in percent, keyed by Position.commonCoaCode (checked first) or Position.productClass. */
  riskWeightByProductClass: Record<string, number>;
  defaultRiskWeightPct: number;
  /** Capital held per unit of RWA, in percent (e.g. 12.5). */
  capitalRatioPct: number;
  /** Annual hurdle return on that capital, in percent. */
  costOfCapitalPct: number;
  /** Applied to the risk-adjusted return before dividing by capital in RAROC. Absent = pre-tax RAROC. */
  taxRatePct?: number;
}

export interface ProfitabilityLayersInput {
  positions: Position[];
  /** Transfer-rate lines from computeFtp, matched to positions on positionId. */
  ftpLines: TransferRateLine[];
  fx: FxTable;
  reportingCurrency: CurrencyCode;
  asOfDate: string;
  horizon: 'Annualised';
  costRules: CostAllocationRule;
  creditLoss: CreditLossConfig;
  capital: CapitalConfig;
  /** Headcount by org unit - required by any 'Headcount' pool. */
  headcountByOrgUnit?: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────

export type UnpricedReason = 'NoTransferRate' | 'NoClientRate';

/** One position, every layer annualised and in the reporting currency. Costs are negative, income positive. */
export interface ProfitabilityLine {
  positionId: string;
  affiliateCode: string;
  orgUnitCode: string;
  productCode: string;
  productClass: string;
  counterpartyId: string | null;
  category: 'Asset' | 'Liability';
  currency: CurrencyCode;
  /** Balance in the reporting currency. */
  balance: number;
  clientRatePercent: number | null;
  transferRatePercent: number | null;
  /** Client interest: + income on assets, − expense on liabilities. Null when the position has no rate. */
  clientNetInterest: number | null;
  /** − charge on assets, + credit on liabilities. Null when the position has no transfer rate - never zero. */
  ftp: number | null;
  /** clientNetInterest + ftp; null unless both are known. */
  netInterestAfterFtp: number | null;
  /** True when both the client rate and the transfer rate are known. */
  priced: boolean;
  unpricedReasons: UnpricedReason[];
  /** Allocated operating expense, as a negative. */
  opex: number;
  opexByPool: Record<string, number>;
  /** Expected credit loss charge, as a negative (a release is positive). Null when no PD/provision basis exists. */
  ecl: number | null;
  riskWeightPct: number;
  rwa: number;
  allocatedCapital: number;
  /** Capital charge, as a negative. */
  capitalCharge: number;
  /** netInterestAfterFtp + opex + ecl + capitalCharge; null when any of its inputs is null. */
  riskAdjustedProfit: number | null;
  /** (netInterestAfterFtp + opex + ecl) × (1 − tax) / allocatedCapital, in percent. */
  rarocPercent: number | null;
}

export interface LayerTotals {
  assetBalance: number;
  liabilityBalance: number;
  /** Client net interest of priced positions only - an unpriced asset's income without its funding cost would overstate profit. */
  clientNetInterest: number;
  /** Null when the node holds no priced position. */
  ftp: number | null;
  netInterestAfterFtp: number;
  opex: number;
  ecl: number;
  rwa: number;
  allocatedCapital: number;
  capitalCharge: number;
  riskAdjustedProfit: number;
  rarocPercent: number | null;
  /** Positions left out of the margin layers, with their balance and the client interest that was excluded. */
  unpricedCount: number;
  unpricedBalance: number;
  unpricedClientNetInterest: number;
  /** Positions whose ECL could not be computed (no PD/LGD or provision basis). */
  eclMissingCount: number;
}

export type ProfitabilityNodeLevel = 'Group' | 'Affiliate' | 'BusinessUnit' | 'Product' | 'Customers' | 'Customer';

export interface ProfitabilityNode extends LayerTotals {
  id: string;
  level: ProfitabilityNodeLevel;
  key: string;
  parentId: string | null;
  /** Drill-down: child node ids, or empty at the product/customer level where `positionIds` is the next step. */
  childIds: string[];
  positionIds: string[];
  /** Node risk-adjusted profit ÷ the root's (null when the root is zero). */
  shareOfRiskAdjustedProfit: number | null;
  /** Node asset balance ÷ the root's (null when the root holds no assets). */
  shareOfAssets: number | null;
}

export interface CostPoolReconciliation {
  poolId: string;
  name: string;
  driver: CostDriver;
  amount: number;
  allocated: number;
  /** amount − allocated: what could not be attributed (no eligible positions, missing headcount, shares ≠ 100%). */
  residual: number;
  note: string | null;
}

export interface WaterfallStep {
  label: string;
  value: number | null;
  /** Running total after this step; the last step is the total itself. */
  cumulative: number;
  isTotal: boolean;
}

export interface ProfitabilityLayersResult {
  currency: CurrencyCode;
  asOfDate: string;
  horizon: 'Annualised';
  lines: ProfitabilityLine[];
  /** Every node of both views, keyed by id. */
  nodes: Record<string, ProfitabilityNode>;
  /** Group → affiliate → business unit → product → position. */
  rootId: string;
  /** All customers → customer → position. */
  customerRootId: string;
  costPools: CostPoolReconciliation[];
  totalOpexPool: number;
  totalOpexAllocated: number;
  totalOpexResidual: number;
  /** Positions left out entirely (capital and off-balance-sheet). */
  excludedPositionIds: string[];
  notes: string[];
  methodology: string;
}

export const GROUP_NODE_ID = 'GROUP';
export const CUSTOMERS_NODE_ID = 'CUSTOMERS';
export const NO_COUNTERPARTY = 'No counterparty';

const NON_PERFORMING = new Set<PerformingStatus>(['Substandard', 'Doubtful', 'Loss']);

// ─────────────────────────────────────────────────────────────────────────
// Operating expense allocation
// ─────────────────────────────────────────────────────────────────────────

function matchesTargets(p: Position, targets: CostPoolTargets | undefined): boolean {
  if (!targets) return true;
  if (targets.orgUnitCodes?.length && !targets.orgUnitCodes.includes(p.orgUnitCode)) return false;
  if (targets.productCodes?.length && !targets.productCodes.includes(p.productCode)) return false;
  return true;
}

/** Spread `amount` over positions in proportion to weight; returns what was placed. */
function spread(amount: number, weights: Array<{ id: string; weight: number }>, into: Map<string, number>): number {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  if (total <= 0 || amount === 0) return 0;
  for (const w of weights) into.set(w.id, (into.get(w.id) ?? 0) + (amount * w.weight) / total);
  return amount;
}

/** Allocates one pool to positions. Returns the per-position cost (positive) and a note when some was left over. */
export function allocateCostPool(
  pool: CostPool,
  positions: Position[],
  balanceOf: (p: Position) => number,
  headcountByOrgUnit?: Record<string, number>,
): { byPosition: Map<string, number>; allocated: number; note: string | null } {
  const byPosition = new Map<string, number>();
  const eligible = positions.filter((p) => matchesTargets(p, pool.targets));
  if (eligible.length === 0) {
    return { byPosition, allocated: 0, note: 'No position matches the pool targets - the whole pool is unallocated.' };
  }
  const byBalance = (ps: Position[]) => ps.map((p) => ({ id: p.id, weight: Math.abs(balanceOf(p)) }));
  const groupBy = (key: (p: Position) => string) => {
    const groups = new Map<string, Position[]>();
    for (const p of eligible) (groups.get(key(p)) ?? groups.set(key(p), []).get(key(p))!).push(p);
    return groups;
  };

  switch (pool.driver) {
    case 'Balance': {
      const allocated = spread(pool.amount, byBalance(eligible), byPosition);
      return { byPosition, allocated, note: allocated === 0 ? 'Eligible positions carry no balance.' : null };
    }
    case 'AccountCount': {
      const allocated = spread(
        pool.amount,
        eligible.map((p) => ({ id: p.id, weight: 1 })),
        byPosition,
      );
      return { byPosition, allocated, note: null };
    }
    case 'Headcount': {
      if (!headcountByOrgUnit) {
        return { byPosition, allocated: 0, note: 'Headcount driver with no headcount supplied - pool unallocated.' };
      }
      const groups = groupBy((p) => p.orgUnitCode);
      const totalHeads = Array.from(groups.keys()).reduce((s, ou) => s + Math.max(0, headcountByOrgUnit[ou] ?? 0), 0);
      if (totalHeads <= 0) {
        return {
          byPosition,
          allocated: 0,
          note: 'No headcount recorded for any eligible org unit - pool unallocated.',
        };
      }
      let allocated = 0;
      for (const [ou, ps] of groups) {
        const heads = Math.max(0, headcountByOrgUnit[ou] ?? 0);
        if (heads === 0) continue;
        const share = (pool.amount * heads) / totalHeads;
        // Within an org unit the cost follows balance; an org unit of zero-balance positions splits evenly.
        const placed = spread(share, byBalance(ps), byPosition);
        allocated +=
          placed ||
          spread(
            share,
            ps.map((p) => ({ id: p.id, weight: 1 })),
            byPosition,
          );
      }
      return { byPosition, allocated, note: null };
    }
    case 'Fixed': {
      const shares = pool.fixedShares ?? {};
      const keyOf =
        pool.fixedShareKey === 'productCode' ? (p: Position) => p.productCode : (p: Position) => p.orgUnitCode;
      const groups = groupBy(keyOf);
      let allocated = 0;
      const orphanKeys: string[] = [];
      for (const [key, pct] of Object.entries(shares)) {
        const ps = groups.get(key);
        if (!ps || pct === 0) {
          if (pct !== 0) orphanKeys.push(key);
          continue;
        }
        const share = (pool.amount * pct) / 100;
        const placed = spread(share, byBalance(ps), byPosition);
        allocated +=
          placed ||
          spread(
            share,
            ps.map((p) => ({ id: p.id, weight: 1 })),
            byPosition,
          );
      }
      const sumPct = Object.values(shares).reduce((s, v) => s + v, 0);
      const notes: string[] = [];
      if (Math.abs(sumPct - 100) > 1e-9) notes.push(`Fixed shares sum to ${sumPct}%, not 100%.`);
      if (orphanKeys.length) notes.push(`No eligible positions for: ${orphanKeys.join(', ')}.`);
      return { byPosition, allocated, note: notes.length ? notes.join(' ') : null };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Expected credit loss
// ─────────────────────────────────────────────────────────────────────────

/** Annual ECL charge in the position currency, positive = charge. Null when there is no basis to compute it. */
function eclChargeLocal(p: Position, cfg: CreditLossConfig): number | null {
  if (p.category !== 'Asset') return 0;
  if (cfg.method === 'ProvisionChange') {
    const prior = cfg.priorProvisionByPositionId;
    const current = p.provisionAmount ?? 0;
    if (prior) return current - (prior[p.id] ?? 0);
    return cfg.useProvisionAmount ? current : null;
  }
  if (cfg.useProvisionAmount && NON_PERFORMING.has(p.performingStatus) && p.provisionAmount !== null) {
    return p.provisionAmount;
  }
  const pd = cfg.pdByProduct?.[p.productCode] ?? cfg.defaultPdPct;
  const lgd = cfg.lgdByProduct?.[p.productCode] ?? cfg.defaultLgdPct;
  if (pd === undefined || lgd === undefined) return null;
  return p.amount * (pd / 100) * (lgd / 100);
}

// ─────────────────────────────────────────────────────────────────────────
// Aggregation
// ─────────────────────────────────────────────────────────────────────────

function emptyTotals(): LayerTotals {
  return {
    assetBalance: 0,
    liabilityBalance: 0,
    clientNetInterest: 0,
    ftp: null,
    netInterestAfterFtp: 0,
    opex: 0,
    ecl: 0,
    rwa: 0,
    allocatedCapital: 0,
    capitalCharge: 0,
    riskAdjustedProfit: 0,
    rarocPercent: null,
    unpricedCount: 0,
    unpricedBalance: 0,
    unpricedClientNetInterest: 0,
    eclMissingCount: 0,
  };
}

function addLine(t: LayerTotals, l: ProfitabilityLine): void {
  if (l.category === 'Asset') t.assetBalance += l.balance;
  else t.liabilityBalance += l.balance;
  if (l.priced) {
    t.clientNetInterest += l.clientNetInterest!;
    t.ftp = (t.ftp ?? 0) + l.ftp!;
  } else {
    t.unpricedCount += 1;
    t.unpricedBalance += l.balance;
    t.unpricedClientNetInterest += l.clientNetInterest ?? 0;
  }
  t.opex += l.opex;
  if (l.ecl === null) t.eclMissingCount += 1;
  else t.ecl += l.ecl;
  t.rwa += l.rwa;
  t.allocatedCapital += l.allocatedCapital;
  t.capitalCharge += l.capitalCharge;
}

function finalise(t: LayerTotals, taxRatePct: number): void {
  t.netInterestAfterFtp = t.clientNetInterest + (t.ftp ?? 0);
  t.riskAdjustedProfit = t.netInterestAfterFtp + t.opex + t.ecl + t.capitalCharge;
  t.rarocPercent = rarocOf(t.netInterestAfterFtp + t.opex + t.ecl, t.allocatedCapital, taxRatePct);
}

function rarocOf(returnBeforeCapital: number, capital: number, taxRatePct: number): number | null {
  if (capital <= 0) return null;
  return ((returnBeforeCapital * (1 - taxRatePct / 100)) / capital) * 100;
}

/** Ordered profit waterfall for one node, from client margin down to risk-adjusted profit. */
export function layersFor(node: LayerTotals): WaterfallStep[] {
  const steps: Array<[string, number | null]> = [
    ['Net interest income (client rates)', node.clientNetInterest],
    ['Funding cost / credit (FTP)', node.ftp],
    ['Operating expenses', node.opex],
    ['Expected credit loss', node.ecl],
    ['Capital charge', node.capitalCharge],
  ];
  let running = 0;
  const out: WaterfallStep[] = steps.map(([label, value]) => {
    running += value ?? 0;
    return { label, value, cumulative: running, isTotal: false };
  });
  out.push({
    label: 'Risk-adjusted profit',
    value: node.riskAdjustedProfit,
    cumulative: node.riskAdjustedProfit,
    isTotal: true,
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────

export function computeProfitability(input: ProfitabilityLayersInput): ProfitabilityLayersResult {
  const { fx, reportingCurrency, capital, creditLoss } = input;
  const toReporting = (amount: number, currency: CurrencyCode) => convert(amount, currency, reportingCurrency, fx);
  const taxRatePct = capital.taxRatePct ?? 0;

  const inScope = input.positions.filter((p) => p.category !== 'Capital' && !p.isOffBalanceSheet);
  const excludedPositionIds = input.positions
    .filter((p) => p.category === 'Capital' || p.isOffBalanceSheet)
    .map((p) => p.id);

  // Converted once - every layer below works off the reporting-currency balance, so no two currencies are ever summed.
  const balance = new Map<string, number>(inScope.map((p) => [p.id, toReporting(p.amount, p.currency)]));
  const balanceOf = (p: Position) => balance.get(p.id) ?? 0;
  const ftpById = new Map(input.ftpLines.map((l) => [l.positionId, l]));

  // Opex pools
  const opexByPosition = new Map<string, Record<string, number>>();
  const costPools: CostPoolReconciliation[] = input.costRules.pools.map((pool) => {
    const { byPosition, allocated, note } = allocateCostPool(pool, inScope, balanceOf, input.headcountByOrgUnit);
    for (const [id, cost] of byPosition) {
      const entry = opexByPosition.get(id) ?? {};
      entry[pool.id] = (entry[pool.id] ?? 0) - cost;
      opexByPosition.set(id, entry);
    }
    return {
      poolId: pool.id,
      name: pool.name,
      driver: pool.driver,
      amount: pool.amount,
      allocated,
      residual: pool.amount - allocated,
      note,
    };
  });

  const lines: ProfitabilityLine[] = inScope.map((p) => {
    const bal = balanceOf(p);
    const isAsset = p.category === 'Asset';
    const ftpLine = ftpById.get(p.id) ?? null;
    const transferRatePercent = ftpLine?.allInTransferRatePercent ?? null;
    const clientRatePercent = p.interestRatePct;

    const clientNetInterest = clientRatePercent === null ? null : ((isAsset ? 1 : -1) * bal * clientRatePercent) / 100;
    const ftp = transferRatePercent === null ? null : ((isAsset ? -1 : 1) * bal * transferRatePercent) / 100;
    const unpricedReasons: UnpricedReason[] = [];
    if (transferRatePercent === null) unpricedReasons.push('NoTransferRate');
    if (clientRatePercent === null) unpricedReasons.push('NoClientRate');
    const priced = unpricedReasons.length === 0;
    const netInterestAfterFtp = priced ? clientNetInterest! + ftp! : null;

    const opexByPool = opexByPosition.get(p.id) ?? {};
    const opex = Object.values(opexByPool).reduce((s, v) => s + v, 0);

    const eclLocal = eclChargeLocal(p, creditLoss);
    const ecl = eclLocal === null ? null : eclLocal === 0 ? 0 : -toReporting(eclLocal, p.currency);

    const riskWeightPct = isAsset
      ? (capital.riskWeightByProductClass[p.commonCoaCode] ??
        capital.riskWeightByProductClass[p.productClass] ??
        capital.defaultRiskWeightPct)
      : 0;
    const rwa = (bal * riskWeightPct) / 100;
    const allocatedCapital = (rwa * capital.capitalRatioPct) / 100;
    const capitalCharge = -(allocatedCapital * capital.costOfCapitalPct) / 100;

    const beforeCapital = netInterestAfterFtp === null || ecl === null ? null : netInterestAfterFtp + opex + ecl;

    return {
      positionId: p.id,
      affiliateCode: p.affiliateCode,
      orgUnitCode: p.orgUnitCode,
      productCode: p.productCode,
      productClass: p.productClass,
      counterpartyId: p.counterpartyId,
      category: isAsset ? 'Asset' : 'Liability',
      currency: p.currency,
      balance: bal,
      clientRatePercent,
      transferRatePercent,
      clientNetInterest,
      ftp,
      netInterestAfterFtp,
      priced,
      unpricedReasons,
      opex,
      opexByPool,
      ecl,
      riskWeightPct,
      rwa,
      allocatedCapital,
      capitalCharge,
      riskAdjustedProfit: beforeCapital === null ? null : beforeCapital + capitalCharge,
      rarocPercent: beforeCapital === null ? null : rarocOf(beforeCapital, allocatedCapital, taxRatePct),
    };
  });

  // Tree
  const nodes: Record<string, ProfitabilityNode> = {};
  const ensure = (id: string, level: ProfitabilityNodeLevel, key: string, parentId: string | null) => {
    let node = nodes[id];
    if (!node) {
      node = {
        id,
        level,
        key,
        parentId,
        childIds: [],
        positionIds: [],
        shareOfRiskAdjustedProfit: null,
        shareOfAssets: null,
        ...emptyTotals(),
      };
      nodes[id] = node;
      if (parentId) nodes[parentId]!.childIds.push(id);
    }
    return node;
  };

  ensure(GROUP_NODE_ID, 'Group', 'Group', null);
  ensure(CUSTOMERS_NODE_ID, 'Customers', 'All customers', null);
  for (const line of lines) {
    const aff = `AFF:${line.affiliateCode}`;
    const bu = `BU:${line.affiliateCode}|${line.orgUnitCode}`;
    const prd = `PRD:${line.affiliateCode}|${line.orgUnitCode}|${line.productCode}`;
    const customerKey = line.counterpartyId ?? NO_COUNTERPARTY;
    const cust = `CUST:${customerKey}`;
    const path = [
      nodes[GROUP_NODE_ID]!,
      ensure(aff, 'Affiliate', line.affiliateCode, GROUP_NODE_ID),
      ensure(bu, 'BusinessUnit', line.orgUnitCode, aff),
      ensure(prd, 'Product', line.productCode, bu),
      nodes[CUSTOMERS_NODE_ID]!,
      ensure(cust, 'Customer', customerKey, CUSTOMERS_NODE_ID),
    ];
    for (const node of path) {
      addLine(node, line);
      node.positionIds.push(line.positionId);
    }
  }

  for (const node of Object.values(nodes)) finalise(node, taxRatePct);
  for (const node of Object.values(nodes)) {
    const root = nodes[node.level === 'Customers' || node.level === 'Customer' ? CUSTOMERS_NODE_ID : GROUP_NODE_ID]!;
    node.shareOfRiskAdjustedProfit =
      root.riskAdjustedProfit !== 0 ? node.riskAdjustedProfit / root.riskAdjustedProfit : null;
    node.shareOfAssets = root.assetBalance > 0 ? node.assetBalance / root.assetBalance : null;
  }
  for (const node of Object.values(nodes)) {
    node.childIds.sort((a, b) => nodes[b]!.riskAdjustedProfit - nodes[a]!.riskAdjustedProfit);
  }

  const totalOpexPool = costPools.reduce((s, c) => s + c.amount, 0);
  const totalOpexAllocated = costPools.reduce((s, c) => s + c.allocated, 0);
  const group = nodes[GROUP_NODE_ID]!;

  const notes: string[] = [];
  if (group.unpricedCount > 0) {
    notes.push(
      `${group.unpricedCount} position(s) have no transfer rate or no client rate; their margin layers are reported as ` +
        'unpriced and left out of client interest and FTP totals rather than counted as zero.',
    );
  }
  if (group.eclMissingCount > 0) {
    notes.push(
      `${group.eclMissingCount} asset position(s) have no PD/LGD or provision basis; their ECL is null and excluded.`,
    );
  }
  for (const c of costPools) {
    if (Math.abs(c.residual) > 1e-6)
      notes.push(`Cost pool "${c.name}" left ${c.residual} unallocated. ${c.note ?? ''}`.trim());
  }
  if (excludedPositionIds.length) {
    notes.push(
      `${excludedPositionIds.length} capital or off-balance-sheet position(s) are outside the profitability scope.`,
    );
  }

  return {
    currency: reportingCurrency,
    asOfDate: input.asOfDate,
    horizon: input.horizon,
    lines,
    nodes,
    rootId: GROUP_NODE_ID,
    customerRootId: CUSTOMERS_NODE_ID,
    costPools,
    totalOpexPool,
    totalOpexAllocated,
    totalOpexResidual: totalOpexPool - totalOpexAllocated,
    excludedPositionIds,
    notes,
    methodology: PROFITABILITY_LAYERS_METHODOLOGY,
  };
}

export const PROFITABILITY_LAYERS_METHODOLOGY =
  'Fully-loaded profitability, annualised on the as-of balance sheet and expressed in the reporting currency. ' +
  "Each position's balance is converted once through the run's FX table before any layer is computed, so no two " +
  'currencies are ever summed. Capital and off-balance-sheet positions are outside scope. ' +
  "(1) Client net interest: balance × the position's own interest rate - income on assets, expense on liabilities. " +
  'ASSUMPTION: the as-of balance and rate are held flat for a year; no amortisation, repricing or day-count. ' +
  '(2) Funding cost / credit (FTP): balance × the all-in transfer rate from the transfer-pricing run - assets are ' +
  'charged it, liabilities credited it, so client interest plus FTP equals the FTP margin. A position with no ' +
  'transfer rate or no client rate is flagged unpriced: its FTP layer is null, not zero, and its client interest is ' +
  'excluded from the margin totals (disclosed separately) so an unfunded asset never overstates profit. ' +
  '(3) Operating expenses: annual cost pools, entered in the reporting currency, allocated to positions by driver - ' +
  'Balance (pro rata to absolute reporting-currency balance), AccountCount (equal per position: ASSUMPTION each ' +
  'ledger position is one account), Headcount (pro rata to org-unit headcount, then by balance within the unit) or ' +
  'Fixed (set percentages per org unit or product, then by balance). A pool can be restricted to org units or ' +
  'products. Whatever cannot be attributed is reported as a residual so allocated + residual always equals the pool. ' +
  '(4) Expected credit loss, assets only: ProvisionChange takes current provision less prior-period provision; with ' +
  'no prior provisions supplied the provision stock is taken as the annual charge (ASSUMPTION). PdLgd takes balance ' +
  '× 12-month PD × LGD by product (ASSUMPTION: configured PD/LGD, no forward-looking overlay or staging); ' +
  'non-performing positions may use their booked provision instead. A position with no basis is null, not zero. ' +
  '(5) Capital charge: RWA = asset balance × risk weight by Common COA code, else product class (ASSUMPTION: simplified standardised ' +
  'weights, no counterparty, collateral, CCF or operational/market-risk capital); allocated capital = RWA × capital ' +
  'ratio; charge = capital × cost of capital. Liabilities attract no capital. ' +
  '(6) Risk-adjusted profit = (1) + (2) + (3) + (4) + (5). RAROC = (net interest after FTP + opex + ECL) × ' +
  '(1 − tax rate) ÷ allocated capital; with no tax rate set, RAROC above the cost of capital coincides with positive ' +
  'risk-adjusted profit. Results roll up position → product → business unit → affiliate → Group, with a parallel ' +
  "by-customer view keyed on counterparty ('No counterparty' where none is held); every node equals the sum of its " +
  'children for every layer.';
