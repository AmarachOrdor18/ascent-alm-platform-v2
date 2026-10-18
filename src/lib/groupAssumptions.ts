// The Group assumptions setup file (Group_assumptions_setup_values.xlsx; teardown §9 A, §17): one workbook
// with a sheet per assumption - FTP method & curve, FTP add-ons, operating cost allocation, expected credit
// loss, capital charge and product characteristics - loaded once to create the Group-default rules so no
// affiliate starts from scratch.
//
// Approval-gated kinds (cost allocation, credit loss, capital, product characteristics) are saved as a new
// version pending approval (maker-checker: whoever loads the file cannot approve it). Kinds that carry no
// approval (FTP rule, FTP add-ons) are saved active. Each kind updates the Group default of that kind as a
// new version (the previous version stays in the rule history), or creates it.
import { repository } from '@/store/repositoryInstance';
import { isApprovalGated, ruleApprovalRequest, supersededRequests } from './ruleApproval';
import type { ApprovalRequest, RuleKind, RuleMeta, User } from '@/engine/types';
import type { AdjustmentLine, FtpAssignment, ProductAssumption } from '@/engine/ruleTypes';
import type { AdjustmentType, CoreTpMethod } from '@/engine/ftp';
import type { CostDriver, CostPool } from '@/engine/profitabilityLayers';
import type { LcrCashflowRole } from '@/engine/types';

type Sheets = Record<string, string[][]>;

/** One rule the file defines, ready to save. */
export interface ParsedAssumption {
  kind: RuleKind;
  label: string;
  name: string;
  /** Kind-specific content (assignments, pools, factors ...). */
  content: Record<string, unknown>;
  /** One line describing what the file set. */
  summary: string;
}

export interface ParsedAssumptions {
  items: ParsedAssumption[];
  /** Sheets that were recognised but could not be read, or not recognised at all. */
  warnings: string[];
}

export interface ImportedAssumption {
  kind: RuleKind;
  label: string;
  name: string;
  version: number;
  /** 'Pending approval' for approval-gated kinds, 'Active' otherwise. */
  status: 'Pending approval' | 'Active';
  summary: string;
}

const clean = (v: string | undefined) => (v ?? '').trim();
const num = (v: string | undefined): number | null => {
  const n = Number(
    clean(v)
      .replace(/,/g, '')
      .replace(/%|bps?|bp/gi, '')
      .trim(),
  );
  return clean(v) === '' || !Number.isFinite(n) ? null : n;
};
/** "COA-14 (Loans)" -> "COA-14"; "LOAN-RET (retail loans)" -> "LOAN-RET". */
const codeOf = (v: string) => clean(v).split(/\s+\(|\s+/)[0] ?? '';
const findSheet = (sheets: Sheets, test: RegExp) =>
  Object.entries(sheets).find(([name]) => test.test(name.toLowerCase()));

const METHODS: Array<[RegExp, CoreTpMethod]> = [
  [/matched/i, 'MatchedMaturity'],
  [/duration/i, 'DurationMatched'],
  [/average life/i, 'AverageLife'],
  [/repricing/i, 'RepricingTerm'],
  [/pool/i, 'Pooled'],
];
const methodOf = (v: string): CoreTpMethod | null => METHODS.find(([re]) => re.test(v))?.[1] ?? null;

const ADJ_TYPES: Array<[RegExp, AdjustmentType]> = [
  [/liquidity/i, 'LiquidityPremium'],
  [/currency|basis.*ccy|cross/i, 'CurrencyBasis'],
  [/basis spread|basis/i, 'BasisSpread'],
  [/incentive/i, 'PricingIncentive'],
  [/basis risk/i, 'BasisRiskCost'],
];

const DRIVERS: Array<[RegExp, CostDriver]> = [
  [/account/i, 'AccountCount'],
  [/head/i, 'Headcount'],
  [/fixed|share/i, 'Fixed'],
  [/balance/i, 'Balance'],
];

/** Read "Rule name: X  ·  Currency: USD" style title rows. */
function titleField(cell: string, field: string): string | null {
  const parts = cell.split(/·|\|/).map((p) => p.trim());
  const hit = parts.find((p) => p.toLowerCase().startsWith(field.toLowerCase()));
  return hit ? hit.slice(hit.indexOf(':') + 1).trim() || null : null;
}

export function parseGroupAssumptions(sheets: Sheets): ParsedAssumptions {
  const items: ParsedAssumption[] = [];
  const warnings: string[] = [];
  const used = new Set<string>();

  // 1. FTP method & curve
  const ftp = findSheet(sheets, /ftp.*method|transfer pricing method/);
  if (ftp) {
    used.add(ftp[0]);
    const rows = ftp[1].slice(1);
    const value = (label: RegExp) => rows.find((r) => label.test(clean(r[0])))?.[1] ?? '';
    const name = clean(value(/^rule name/i)) || 'Group FTP';
    const defaultMethod = methodOf(value(/^default method/i)) ?? 'MatchedMaturity';
    const assignments: FtpAssignment[] = rows
      .filter((r) => /^assignment/i.test(clean(r[0])))
      .map((r) => {
        const coa =
          clean(r[0]).match(/(COA-[A-Z0-9-]+)/i)?.[1] ??
          codeOf(
            clean(r[0])
              .split(':')
              .slice(1)
              .join(':')
              .replace(/product class/i, ''),
          );
        const method = methodOf(clean(r[1])) ?? defaultMethod;
        const curveRaw =
          clean(r[1])
            .match(/curve:\s*(.+)$/i)?.[1]
            ?.trim() ?? '';
        const curveCode = !curveRaw || /default|^-/.test(curveRaw) ? null : curveRaw;
        return { commonCoaCode: coa.toUpperCase(), method, curveCode };
      })
      .filter((a) => !!a.commonCoaCode);
    items.push({
      kind: 'FtpRule',
      label: 'Transfer pricing method & curve',
      name,
      content: { assignments, defaultMethod, pools: [] },
      summary: `Default ${defaultMethod.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}, ${assignments.length} product assignment(s).`,
    });
  }

  // 2. FTP add-ons
  const adj = findSheet(sheets, /add-?on|adjustment/);
  if (adj) {
    used.add(adj[0]);
    const rows = adj[1].slice(1);
    const name = rows.map((r) => titleField(clean(r[0]), 'Rule name')).find(Boolean) ?? 'Group FTP add-ons';
    const lines: AdjustmentLine[] = rows
      .filter((r) => !/^rule name/i.test(clean(r[0])) && clean(r[0]) !== '')
      .map((r, i) => {
        const type = ADJ_TYPES.find(([re]) => re.test(clean(r[0])))?.[1] ?? 'OtherAdjustment';
        const applies = clean(r[1]);
        const currency = applies.match(/currency\s+([A-Z]{3})/i)?.[1]?.toUpperCase() ?? null;
        const coa = /^all$/i.test(applies) || currency ? null : codeOf(applies).toUpperCase() || null;
        return {
          id: `ADJ-${i + 1}`,
          type,
          commonCoaCode: coa,
          method: 'FixedRate' as const,
          fixedBps: num(r[3]) ?? 0,
          lcrThresholdPercent: 100,
          lcrMultiplier: 0,
          lcrCapBps: 0,
          ...(type === 'CurrencyBasis' ? { currency } : {}),
        };
      });
    if (lines.length > 0) {
      items.push({
        kind: 'AdjustmentRule',
        label: 'Transfer pricing add-ons',
        name,
        content: { adjustments: lines },
        summary: `${lines.length} add-on(s): ${lines.map((l) => `${l.type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} ${l.fixedBps} bps`).join(', ')}.`,
      });
    } else warnings.push(`Sheet "${adj[0]}" has no add-on rows.`);
  }

  // 3. Operating cost allocation
  const cost = findSheet(sheets, /cost/);
  if (cost) {
    used.add(cost[0]);
    const rows = cost[1].slice(1);
    const title = rows.find((r) => /rule name/i.test(clean(r[0])))?.[0] ?? '';
    const name = titleField(clean(title), 'Rule name') ?? 'Group operating costs';
    const currency = (titleField(clean(title), 'Currency') ?? 'USD').toUpperCase();
    const pools: CostPool[] = rows
      .filter((r) => !/rule name|^headcount/i.test(clean(r[0])) && num(r[1]) !== null)
      .map((r, i) => ({
        id: `POOL-${i + 1}`,
        name: clean(r[0]),
        amount: num(r[1]) ?? 0,
        driver: DRIVERS.find(([re]) => re.test(clean(r[2])))?.[1] ?? 'Balance',
      }));
    if (pools.length > 0) {
      items.push({
        kind: 'CostAllocation',
        label: 'Operating cost allocation',
        name,
        content: { currency, pools, headcountByOrgUnit: {} },
        summary: `${pools.length} cost pool(s), ${currency} ${pools.reduce((s, p) => s + p.amount, 0).toLocaleString()} a year.`,
      });
    } else warnings.push(`Sheet "${cost[0]}" has no cost pools.`);
  }

  // 4. Expected credit loss
  const ecl = findSheet(sheets, /credit/);
  if (ecl) {
    used.add(ecl[0]);
    const rows = ecl[1].slice(1);
    const title = rows.find((r) => /rule name/i.test(clean(r[0])))?.[0] ?? '';
    const name = titleField(clean(title), 'Rule name') ?? 'Group expected credit loss';
    const method = /provision/i.test(titleField(clean(title), 'Method') ?? '') ? 'ProvisionChange' : 'PdLgd';
    const def = rows.find((r) => /^default/i.test(clean(r[0])));
    const pdByProduct: Record<string, number> = {};
    const lgdByProduct: Record<string, number> = {};
    for (const r of rows) {
      const first = clean(r[0]);
      if (!first || /rule name|^default|provision/i.test(first)) continue;
      const pd = num(r[1]);
      const lgd = num(r[2]);
      if (pd === null && lgd === null) continue;
      const code = codeOf(first).toUpperCase();
      if (pd !== null) pdByProduct[code] = pd;
      if (lgd !== null) lgdByProduct[code] = lgd;
    }
    const provisions = rows.find((r) => /provision/i.test(clean(r[0])));
    items.push({
      kind: 'CreditLoss',
      label: 'Expected credit loss',
      name,
      content: {
        method,
        pdByProduct,
        lgdByProduct,
        defaultPdPct: num(def?.[1]) ?? undefined,
        defaultLgdPct: num(def?.[2]) ?? undefined,
        useProvisionAmount: provisions ? /on|yes|true/i.test(clean(provisions[1])) : true,
      },
      summary: `${method === 'PdLgd' ? 'PD × LGD' : 'Provision change'}, ${Object.keys(pdByProduct).length} product(s)${def ? `, default PD ${num(def[1])}% / LGD ${num(def[2])}%` : ''}.`,
    });
  }

  // 5. Capital charge
  const cap = findSheet(sheets, /capital/);
  if (cap) {
    used.add(cap[0]);
    const rows = cap[1].slice(1);
    const value = (label: RegExp) => rows.find((r) => label.test(clean(r[0])))?.[1];
    const riskWeightByProductClass: Record<string, number> = {};
    for (const r of rows) {
      const first = clean(r[0]);
      if (!/^COA-|^[A-Z]{2,}-/i.test(first)) continue;
      const w = num(r[1]);
      if (w !== null) riskWeightByProductClass[codeOf(first).toUpperCase()] = w;
    }
    items.push({
      kind: 'CapitalAllocation',
      label: 'Capital charge',
      name: clean(value(/^rule name/i)) || 'Group capital charge',
      content: {
        riskWeightByProductClass,
        defaultRiskWeightPct: num(value(/default risk weight/i)) ?? 100,
        capitalRatioPct: num(value(/capital ratio/i)) ?? 12.5,
        costOfCapitalPct: num(value(/cost of capital/i)) ?? 15,
        taxRatePct: num(value(/tax/i)) ?? undefined,
      },
      summary: `Capital ratio ${num(value(/capital ratio/i)) ?? 12.5}%, cost of capital ${num(value(/cost of capital/i)) ?? 15}%, ${Object.keys(riskWeightByProductClass).length} risk weight(s).`,
    });
  }

  // 6. Product characteristics
  const pc = findSheet(sheets, /product/);
  if (pc) {
    used.add(pc[0]);
    const roleOf = (v: string): LcrCashflowRole =>
      /hqla/i.test(v) ? 'HQLA' : /inflow/i.test(v) ? 'Inflow' : /outflow/i.test(v) ? 'Outflow' : 'None';
    const levelOf = (v: string): ProductAssumption['hqlaLevel'] =>
      /2b/i.test(v) ? 'Level 2B' : /2a/i.test(v) ? 'Level 2A' : /1/.test(v) ? 'Level 1' : 'None';
    // A row is keyed by a product, or - as a fallback for every product on it without a row of its own - by a
    // common account: the first column headed "Common account"/"COA", or a cell like "COA-14 (Loans)" or
    // "Common account: COA-14". A common-account row's currency may be "Any" / "All" / "*".
    const headerIsCoa = /^(common|coa)/i.test(clean(pc[1][0]?.[0]));
    const coaCell = (v: string) => headerIsCoa || /^coa[-:\s]/i.test(v) || /^common account/i.test(v);
    const anyCcy = (v: string) => /^(\*|any|all)$/i.test(v);
    const assumptions: ProductAssumption[] = pc[1]
      .slice(1)
      .filter((r) => clean(r[0]) && (/^[A-Z]{3}$/i.test(clean(r[1])) || (coaCell(clean(r[0])) && anyCcy(clean(r[1])))))
      .map((r) => {
        const first = clean(r[0]);
        const isCoa = coaCell(first);
        const currency = anyCcy(clean(r[1])) ? '*' : clean(r[1]).toUpperCase();
        const base: ProductAssumption = {
          productCode: isCoa ? '' : first.toUpperCase(),
          currency,
          lcrCashflowRole: roleOf(clean(r[2])),
          lcrRatePct: num(r[3]),
          asfFactorPct: num(r[4]),
          rsfFactorPct: num(r[5]),
          hqlaLevel: levelOf(clean(r[6])),
          hqlaHaircutPct: num(r[7]) ?? 0,
          approxDurationYears: null,
          isRateSensitive: roleOf(clean(r[2])) !== 'HQLA' || !/cash/i.test(first),
        };
        return isCoa
          ? { ...base, commonCoaCode: codeOf(first.replace(/^common account\s*:?\s*/i, '')).toUpperCase() }
          : base;
      })
      .filter((a) => a.productCode || a.commonCoaCode);
    if (assumptions.length > 0) {
      items.push({
        kind: 'ProductCharacteristic',
        label: 'Product characteristics',
        name: 'Group product characteristics',
        content: { assumptions },
        summary: `${assumptions.filter((a) => !a.commonCoaCode).length} product/currency line(s), ${assumptions.filter((a) => a.commonCoaCode).length} common-account line(s) (${Array.from(new Set(assumptions.map((a) => (a.currency === '*' ? 'any currency' : a.currency)))).join(', ')}).`,
      });
    } else warnings.push(`Sheet "${pc[0]}" has no product rows.`);
  }

  for (const name of Object.keys(sheets)) {
    if (used.has(name) || /read ?me/i.test(name)) continue;
    warnings.push(`Sheet "${name}" was not recognised and was skipped.`);
  }
  if (items.length === 0) warnings.push('No assumption sheets were recognised in this file.');
  return { items, warnings };
}

/**
 * Save the parsed assumptions as Group defaults - or, given an affiliate, as that affiliate's own rules (the
 * Group's stay untouched, and runs for the affiliate prefer its own approved rule). Each updates the rule of
 * that kind (a new version, keeping history) or creates one. Gated kinds raise an approval request.
 */
export async function importGroupAssumptions(
  parsed: ParsedAssumptions,
  user: Pick<User, 'id' | 'name' | 'role'>,
  affiliate: { code: string; name: string } | null = null,
): Promise<ImportedAssumption[]> {
  const out: ImportedAssumption[] = [];
  const now = new Date().toISOString();
  const requests: ApprovalRequest[] = await repository.listApprovalRequests();
  const scope = affiliate?.code ?? null;
  const fileWord = affiliate ? `${affiliate.name} assumptions file` : 'Group assumptions file';
  // "Group capital charge" becomes "Ecobank Nigeria capital charge" for an affiliate's own copy.
  const nameFor = (name: string) =>
    affiliate
      ? /^group\b/i.test(name)
        ? name.replace(/^group\b/i, affiliate.name)
        : `${affiliate.name} - ${name}`
      : name;
  for (const item of parsed.items) {
    const name = nameFor(item.name);
    const existing = (await repository.listRules({ kind: item.kind, affiliateCode: scope })) as RuleMeta[];
    const own = existing.filter((r) => (r.affiliateCode ?? null) === scope);
    const target =
      own.find((r) => r.name === name) ??
      [...own]
        .filter((r) => r.isActive)
        .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0];
    const base: RuleMeta = target
      ? {
          ...target,
          name,
          version: target.version + 1,
          isActive: true,
          updatedBy: user.name,
          updatedAt: now,
        }
      : {
          id: `${item.kind.toUpperCase()}-${scope ?? 'GROUP'}-${Date.now().toString(36).toUpperCase()}`,
          kind: item.kind,
          name,
          description: affiliate
            ? `${affiliate.name}'s own copy, loaded from its assumptions file (based on the Group defaults).`
            : 'Loaded from the Group assumptions setup file.',
          folder: affiliate ? affiliate.name : 'Group Default',
          accessType: 'Read-Write',
          affiliateCode: scope,
          version: 1,
          isActive: true,
          createdBy: user.name,
          createdAt: now,
          updatedBy: null,
          updatedAt: null,
        };
    // The kind-specific fields (assignments, pools, factors ...) ride on the rule record itself.
    const rule = { ...base, ...item.content, kind: item.kind } as RuleMeta;
    await repository.upsertRule(rule);
    const gated = isApprovalGated(item.kind);
    if (gated) {
      for (const stale of supersededRequests(rule, requests, now)) {
        if (stale.requestedById && stale.requestedById !== user.id) continue;
        await repository.upsertApprovalRequest(stale).catch(() => undefined);
      }
      await repository.upsertApprovalRequest({
        ...ruleApprovalRequest(rule, user.name, now, user.id),
        summary: `${item.label} loaded from the ${fileWord} as version ${rule.version} - ${item.summary} Not usable in a run until approved.`,
      });
    }
    await repository.recordAuditEvent({
      id: `AE-GA-${Date.now()}-${out.length}`,
      module: 'Business Rules',
      action: gated ? 'Load (pending approval)' : 'Load',
      entity: item.kind,
      entityId: rule.id,
      userId: user.id,
      userName: user.name,
      role: user.role,
      outcome: 'Success',
      detail: `${rule.name} (version ${rule.version}) from the ${fileWord}: ${item.summary}`,
      recordedAt: now,
    });
    out.push({
      kind: item.kind,
      label: item.label,
      name: rule.name,
      version: rule.version,
      status: gated ? 'Pending approval' : 'Active',
      summary: item.summary,
    });
  }
  return out;
}
