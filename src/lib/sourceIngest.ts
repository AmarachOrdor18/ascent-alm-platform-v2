// Phase 4 ingestion: read one uploaded file against the data source it was sent to, and - once someone
// admits it - write it into the store that domain already uses. Everything here reuses the platform's
// existing importers (csvImport / historyImport), validation rules, code mappings, supersede/versioning
// (engine/vintage) and the position commit path (commitPositionsBatch in lib/hooks.ts); the source only
// adds the "which affiliate / which department / which headers" that used to be picked on screen.
import { repository } from '@/store/repositoryInstance';
import type { StagedBatch, StagedCheck } from '@/store/repository';
import {
  importCounterparties,
  importFxRates,
  importIndicatorSeries,
  importLedger,
  importPositions,
  importYieldCurvePoints,
  parseCsv,
  type CurvePointRow,
  type IndicatorSeriesRow,
  type RowError,
} from './csvImport';
import { importAccountHistory, importBalanceHistory } from './historyImport';
import { applyFieldMapping } from './fieldMapping';
import { tableToCsv } from './fileImport';
import {
  applySourceAliases,
  businessDateInFile,
  duplicateKeyRows,
  fileHeaders,
  matchHeaders,
  normHeader,
  SOURCE_DOMAIN_LABEL,
  type HeaderMatch,
} from './dataSources';
import { toStoredAccountRows, toStoredBalanceRows } from './modelRegistry';
import { applyCodeMappings, deriveMembersFromFile, unmappedCodes } from '@/engine/dimensions';
import { afterMarketDataLoad } from './marketDataEvents';
import { sendNotification } from './notify';
import { referenceLoadBatch } from './referenceBatch';
import { DEFAULT_VALIDATION_RULES, validatePositions, type ValidationResult } from '@/engine/validation';
import { ALL_CONTRIBUTORS, currentBatch, planSupersede } from '@/engine/vintage';
import { reconcile, type LedgerBalance, type ReconciliationResult } from '@/engine/reconciliation';
import { identityFxTable } from '@/engine/fx';
import type { AccountObservation, BalanceObservation } from '@/engine/behaviouralModels';
import type { CodeMappingRule, FieldMappingRule, ValidationRuleSet } from '@/engine/ruleTypes';
import type {
  Affiliate,
  DataDomain,
  DataSource,
  DimensionMember,
  DimensionType,
  EconomicIndicator,
  LoadBatch,
  Position,
  StoredFxRate,
  StoredYieldCurve,
} from '@/engine/types';

// ─── Checksums and dates ────────────────────────────────────────────────────

/** SHA-256 of the file text, hex. */
export async function contentChecksum(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** The last calendar day of the month before `today` - the usual as-of date for a monthly book. */
export function lastMonthEnd(today = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  return d.toISOString().slice(0, 10);
}

// ─── The check ──────────────────────────────────────────────────────────────

export interface CheckIssue {
  line: number | null;
  field: string;
  message: string;
  /** Blocks admitting the file (a blocking validation rule, or a code that must be created first). */
  blocking: boolean;
}

/** Everything the upload screen shows about one file, plus what admitting it would write. */
export interface FileCheck {
  fileName: string;
  source: DataSource;
  checksum: string;
  /** The file as the platform's importers read it: field-mapped and with alias headers renamed. */
  text: string;
  headers: string[];
  headerMatch: HeaderMatch;
  /** The as-of date read from the file, if it carries one. */
  fileDate: string | null;
  /** The date the load will be filed under. */
  asOfDate: string;
  rows: number;
  valid: number;
  invalid: number;
  duplicates: number;
  /** Rows with an advisory finding (loaded, but worth a look). */
  flagged: number;
  issues: CheckIssue[];
  ignoredColumns: string[];
  /** A problem with the file as a whole - nothing can be loaded from it. */
  fileError: string | null;
  /** The same file content already in the lobby or admitted for this source. */
  duplicateOf: LoadBatch | null;
  /** Positions only: codes this affiliate does not have yet - created automatically when the file is admitted. */
  unmapped: Array<{ dimension: DimensionType; codes: string[] }>;
  validation: ValidationResult | null;
  /** Positions only: the admitted load would replace this one for the same date (a reason is then required). */
  replaces: LoadBatch | null;
  positions: Position[];
  records: unknown[];
  batch: LoadBatch;
}

export interface CheckEnv {
  batches: LoadBatch[];
  lobby: StagedBatch[];
  affiliates: Affiliate[];
  validationRuleSets: ValidationRuleSet[];
  fieldMappings: FieldMappingRule[];
  codeMappings: CodeMappingRule[];
  userName: string;
}

/** Another department's positions file picked in the same upload, for the same affiliate and date. */
export interface UploadCompanion {
  contributor: DataSource['contributor'];
  positions: Position[];
}

export const blockingCount = (c: FileCheck) => c.issues.filter((i) => i.blocking).length;

/** Nothing stops it going to the lobby: the file was read, it is not a repeat, and it has rows to load. */
export const canSendToLobby = (c: FileCheck) => !c.fileError && !c.duplicateOf && c.valid > 0;

/** It could be admitted right now: lobby-ready and nothing blocking. New codes never block - admitting creates them. */
export const canAdmitNow = (c: FileCheck) => canSendToLobby(c) && blockingCount(c) === 0;

const DOMAIN_TAG: Record<string, string> = {
  GeneralLedger: 'GL',
  Counterparties: 'CPTY',
  FxRates: 'FX',
  MarketRates: 'CURVES',
  EconomicIndicators: 'IND',
  BalanceHistory: 'BALHIST',
  AccountHistory: 'ACCTHIST',
  MarketData: 'MKT',
};

function newBatchId(source: DataSource, asOfDate: string): string {
  const tag = source.contributor ?? DOMAIN_TAG[source.domain] ?? source.domain.toUpperCase();
  return `B-${source.affiliateCode}-${tag}-${asOfDate}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

/** The applicable field-mapping rule that matches the most of this file's headers, if any matches at all. */
function pickFieldMapping(rules: FieldMappingRule[], source: DataSource, headers: string[]): FieldMappingRule | null {
  const normalized = new Set(headers.map(normHeader));
  let best: FieldMappingRule | null = null;
  let bestHits = 0;
  for (const rule of rules) {
    if (!rule.isActive || rule.domain !== (source.domain as DataDomain)) continue;
    if (rule.affiliateCode !== null && rule.affiliateCode !== source.affiliateCode) continue;
    const hits = rule.columns.filter((c) => normalized.has(normHeader(c.sourceField))).length;
    if (hits > bestHits) {
      best = rule;
      bestHits = hits;
    }
  }
  return best;
}

/** One code-mapping rule per dimension: the affiliate's own if it has one, else the Group default. */
function applicableCodeMappings(rules: CodeMappingRule[], affiliateCode: string): CodeMappingRule[] {
  return (['OrgUnit', 'GlAccount', 'CommonCoa'] as const)
    .map((dim) => {
      const forDim = rules.filter((m) => m.dimension === dim && m.isActive);
      return (
        forDim.find((m) => m.affiliateCode === affiliateCode) ?? forDim.find((m) => m.affiliateCode === null) ?? null
      );
    })
    .filter((m): m is CodeMappingRule => m !== null);
}

function validationRulesFor(sets: ValidationRuleSet[], affiliateCode: string) {
  return (
    sets.find((s) => s.affiliateCode === affiliateCode)?.rules ??
    sets.find((s) => s.affiliateCode === null)?.rules ??
    DEFAULT_VALIDATION_RULES
  );
}

const rowErrorIssue = (e: RowError, dropped: boolean): CheckIssue => ({
  line: e.line,
  field: e.column,
  message: dropped ? `${e.message} - this row is not loaded` : e.message,
  blocking: false,
});

/** Distinct data lines (not the header) that carry at least one parse error. */
const badLines = (errors: RowError[]) => new Set(errors.filter((e) => e.line > 1).map((e) => e.line)).size;

/** Dimensions a positions file can introduce new codes for - all derived from the file on admit. */
export const DERIVED_DIMENSIONS = ['Product', 'GlAccount', 'OrgUnit', 'CommonCoa', 'Counterparty'] as const;

/** Which codes a set of positions has that the affiliate does not have yet. */
export async function findUnmapped(
  positions: Position[],
  affiliateCode: string,
): Promise<Array<{ dimension: DimensionType; codes: string[] }>> {
  const dims = DERIVED_DIMENSIONS;
  const members: DimensionMember[] = (
    await Promise.all(dims.map((d) => repository.listDimensionMembers(d, affiliateCode)))
  ).flat();
  return dims
    .map((dimension) => ({ dimension, codes: unmappedCodes(positions, dimension, members) }))
    .filter((u) => u.codes.length > 0);
}

/**
 * Validates positions the way the old staging screen did: each department's slice is checked on its own,
 * except the balance-sheet identity, which is only checked once this file would complete the book.
 */
async function validateForSource(
  positions: Position[],
  source: DataSource,
  affiliate: Affiliate,
  asOfDate: string,
  env: CheckEnv,
  companions: UploadCompanion[] = [],
): Promise<ValidationResult> {
  const contributor = source.contributor;
  // Other departments' files in the same upload stand in for their stored loads - checking each file only
  // against what is already admitted would fail the balance sheet whenever the book is loaded together.
  const fromUpload = new Map(
    companions.filter((c) => c.contributor && c.contributor !== contributor).map((c) => [c.contributor!, c.positions]),
  );
  // A source with no department carries the whole book, so the balance-sheet identity is checked on the file itself.
  if (!contributor) {
    return validatePositions(
      positions,
      { asOfDate, knownAffiliateCodes: env.affiliates.map((a) => a.code) },
      validationRulesFor(env.validationRuleSets, affiliate.code),
      positions,
    );
  }
  const required = affiliate.requiredContributors ?? ALL_CONTRIBUTORS;
  const complete = required
    .filter((c) => c !== contributor)
    .every((c) => fromUpload.has(c) || currentBatch(env.batches, affiliate.code, 'Positions', asOfDate, c) !== null);
  let balance: Position[] = [];
  if (complete) {
    const others = new Set(
      ALL_CONTRIBUTORS.filter((c) => c !== contributor && !fromUpload.has(c))
        .map((c) => currentBatch(env.batches, affiliate.code, 'Positions', asOfDate, c))
        .filter((b): b is LoadBatch => b !== null)
        .map((b) => b.id),
    );
    const existing =
      others.size > 0
        ? await repository.queryPositions({ affiliateCode: affiliate.code, asOfDate, batchIds: [...others] })
        : [];
    balance = [...existing, ...[...fromUpload.values()].flat(), ...positions];
  }
  return validatePositions(
    positions,
    { asOfDate, knownAffiliateCodes: env.affiliates.map((a) => a.code) },
    validationRulesFor(env.validationRuleSets, affiliate.code),
    balance,
  );
}

/** Read and check one file for a source. Never writes anything. */
export async function checkFile(
  source: DataSource,
  fileName: string,
  rawText: string,
  env: CheckEnv,
  options: { asOfDate?: string; defaultAsOfDate?: string; companions?: UploadCompanion[] } = {},
): Promise<FileCheck> {
  const affiliate = env.affiliates.find((a) => a.code === source.affiliateCode) ?? null;
  const checksum = await contentChecksum(rawText);
  const rawHeaders = fileHeaders(rawText);
  const mapping = pickFieldMapping(env.fieldMappings, source, rawHeaders);
  const mappedText = mapping ? applyFieldMapping(rawText, mapping) : rawText;
  const headers = fileHeaders(mappedText);
  const headerMatch = matchHeaders(headers, source.fields);
  const text = applySourceAliases(mappedText, source.fields);
  const fileDate = businessDateInFile(mappedText, source);
  const asOfDate = options.asOfDate || fileDate || options.defaultAsOfDate || lastMonthEnd();
  const dataRows = Math.max(0, parseCsv(text).length - 1);

  const shortHash = checksum.slice(0, 16);
  const duplicateOf =
    env.batches.find(
      (b) =>
        b.affiliateCode === source.affiliateCode &&
        b.domain === source.domain &&
        (b.status === 'Staged' || b.status === 'Committed') &&
        (b.checksum === checksum || b.fileHash === shortHash) &&
        (!b.sourceId || b.sourceId === source.id),
    ) ??
    env.lobby.find((s) => !s.admitted && s.checksum === checksum && s.sourceId === source.id)?.batch ??
    null;

  const batch: LoadBatch = {
    id: newBatchId(source, asOfDate),
    affiliateCode: source.affiliateCode,
    domain: source.domain,
    contributor: source.domain === 'Positions' ? (source.contributor ?? null) : null,
    asOfDate,
    version: 1,
    fileName,
    fileHash: shortHash,
    rowCount: dataRows,
    rowsAccepted: 0,
    rowsRejected: 0,
    status: 'Staged',
    supersedesBatchId: null,
    supersededReason: null,
    uploadedBy: env.userName,
    uploadedAt: new Date().toISOString(),
    committedBy: null,
    committedAt: null,
    reconciledBy: null,
    reconciledAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    sourceId: source.id,
    checksum,
    ...(mapping ? { mappingRuleVersionsUsed: { [mapping.id]: mapping.version } } : {}),
  };

  const base: FileCheck = {
    fileName,
    source,
    checksum,
    text,
    headers,
    headerMatch,
    fileDate,
    asOfDate,
    rows: dataRows,
    valid: 0,
    invalid: 0,
    duplicates: 0,
    flagged: 0,
    issues: [],
    ignoredColumns: headerMatch.ignored,
    fileError: null,
    duplicateOf,
    unmapped: [],
    validation: null,
    replaces: null,
    positions: [],
    records: [],
    batch,
  };

  if (headers.length === 0 || dataRows === 0) {
    return {
      ...base,
      fileError: headers.length === 0 ? 'The file is empty.' : 'The file has a header row but no data rows.',
    };
  }
  if (headerMatch.missingRequired.length > 0) {
    return {
      ...base,
      fileError: `The file is missing ${headerMatch.missingRequired.length === 1 ? 'a required column' : 'required columns'}: ${headerMatch.missingRequired.join(', ')}. Add ${headerMatch.missingRequired.length === 1 ? 'it' : 'them'} to the file, or tell the source which of your headers to use (Fields tab).`,
    };
  }
  if (!affiliate && source.affiliateCode !== 'GROUP') {
    return { ...base, fileError: `Affiliate ${source.affiliateCode} no longer exists.` };
  }

  const duplicateRows = duplicateKeyRows(text, source);
  const dupIssues: CheckIssue[] = duplicateRows.slice(0, 20).map((n) => ({
    line: n + 1,
    field: source.fields
      .filter((f) => f.key)
      .map((f) => f.name)
      .join(' + '),
    message: 'Same key as an earlier row in this file',
    blocking: false,
  }));

  const finish = (
    partial: Partial<FileCheck> & { errors: RowError[]; dropped: boolean; accepted: number },
  ): FileCheck => {
    const invalid = badLines(partial.errors);
    const duplicates = duplicateRows.length;
    const issues = [
      ...(partial.issues ?? []),
      ...partial.errors.slice(0, 50).map((e) => rowErrorIssue(e, partial.dropped)),
      ...dupIssues,
    ];
    return {
      ...base,
      ...partial,
      // Reloading the same file to replace the load it matches (same source, same date) is a reload, not a
      // double count - the old load is withdrawn on admit, and a reason is still required.
      duplicateOf: partial.replaces && base.duplicateOf?.id === partial.replaces.id ? null : base.duplicateOf,
      invalid,
      duplicates,
      valid: Math.max(0, partial.accepted - (partial.dropped ? 0 : invalid) - duplicates),
      issues,
      batch: {
        ...base.batch,
        ...(partial.batch ?? {}),
        rowsAccepted: partial.accepted,
        rowsRejected: dataRows - partial.accepted,
        rowsFlagged: partial.flagged ?? 0,
        checkIssues: issues.slice(0, 40),
      },
    };
  };

  switch (source.domain) {
    case 'Positions': {
      const result = importPositions(text, {
        affiliateCode: source.affiliateCode,
        asOfDate,
        batchId: batch.id,
        defaultCurrency: affiliate!.functionalCurrency,
        defaultLegalEntityCode: affiliate!.legalEntityCode,
      });
      const codeRules = applicableCodeMappings(env.codeMappings, source.affiliateCode);
      const positions = applyCodeMappings(result.rows, codeRules);
      const validation = await validateForSource(positions, source, affiliate!, asOfDate, env, options.companions);
      const unmapped = await findUnmapped(positions, source.affiliateCode);
      const plan = planSupersede(env.batches, source.affiliateCode, 'Positions', asOfDate, source.contributor);
      const issues: CheckIssue[] = [
        ...validation.exceptions.slice(0, 50).map((e) => ({
          line: null,
          field: e.positionId ?? e.ruleName,
          message: `${e.ruleName}: ${e.description}`,
          blocking: e.blocksCommit,
        })),
      ];
      const usedMappings = [...(mapping ? [mapping] : []), ...codeRules];
      return finish({
        errors: result.errors,
        dropped: false,
        accepted: positions.length,
        issues,
        validation,
        unmapped,
        flagged: validation.rowsWithExceptions,
        positions,
        replaces: plan.superseded,
        batch: {
          ...batch,
          version: plan.nextVersion,
          ...(usedMappings.length > 0
            ? { mappingRuleVersionsUsed: Object.fromEntries(usedMappings.map((r) => [r.id, r.version])) }
            : {}),
        },
      });
    }
    case 'GeneralLedger': {
      const result = importLedger(text, asOfDate, affiliate?.functionalCurrency ?? 'USD');
      const plan = planSupersede(env.batches, source.affiliateCode, 'GeneralLedger', asOfDate);
      return finish({
        errors: result.errors,
        dropped: false,
        accepted: result.rows.length,
        records: result.rows,
        replaces: plan.superseded,
        batch: { ...batch, version: plan.nextVersion },
      });
    }
    case 'Counterparties': {
      const result = importCounterparties(text, source.affiliateCode);
      return finish({ errors: result.errors, dropped: true, accepted: result.rows.length, records: result.rows });
    }
    case 'FxRates': {
      const result = importFxRates(text, asOfDate, env.userName);
      return finish({ errors: result.errors, dropped: true, accepted: result.rows.length, records: result.rows });
    }
    case 'MarketRates': {
      const result = importYieldCurvePoints(text, asOfDate);
      return finish({ errors: result.errors, dropped: true, accepted: result.rows.length, records: result.rows });
    }
    case 'EconomicIndicators': {
      const result = importIndicatorSeries(text);
      return finish({ errors: result.errors, dropped: true, accepted: result.rows.length, records: result.rows });
    }
    case 'MarketData': {
      const split = splitMarketData(text, asOfDate, env.userName);
      const content: MarketDataRecords = { fx: split.fx, curves: split.curves, indicators: split.indicators };
      const accepted = split.fx.length + split.curves.length + split.indicators.length;
      return finish({ errors: split.errors, dropped: true, accepted, records: [content] });
    }
    case 'BalanceHistory':
    case 'AccountHistory': {
      const ctx = { defaultAffiliateCode: source.affiliateCode };
      const result =
        source.domain === 'BalanceHistory' ? importBalanceHistory(text, ctx) : importAccountHistory(text, ctx);
      // A file may carry an affiliateCode column - rows for another affiliate are refused, not filed here.
      const errors = [...result.errors];
      const rows = (result.rows as Array<BalanceObservation | AccountObservation>).filter((r) => {
        if (r.affiliateCode === source.affiliateCode) return true;
        errors.push({
          line: 0,
          column: 'affiliateCode',
          message: `A row for ${r.asOfDate} belongs to affiliate ${r.affiliateCode}, not ${source.affiliateCode}`,
        });
        return false;
      });
      return finish({ errors, dropped: true, accepted: rows.length, records: rows });
    }
  }
}

// ─── Market data: one file, three kinds of row ──────────────────────────────

/** What an admitted market-data file writes: FX rates, curve points and policy/economic rate observations. */
export interface MarketDataRecords {
  fx: StoredFxRate[];
  curves: CurvePointRow[];
  indicators: IndicatorSeriesRow[];
}

type MarketKind = 'fx' | 'curve' | 'indicator';

/** Which kind a row is: its dataType (or sheet name) when that says, else the columns it fills. */
function marketKind(row: Record<string, string>): MarketKind | null {
  const t = (row.datatype ?? '').toLowerCase();
  if (/curve|yield/.test(t)) return 'curve';
  if (/fx|exchange|currenc/.test(t)) return 'fx';
  if (/indicator|policy|economic|macro|series/.test(t)) return 'indicator';
  if (row.base && row.quote) return 'fx';
  if (row.tenordays) return 'curve';
  if (row.indicatorcode) return 'indicator';
  // A bare date + value series (e.g. a policy-rate file) is a rate series too.
  if (row.value && row.asofdate) return 'indicator';
  return null;
}

/**
 * Splits a combined market-data file into its FX, curve and indicator rows and reads each with the
 * platform's ordinary importer. Error line numbers point back at the combined file.
 */
export function splitMarketData(
  text: string,
  asOfDate: string,
  userName: string,
): MarketDataRecords & { errors: RowError[] } {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((h) => h.trim());
  // Indicator rows need a code; a file without the column (a plain policy-rate series) gets one.
  if (!header.some((h) => normHeader(h) === 'indicatorcode')) header.push('indicatorCode');
  const keys = header.map(normHeader);
  const codeCol = keys.indexOf('indicatorcode');
  const parts: Record<MarketKind, { rows: string[][]; lines: number[] }> = {
    fx: { rows: [], lines: [] },
    curve: { rows: [], lines: [] },
    indicator: { rows: [], lines: [] },
  };
  const errors: RowError[] = [];
  table.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === '')) return;
    const row: Record<string, string> = {};
    keys.forEach((k, c) => (row[k] = (cells[c] ?? '').trim()));
    const kind = marketKind(row);
    if (!kind) {
      errors.push({
        line: i + 2,
        column: '',
        message:
          'Not recognised as an FX rate (base, quote, rate), a curve point (currency, tenorDays, ratePercent) or a rate series (indicatorCode, value) - this row is not loaded',
      });
      return;
    }
    const filled = header.map((_, c) => cells[c] ?? '');
    if (kind === 'indicator' && !filled[codeCol]!.trim()) {
      const fromType = (row.datatype ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      filled[codeCol] = fromType || 'POLICY_RATE';
    }
    parts[kind].rows.push(filled);
    parts[kind].lines.push(i + 2);
  });
  const sub = (kind: MarketKind) => (parts[kind].rows.length > 0 ? tableToCsv([header, ...parts[kind].rows]) : null);
  const remap = (kind: MarketKind, errs: RowError[]) =>
    errs.map((e) => ({ ...e, line: e.line > 1 ? (parts[kind].lines[e.line - 2] ?? e.line) : e.line }));
  const fxText = sub('fx');
  const curveText = sub('curve');
  const indText = sub('indicator');
  const fx = fxText ? importFxRates(fxText, asOfDate, userName) : null;
  const curves = curveText ? importYieldCurvePoints(curveText, asOfDate) : null;
  const indicators = indText ? importIndicatorSeries(indText) : null;
  if (fx) errors.push(...remap('fx', fx.errors));
  if (curves) errors.push(...remap('curve', curves.errors));
  if (indicators) errors.push(...remap('indicator', indicators.errors));
  return { fx: fx?.rows ?? [], curves: curves?.rows ?? [], indicators: indicators?.rows ?? [], errors };
}

/** The compact form of a check kept with a lobby entry. */
export function compactCheck(c: FileCheck): StagedCheck {
  return {
    rows: c.rows,
    valid: c.valid,
    invalid: c.invalid,
    duplicates: c.duplicates,
    flagged: c.flagged,
    blocking: blockingCount(c),
    issues: c.issues.slice(0, 40),
    ignoredColumns: c.ignoredColumns,
  };
}

// ─── Writing ────────────────────────────────────────────────────────────────

export interface Actor {
  id: string;
  name: string;
  role: string;
}

let auditSeq = 0;
async function audit(actor: Actor | null, action: string, entityId: string, detail: string) {
  if (!actor) return;
  auditSeq += 1;
  await repository.recordAuditEvent({
    id: `AE-SRC-${Date.now()}-${auditSeq}`,
    module: 'Data Ingestion',
    action,
    entity: 'Load Batch',
    entityId,
    userId: actor.id,
    userName: actor.name,
    role: actor.role as never,
    outcome: 'Success',
    detail,
    recordedAt: new Date().toISOString(),
  });
}

/** Send a checked file to its source's lobby: the load is recorded as Staged and its parsed rows kept until someone admits or rejects it. */
export async function sendToLobby(check: FileCheck, actor: Actor | null): Promise<StagedBatch> {
  const staged: StagedBatch = {
    id: check.batch.id,
    affiliateCode: check.source.affiliateCode,
    domain: check.source.domain,
    asOfDate: check.asOfDate,
    batch: check.batch,
    positions: check.positions,
    rows: check.records,
    check: compactCheck(check),
    sourceId: check.source.id,
    checksum: check.checksum,
    savedAt: new Date().toISOString(),
  };
  await repository.upsertBatch(staged.batch);
  await repository.upsertStagedBatch(staged);
  await audit(
    actor,
    'Send to lobby',
    staged.id,
    `${check.fileName} (${check.valid} row(s)) sent to the lobby of ${check.source.name}, as of ${check.asOfDate}`,
  );
  return staged;
}

export interface AdmitInput {
  source: DataSource;
  batch: LoadBatch;
  positions: Position[];
  records: unknown[];
  /** Required when the load replaces an already-admitted one for the same date (Positions, General ledger). */
  reason?: string | null;
  /** The lobby entry being admitted, removed once admitted. */
  stagedId?: string | null;
  /** An earlier load of this source that the new file replaces (withdrawn once this one is admitted). */
  replacesBatchId?: string | null;
}

export interface AdmitOutcome {
  batch: LoadBatch;
  /** Set when admitting completed a date that has both a ledger and positions: the ledger check's headline. */
  reconciliation: ReconciliationSummary | null;
  /** Reference data created from the file (products, GL accounts, org units, common COA, counterparties). */
  derived: DerivedSummary | null;
}

/** How many new members of each dimension an admitted file created. Existing members are never touched. */
export type DerivedSummary = Partial<Record<DimensionType, number>>;

const DIMENSION_WORDS: Partial<Record<DimensionType, [string, string]>> = {
  Product: ['product', 'products'],
  GlAccount: ['GL account', 'GL accounts'],
  OrgUnit: ['org unit', 'org units'],
  CommonCoa: ['common chart of accounts code', 'common chart of accounts codes'],
  Counterparty: ['counterparty', 'counterparties'],
};

/** "Created 8 products, 5 GL accounts, 4 org units from the file." - null when nothing was created. */
export function derivedSentence(d: DerivedSummary | null | undefined): string | null {
  if (!d) return null;
  const parts = (Object.entries(d) as Array<[DimensionType, number]>)
    .filter(([, n]) => n > 0)
    .map(([dim, n]) => {
      const w = DIMENSION_WORDS[dim] ?? [dim, dim];
      return `${n} ${n === 1 ? w[0] : w[1]}`;
    });
  return parts.length > 0 ? `Created ${parts.join(', ')} from the file.` : null;
}

/**
 * The derivation engine (teardown C4): products, GL accounts, org units, common chart of accounts codes and
 * counterparties a file uses but the affiliate does not have yet are created from the file. Existing members
 * are left exactly as they are.
 */
export async function deriveReferenceData(
  positions: Position[],
  affiliate: Pick<Affiliate, 'code' | 'name'>,
  asOfDate: string,
  actor: Actor | null,
): Promise<DerivedSummary> {
  const unmapped = await findUnmapped(positions, affiliate.code);
  return createMissingCodes(positions, unmapped, affiliate, asOfDate, actor);
}

/** GL accounts and org units a trial balance uses but the affiliate does not have yet. */
async function deriveFromLedger(
  lines: LedgerBalance[],
  affiliate: Pick<Affiliate, 'code' | 'name'>,
  actor: Actor | null,
): Promise<DerivedSummary> {
  const out: DerivedSummary = {};
  const asPositions = lines.map(
    (l) =>
      ({
        glAccountCode: l.glAccountCode,
        orgUnitCode: (l as { orgUnitCode?: string }).orgUnitCode ?? '',
      }) as unknown as Position,
  );
  for (const dimension of ['GlAccount', 'OrgUnit'] as const) {
    const existing = await repository.listDimensionMembers(dimension, affiliate.code);
    const codes = unmappedCodes(asPositions, dimension, existing);
    if (codes.length === 0) continue;
    const members = deriveMembersFromFile(dimension, codes, asPositions, affiliate.code, affiliate.name).filter(
      (m) => !existing.some((e) => e.code === m.code),
    );
    if (members.length === 0) continue;
    await repository.upsertDimensionMembers(members);
    out[dimension] = codes.length;
    await audit(
      actor,
      'Create codes',
      `${dimension}:${affiliate.code}`,
      `${codes.length} ${dimension} code(s) created from a general ledger file`,
    );
  }
  return out;
}

export interface ReconciliationSummary {
  asOfDate: string;
  accounts: number;
  outOfTolerance: number;
  totalVariance: number;
  canSignOff: boolean;
}

/** Default tolerances for the automatic ledger check; the GL source's reconciliation panel lets a user change them. */
export const DEFAULT_TOLERANCE = { amount: 1000, percent: 5 };

/** The kept copy of an admitted general-ledger file. */
export const ledgerCopyId = (batchId: string) => `LEDGER-${batchId}`;

/** The ledger lines of the current admitted general-ledger load for an affiliate and date, if any. */
export async function admittedLedger(
  affiliateCode: string,
  asOfDate: string,
  batches: LoadBatch[],
): Promise<{ batch: LoadBatch; lines: LedgerBalance[] } | null> {
  const gl = currentBatch(batches, affiliateCode, 'GeneralLedger', asOfDate);
  if (!gl) return null;
  const copies = await repository.listStagedBatches(affiliateCode);
  const copy = copies.find((s) => s.id === ledgerCopyId(gl.id));
  if (!copy) return null;
  return { batch: gl, lines: (copy.rows ?? []) as LedgerBalance[] };
}

/** The current admitted positions for an affiliate and date (every department's latest load). */
export async function admittedPositions(
  affiliateCode: string,
  asOfDate: string,
  batches: LoadBatch[],
): Promise<Position[]> {
  const ids = [
    currentBatch(batches, affiliateCode, 'Positions', asOfDate),
    ...ALL_CONTRIBUTORS.map((c) => currentBatch(batches, affiliateCode, 'Positions', asOfDate, c)),
  ]
    .filter((b): b is LoadBatch => b !== null)
    .map((b) => b.id);
  if (ids.length === 0) return [];
  return repository.queryPositions({ affiliateCode, asOfDate, batchIds: ids });
}

export function summarise(result: ReconciliationResult, asOfDate: string): ReconciliationSummary {
  return {
    asOfDate,
    accounts: result.lines.length,
    outOfTolerance: result.linesOutOfTolerance,
    totalVariance: result.totalVariance,
    canSignOff: result.canSignOff,
  };
}

async function autoReconcile(
  affiliate: Affiliate | undefined,
  asOfDate: string,
): Promise<ReconciliationSummary | null> {
  if (!affiliate) return null;
  const batches = await repository.listBatches(affiliate.code);
  const ledger = await admittedLedger(affiliate.code, asOfDate, batches);
  if (!ledger) return null;
  const positions = await admittedPositions(affiliate.code, asOfDate, batches);
  if (positions.length === 0) return null;
  const currency = affiliate.functionalCurrency;
  const result = reconcile(positions, ledger.lines, {
    reportingCurrency: currency,
    fx: identityFxTable(currency, asOfDate),
    level: 'GlAccount',
    toleranceAmount: DEFAULT_TOLERANCE.amount,
    tolerancePercent: DEFAULT_TOLERANCE.percent,
  });
  return summarise(result, asOfDate);
}

const TENOR_LABEL = (days: number) =>
  days % 365 === 0
    ? `${days / 365}Y`
    : days % 30 === 0
      ? `${days / 30}M`
      : days % 7 === 0
        ? `${days / 7}W`
        : `${days}D`;

async function writeCurves(points: CurvePointRow[], userName: string, loadId: string | null = null): Promise<number> {
  const existing = await repository.listYieldCurves();
  const groups = new Map<string, CurvePointRow[]>();
  for (const p of points) {
    const k = `${p.currency}|${p.curveCode}|${p.asOfDate}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const now = new Date().toISOString();
  for (const pts of groups.values()) {
    const { currency, curveCode, asOfDate } = pts[0]!;
    const match = existing.find((c) => c.currency === currency && c.code === curveCode && c.asOfDate === asOfDate);
    const byTenor = new Map((match?.terms ?? []).map((t) => [t.tenorDays, t]));
    for (const p of pts)
      byTenor.set(p.tenorDays, { tenorDays: p.tenorDays, label: TENOR_LABEL(p.tenorDays), ratePercent: p.ratePercent });
    const curve: StoredYieldCurve = {
      ...(match ?? {
        id: `IRC-${curveCode}-${asOfDate}`,
        code: curveCode,
        name: `${curveCode} curve`,
        currency,
        rateFormat: 'Zero Coupon',
        compoundingBasis: 'Annual',
        accrualBasis: 'Actual/365',
        isActive: true,
      }),
      asOfDate,
      terms: [...byTenor.values()].sort((a, b) => a.tenorDays - b.tenorDays),
      updatedBy: userName,
      updatedAt: now,
      loadId,
    } as StoredYieldCurve;
    await repository.upsertYieldCurve(curve);
  }
  return groups.size;
}

async function writeIndicators(
  rows: IndicatorSeriesRow[],
  userName: string,
  loadId: string | null = null,
): Promise<number> {
  const existing = await repository.listEconomicIndicators();
  const groups = new Map<string, IndicatorSeriesRow[]>();
  for (const r of rows) {
    const k = `${r.indicatorCode}|${r.countryCode ?? ''}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const now = new Date().toISOString();
  for (const obs of groups.values()) {
    const { indicatorCode, countryCode } = obs[0]!;
    const match = existing.find(
      (i) => i.code.toUpperCase() === indicatorCode && (!countryCode || i.countryCode.toUpperCase() === countryCode),
    );
    // Re-observing a date replaces it rather than duplicating - same rule as the series screen.
    const dates = new Set(obs.map((o) => o.asOfDate));
    const observations = [
      ...(match?.observations ?? []).filter((o) => !dates.has(o.asOfDate)),
      ...obs.map((o) => ({ asOfDate: o.asOfDate, value: o.value, loadId })),
    ].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
    const indicator: EconomicIndicator = match
      ? { ...match, observations, updatedBy: userName, updatedAt: now }
      : {
          id: `EI-${countryCode ?? 'GRP'}-${indicatorCode}`,
          code: indicatorCode,
          name: indicatorCode,
          countryCode: countryCode ?? '',
          frequency: 'Monthly',
          valueType: 'Percentage',
          unit: '%',
          observations,
          isActive: true,
          updatedBy: userName,
          updatedAt: now,
        };
    await repository.upsertEconomicIndicator(indicator);
  }
  return groups.size;
}

/**
 * Save project-stage rows straight to the reference tables: the one from the source screen exists inside
 * admitLoad, while these are rows a direct upload from the Market & reference data screen has already
 * split with splitMarketData. Reference data is a series, not a versioned load, so there is no lobby step -
 * the split already proved what is being written. One LoadBatch per domain is recorded so Data → History
 * and each domain's freshness screen show the load came from this file.
 */
export async function saveMarketDataRecords(
  records: MarketDataRecords,
  asOfDate: string,
  fileName: string,
  uploadedBy: string,
  replacesLoadId: string | null = null,
): Promise<{ fx: number; curves: number; indicators: number }> {
  const now = new Date().toISOString();
  const loadId = `MKT-${Date.now().toString(36).toUpperCase()}`;
  // A corrected file takes the wrong upload's rows out first - including dates the new file doesn't have.
  if (replacesLoadId) await removeMarketLoad(replacesLoadId, `Replaced by ${fileName}`, { name: uploadedBy });
  await Promise.all(
    records.fx.map((rate) =>
      repository.upsertFxRate({ ...rate, source: fileName, updatedBy: uploadedBy, updatedAt: now, loadId }),
    ),
  );
  const curvesWritten = records.curves.length > 0 ? await writeCurves(records.curves, uploadedBy, loadId) : 0;
  const indicatorsWritten =
    records.indicators.length > 0 ? await writeIndicators(records.indicators, uploadedBy, loadId) : 0;
  const domains = [
    { domain: 'FxRates' as const, rowCount: records.fx.length, note: 'FX rates' },
    { domain: 'MarketRates' as const, rowCount: records.curves.length, note: 'curve points' },
    { domain: 'EconomicIndicators' as const, rowCount: records.indicators.length, note: 'indicator observations' },
  ].filter((d) => d.rowCount > 0);
  for (const d of domains) {
    await repository.upsertBatch({
      ...referenceLoadBatch({
        domain: d.domain,
        affiliateCode: 'GROUP',
        asOfDate,
        label: `${fileName} - ${d.note}`,
        uploadedBy,
        rowCount: d.rowCount,
      }),
      marketLoadId: loadId,
    });
  }
  return { fx: records.fx.length, curves: curvesWritten, indicators: indicatorsWritten };
}

const MARKET_DOMAINS = new Set(['FxRates', 'MarketRates', 'EconomicIndicators', 'MarketData']);

/**
 * Takes one market-data upload back out: the FX rates, curves and indicator values it wrote are removed and
 * its load records are marked withdrawn. Rows a later upload overwrote belong to that upload and stay.
 */
export async function removeMarketLoad(
  loadId: string,
  reason: string,
  actor: Pick<Actor, 'name'> | null,
): Promise<void> {
  const [fx, curves, indicators, batches] = await Promise.all([
    repository.listFxRates(),
    repository.listYieldCurves(),
    repository.listEconomicIndicators(),
    repository.listBatches('GROUP'),
  ]);
  const now = new Date().toISOString();
  await Promise.all([
    ...fx.filter((r) => r.loadId === loadId).map((r) => repository.deleteFxRate(r.id)),
    ...curves.filter((c) => c.loadId === loadId).map((c) => repository.deleteYieldCurve(c.id)),
    ...indicators
      .filter((i) => i.observations.some((o) => o.loadId === loadId))
      .map((i) => {
        const observations = i.observations.filter((o) => o.loadId !== loadId);
        return observations.length > 0
          ? repository.upsertEconomicIndicator({ ...i, observations, updatedAt: now })
          : repository.deleteEconomicIndicator(i.id);
      }),
    ...batches
      .filter((b) => b.status === 'Committed' && (b.marketLoadId === loadId || b.id === loadId))
      .map((b) =>
        repository.upsertBatch({
          ...b,
          status: 'Superseded',
          supersededReason: `Withdrawn: ${reason}`,
          withdrawnBy: actor?.name ?? 'unknown',
          withdrawnAt: now,
          withdrawnReason: reason,
        }),
      ),
  ]);
}

/** Commit staged positions - the one position commit path (also behind useCommitBatch in lib/hooks.ts). */
export async function commitPositionsBatch(args: {
  batch: LoadBatch;
  positions: Position[];
  supersedes: LoadBatch | null;
  reason: string | null;
  committedBy: string;
}): Promise<LoadBatch> {
  const { batch, positions, supersedes, reason } = args;
  if (supersedes) await repository.upsertBatch({ ...supersedes, status: 'Superseded', supersededReason: reason });
  await repository.insertPositions(positions);
  const committed: LoadBatch = {
    ...batch,
    status: 'Committed',
    committedBy: args.committedBy,
    committedAt: new Date().toISOString(),
    supersedesBatchId: supersedes?.id ?? null,
    supersededReason: reason,
  };
  await repository.upsertBatch(committed);
  await repository.deleteStagedBatch(batch.id);
  return committed;
}

/**
 * Admit a load into the platform: positions through the ordinary commit (new version, superseding the
 * previous one for the same date and department), market data into its own tables, history into the
 * model-history store. Refuses a reload without a reason, and positions with codes not set up yet.
 */
export async function admitLoad(input: AdmitInput, actor: Actor | null): Promise<AdmitOutcome> {
  const { source } = input;
  const userName = actor?.name ?? 'unknown';
  const batches = await repository.listBatches(source.affiliateCode);
  const affiliate = (await repository.getAffiliate(source.affiliateCode)) ?? undefined;
  const asOfDate = input.batch.asOfDate;
  const now = new Date().toISOString();
  const reason = input.reason?.trim() || null;
  const label = SOURCE_DOMAIN_LABEL[source.domain];

  const finishCommitted = async (extra: Partial<LoadBatch> = {}): Promise<LoadBatch> => {
    const committed: LoadBatch = {
      ...input.batch,
      ...extra,
      status: 'Committed',
      committedBy: userName,
      committedAt: now,
      sourceId: source.id,
    };
    await repository.upsertBatch(committed);
    if (input.stagedId) await repository.deleteStagedBatch(input.stagedId);
    return committed;
  };

  let committed: LoadBatch;
  let reconciliation: ReconciliationSummary | null = null;
  let derived: DerivedSummary | null = null;

  switch (source.domain) {
    case 'Positions': {
      const plan = planSupersede(batches, source.affiliateCode, 'Positions', asOfDate, source.contributor);
      if (plan.superseded && !reason) {
        throw new Error(`${source.name} already has data admitted for ${asOfDate}. Give a reason for the reload.`);
      }
      // New products, GL accounts, org units, common COA codes and counterparties are created from the file -
      // never a reason to refuse it.
      derived = affiliate ? await deriveReferenceData(input.positions, affiliate, asOfDate, actor) : null;
      // The id stays as uploaded (every staged position already points at it); only the version moves on.
      committed = await commitPositionsBatch({
        batch: { ...input.batch, version: plan.nextVersion, sourceId: source.id },
        positions: input.positions,
        supersedes: plan.superseded,
        reason: plan.superseded ? reason : null,
        committedBy: userName,
      });
      if (input.stagedId && input.stagedId !== input.batch.id) await repository.deleteStagedBatch(input.stagedId);
      reconciliation = await autoReconcile(affiliate, asOfDate);
      if (reconciliation) {
        await sendNotification(
          {
            affiliateCode: source.affiliateCode,
            kind: 'gl.committed',
            title: `Ledger check updated for ${affiliate?.name ?? source.affiliateCode} (${asOfDate})`,
            body: `${source.name} admitted. ${reconciliation.accounts} account(s) compared, ${reconciliation.outOfTolerance === 0 ? 'all within tolerance - ready for sign-off' : `${reconciliation.outOfTolerance} outside tolerance`}.`,
            link: '/data/operations?domain=GeneralLedger',
          },
          actor,
        );
      }
      break;
    }
    case 'GeneralLedger': {
      const plan = planSupersede(batches, source.affiliateCode, 'GeneralLedger', asOfDate);
      if (plan.superseded && !reason) {
        throw new Error(`A general ledger is already admitted for ${asOfDate}. Give a reason for the reload.`);
      }
      if (plan.superseded)
        await repository.upsertBatch({ ...plan.superseded, status: 'Superseded', supersededReason: reason });
      committed = await finishCommitted({
        version: plan.nextVersion,
        supersedesBatchId: plan.superseded?.id ?? null,
        supersededReason: plan.superseded ? reason : null,
      });
      // A trial balance has no table of its own; the admitted copy is kept so the ledger check can be re-run later.
      await repository.upsertStagedBatch({
        id: ledgerCopyId(committed.id),
        affiliateCode: source.affiliateCode,
        domain: 'GeneralLedger',
        asOfDate,
        batch: committed,
        positions: [],
        rows: input.records,
        sourceId: source.id,
        checksum: committed.checksum,
        savedAt: now,
        admitted: true,
      });
      if (affiliate) derived = await deriveFromLedger(input.records as LedgerBalance[], affiliate, actor);
      reconciliation = await autoReconcile(affiliate, asOfDate);
      await sendNotification(
        {
          affiliateCode: source.affiliateCode,
          kind: 'gl.committed',
          title: `General ledger admitted for ${affiliate?.name ?? source.affiliateCode} (${asOfDate})`,
          body: reconciliation
            ? `Ledger check: ${reconciliation.accounts} account(s) compared, ${reconciliation.outOfTolerance === 0 ? 'all within tolerance' : `${reconciliation.outOfTolerance} outside tolerance`}. Ready for sign-off.`
            : 'The ledger check runs once positions for the same date are admitted.',
          link: `/data/operations?source=${source.id}&tab=check`,
        },
        actor,
      );
      break;
    }
    case 'Counterparties':
      await repository.upsertDimensionMembers(input.records as DimensionMember[]);
      committed = await finishCommitted();
      break;
    case 'FxRates':
      await Promise.all(
        (input.records as StoredFxRate[]).map((rate) =>
          repository.upsertFxRate({
            ...rate,
            source: source.name,
            updatedBy: userName,
            updatedAt: now,
            loadId: input.batch.id,
          }),
        ),
      );
      committed = await finishCommitted({ marketLoadId: input.batch.id });
      await afterMarketDataLoad(
        { fileName: committed.fileName, asOfDate, fx: input.records as StoredFxRate[], curves: [], indicators: [] },
        actor,
      );
      break;
    case 'MarketRates':
      await writeCurves(input.records as CurvePointRow[], userName, input.batch.id);
      committed = await finishCommitted({ marketLoadId: input.batch.id });
      await afterMarketDataLoad(
        { fileName: committed.fileName, asOfDate, fx: [], curves: input.records as CurvePointRow[], indicators: [] },
        actor,
      );
      break;
    case 'EconomicIndicators':
      await writeIndicators(input.records as IndicatorSeriesRow[], userName, input.batch.id);
      committed = await finishCommitted({ marketLoadId: input.batch.id });
      await afterMarketDataLoad(
        {
          fileName: committed.fileName,
          asOfDate,
          fx: [],
          curves: [],
          indicators: input.records as IndicatorSeriesRow[],
        },
        actor,
      );
      break;
    case 'MarketData': {
      const content = (input.records[0] ?? { fx: [], curves: [], indicators: [] }) as MarketDataRecords;
      await Promise.all(
        content.fx.map((rate) =>
          repository.upsertFxRate({
            ...rate,
            source: source.name,
            updatedBy: userName,
            updatedAt: now,
            loadId: input.batch.id,
          }),
        ),
      );
      if (content.curves.length > 0) await writeCurves(content.curves, userName, input.batch.id);
      if (content.indicators.length > 0) await writeIndicators(content.indicators, userName, input.batch.id);
      committed = await finishCommitted({ marketLoadId: input.batch.id });
      await afterMarketDataLoad({ fileName: committed.fileName, asOfDate, ...content }, actor);
      break;
    }
    case 'BalanceHistory':
    case 'AccountHistory': {
      // The load's batch id doubles as the history upload id, so withdrawing the load removes exactly its rows.
      const meta = {
        uploadId: input.batch.id,
        fileName: input.batch.fileName,
        uploadedBy: input.batch.uploadedBy,
        uploadedAt: input.batch.uploadedAt,
      };
      if (source.domain === 'BalanceHistory')
        await repository.insertBalanceHistory(toStoredBalanceRows(input.records as BalanceObservation[], meta));
      else await repository.insertAccountHistory(toStoredAccountRows(input.records as AccountObservation[], meta));
      committed = await finishCommitted();
      break;
    }
  }

  const replacesId = input.replacesBatchId ?? input.batch.replacesBatchId ?? null;
  if (replacesId && replacesId !== committed.supersedesBatchId) {
    const old = (await repository.listBatches(source.affiliateCode)).find((b) => b.id === replacesId);
    if (old && old.status === 'Committed') await withdrawLoad(old, `Replaced by ${committed.fileName}`, actor);
  }

  await audit(
    actor,
    'Admit',
    committed.id,
    `${committed.fileName}: ${committed.rowsAccepted} row(s) of ${label.toLowerCase()} admitted for ${source.affiliateCode} as of ${asOfDate}` +
      (committed.supersedesBatchId ? `, replacing ${committed.supersedesBatchId}: ${reason}` : ''),
  );
  return { batch: committed, reconciliation, derived };
}

/** Reject a lobby entry with a reason: the attempt stays on record as Rejected. */
export async function rejectLoad(staged: StagedBatch, reason: string, actor: Actor | null): Promise<LoadBatch> {
  const rejected: LoadBatch = {
    ...staged.batch,
    status: 'Rejected',
    rejectedBy: actor?.name ?? 'unknown',
    rejectedAt: new Date().toISOString(),
    rejectedReason: reason,
  };
  await repository.upsertBatch(rejected);
  await repository.deleteStagedBatch(staged.id);
  await audit(actor, 'Reject', rejected.id, `${rejected.fileName} rejected from the lobby: ${reason}`);
  return rejected;
}

/**
 * Withdraw an admitted load with a reason. It stops counting (status Superseded, marked withdrawn), so
 * runs no longer pick it up; history rows, and the rates, curves and indicator values it wrote, are removed.
 */
export async function withdrawLoad(batch: LoadBatch, reason: string, actor: Actor | null): Promise<LoadBatch> {
  const now = new Date().toISOString();
  const withdrawn: LoadBatch = {
    ...batch,
    status: 'Superseded',
    supersededReason: `Withdrawn: ${reason}`,
    withdrawnBy: actor?.name ?? 'unknown',
    withdrawnAt: now,
    withdrawnReason: reason,
  };
  await repository.upsertBatch(withdrawn);
  if (MARKET_DOMAINS.has(batch.domain)) await removeMarketLoad(batch.marketLoadId ?? batch.id, reason, actor);
  if (batch.domain === 'BalanceHistory') await repository.deleteBalanceHistory(batch.affiliateCode, batch.id);
  if (batch.domain === 'AccountHistory') await repository.deleteAccountHistory(batch.affiliateCode, batch.id);
  if (batch.domain === 'GeneralLedger') await repository.deleteStagedBatch(ledgerCopyId(batch.id));
  await audit(actor, 'Withdraw', batch.id, `${batch.fileName} withdrawn: ${reason}`);
  return withdrawn;
}

/**
 * Sets up the products, GL accounts, org units, common chart of accounts codes and counterparties a positions
 * file uses but the affiliate doesn't have yet. Called automatically when a positions file is admitted.
 */
export async function createMissingCodes(
  positions: Position[],
  unmapped: Array<{ dimension: DimensionType; codes: string[] }>,
  affiliate: Pick<Affiliate, 'code' | 'name'>,
  asOfDate: string,
  actor: Actor | null,
): Promise<DerivedSummary> {
  const created: DerivedSummary = {};
  for (const { dimension, codes } of unmapped) {
    const existing =
      dimension === 'GlAccount' ? await repository.listDimensionMembers('GlAccount', affiliate.code) : [];
    // Existing members are never overwritten (the GL chart's root node may already be there).
    const members = deriveMembersFromFile(dimension, codes, positions, affiliate.code, affiliate.name, {
      includeCommonCoa: true,
    }).filter((m) => !existing.some((e) => e.code === m.code));
    if (members.length === 0) continue;
    await repository.upsertDimensionMembers(members);
    created[dimension] = codes.length;
    // Counterparties are a tracked feed of their own - record the load so the source shows it.
    if (dimension === 'Counterparty') {
      await repository.upsertBatch(
        referenceLoadBatch({
          domain: 'Counterparties',
          affiliateCode: affiliate.code,
          asOfDate,
          label: 'Created from a positions file',
          uploadedBy: actor?.name ?? 'unknown',
          rowCount: codes.length,
        }),
      );
    }
    await audit(
      actor,
      'Create codes',
      `${dimension}:${affiliate.code}`,
      `${codes.length} ${dimension} code(s) created from an uploaded file`,
    );
  }
  return created;
}
