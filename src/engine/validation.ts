import type { IsoDate, Position, Severity } from './types';

export type CheckType =
  | 'Completeness'
  | 'ReferentialIntegrity'
  | 'Range'
  | 'CrossField'
  | 'Duplicate'
  | 'BalanceSheetIntegrity'
  | 'FactorCoverage';

export interface ValidationRule {
  id: string;
  name: string;
  checkType: CheckType;
  severity: Severity;
  isActive: boolean;
  /** High and Critical findings block a commit; lower severities are advisory. */
  blocksCommit: boolean;
}

export interface ValidationException {
  /** Stable within one validatePositions() call - lets a specific finding be referenced, not just counted. */
  id: string;
  ruleId: string;
  ruleName: string;
  checkType: CheckType;
  severity: Severity;
  positionId: string | null;
  description: string;
  blocksCommit: boolean;
}

export interface ValidationResult {
  exceptions: ValidationException[];
  rowsChecked: number;
  rowsWithExceptions: number;
  blocked: boolean;
  methodology: string;
}

export const DEFAULT_VALIDATION_RULES: ValidationRule[] = [
  {
    id: 'V-001',
    name: 'Required fields present',
    checkType: 'Completeness',
    severity: 'High',
    isActive: true,
    blocksCommit: true,
  },
  {
    id: 'V-002',
    name: 'Affiliate exists',
    checkType: 'ReferentialIntegrity',
    severity: 'High',
    isActive: true,
    blocksCommit: true,
  },
  {
    id: 'V-003',
    name: 'Amount within plausible range',
    checkType: 'Range',
    severity: 'Medium',
    isActive: true,
    blocksCommit: false,
  },
  {
    id: 'V-004',
    name: 'Currency is a 3-letter code',
    checkType: 'CrossField',
    severity: 'Low',
    isActive: true,
    blocksCommit: false,
  },
  {
    id: 'V-005',
    name: 'Position IDs unique within batch',
    checkType: 'Duplicate',
    severity: 'High',
    isActive: true,
    blocksCommit: true,
  },
  {
    id: 'V-006',
    name: 'Balance sheet balances',
    checkType: 'BalanceSheetIntegrity',
    severity: 'Critical',
    isActive: true,
    blocksCommit: true,
  },
  {
    id: 'V-007',
    name: 'Basel factors present where required',
    checkType: 'FactorCoverage',
    severity: 'Medium',
    isActive: true,
    blocksCommit: false,
  },
  {
    id: 'V-008',
    name: 'Maturity date not before as-of date',
    checkType: 'CrossField',
    severity: 'Medium',
    isActive: true,
    blocksCommit: false,
  },
];

const MAX_PLAUSIBLE_AMOUNT = 1e15;

export interface ValidationContext {
  asOfDate: IsoDate;
  knownAffiliateCodes: string[];
  /** Tolerance for the balance-sheet identity, as a share of total assets. */
  balanceTolerancePercent?: number;
}

export function validatePositions(
  positions: Position[],
  ctx: ValidationContext,
  rules: ValidationRule[] = DEFAULT_VALIDATION_RULES,
  /**
   * What the balance-sheet identity (V-006) is checked against - defaults to `positions` itself, but a
   * caller staging one contributor's slice of a multi-contributor book (Loans, Deposits, Treasury each
   * submit independently - see PositionContributor) should pass the full assembled book instead, or every
   * single-contributor file will always look unbalanced on its own.
   */
  balancePositions: Position[] = positions,
): ValidationResult {
  const active = rules.filter((r) => r.isActive);
  const exceptions: ValidationException[] = [];
  const affected = new Set<string>();

  let sequence = 0;
  const raise = (rule: ValidationRule, positionId: string | null, description: string) => {
    sequence += 1;
    exceptions.push({
      id: `${rule.id}-${positionId ?? 'BATCH'}-${sequence}`,
      ruleId: rule.id,
      ruleName: rule.name,
      checkType: rule.checkType,
      severity: rule.severity,
      positionId,
      description,
      blocksCommit: rule.blocksCommit,
    });
    if (positionId) affected.add(positionId);
  };

  const ruleOf = (id: string) => active.find((r) => r.id === id);
  const seenIds = new Set<string>();
  const knownAffiliates = new Set(ctx.knownAffiliateCodes);

  for (const p of positions) {
    const completeness = ruleOf('V-001');
    if (completeness) {
      const missing: string[] = [];
      if (!p.id) missing.push('id');
      if (!p.productClass) missing.push('productClass');
      if (!p.currency) missing.push('currency');
      if (p.amount === null || p.amount === undefined || Number.isNaN(p.amount)) missing.push('amount');
      if (!p.category) missing.push('category');
      if (missing.length) raise(completeness, p.id || null, `Missing required field(s): ${missing.join(', ')}`);
    }

    const referential = ruleOf('V-002');
    if (referential && !knownAffiliates.has(p.affiliateCode)) {
      raise(referential, p.id, `Affiliate "${p.affiliateCode}" is not a known affiliate`);
    }

    const range = ruleOf('V-003');
    if (range && (p.amount < 0 || p.amount > MAX_PLAUSIBLE_AMOUNT)) {
      raise(range, p.id, `Amount ${p.amount} is outside the plausible range (0, ${MAX_PLAUSIBLE_AMOUNT}]`);
    }

    const currency = ruleOf('V-004');
    if (currency && !/^[A-Z]{3}$/.test(p.currency)) {
      raise(currency, p.id, `Currency "${p.currency}" is not a 3-letter ISO code`);
    }

    const duplicate = ruleOf('V-005');
    if (duplicate) {
      if (seenIds.has(p.id)) raise(duplicate, p.id, `Duplicate position id "${p.id}" within this batch`);
      seenIds.add(p.id);
    }

    const factors = ruleOf('V-007');
    if (factors) {
      if (p.lcrCashflowRole === 'HQLA' && p.hqlaLevel === 'None') {
        raise(factors, p.id, 'Classified as HQLA but carries no HQLA level');
      }
      if (p.lcrCashflowRole !== 'None' && p.lcrCashflowRole !== 'HQLA' && p.lcrRatePct === null) {
        raise(factors, p.id, `Classified as ${p.lcrCashflowRole} but carries no LCR rate`);
      }
      if (p.category === 'Asset' && p.rsfFactorPct === null) raise(factors, p.id, 'Asset carries no RSF factor');
      if (p.category !== 'Asset' && p.asfFactorPct === null)
        raise(factors, p.id, 'Liability or capital carries no ASF factor');
    }

    const dateOrder = ruleOf('V-008');
    if (dateOrder && p.maturityDate && p.maturityDate < ctx.asOfDate) {
      raise(dateOrder, p.id, `Maturity date ${p.maturityDate} precedes the as-of date ${ctx.asOfDate}`);
    }
  }

  // Balance-sheet integrity is a batch-level check, not a row-level one - and "the batch" is
  // balancePositions (the full assembled book), not necessarily the single slice being row-checked above.
  const balance = ruleOf('V-006');
  if (balance && balancePositions.length > 0) {
    const assets = balancePositions.filter((p) => p.category === 'Asset').reduce((s, p) => s + p.amount, 0);
    const liabilities = balancePositions.filter((p) => p.category === 'Liability').reduce((s, p) => s + p.amount, 0);
    const capital = balancePositions.filter((p) => p.category === 'Capital').reduce((s, p) => s + p.amount, 0);
    const difference = assets - (liabilities + capital);
    const tolerance = (assets * (ctx.balanceTolerancePercent ?? 0.01)) / 100;
    if (Math.abs(difference) > tolerance) {
      raise(
        balance,
        null,
        `Assets (${assets.toLocaleString()}) do not equal liabilities plus capital ` +
          `(${(liabilities + capital).toLocaleString()}) - difference ${difference.toLocaleString()}`,
      );
    }
  }

  return {
    exceptions,
    rowsChecked: positions.length,
    rowsWithExceptions: affected.size,
    blocked: exceptions.some((e) => e.blocksCommit),
    methodology:
      'Configurable validation rules run as a gate before commit, modelled on Oracle Cash Flow Edits. Rules ' +
      'marked as blocking prevent the batch being committed, so data that fails integrity cannot reach a ' +
      'calculation or a report. Rules are data, not code - a bank can add its own without a release.',
  };
}
