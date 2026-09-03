import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { InfoButton } from '@/components/ui/InfoButton';
import { DownloadIcon } from '@/components/icons/Icons';
import { useAuth } from '@/context/AuthContext';
import {
  useAffiliates,
  useBatches,
  useCommitBatch,
  useDeleteStagedBatch,
  useDimensionMembers,
  usePositions,
  useSaveBatch,
  useSaveDimensionMembers,
  useStagedBatchFor,
  useSaveStagedBatch,
} from '@/lib/hooks';
import { importCounterparties, importPositions, type RowError } from '@/lib/csvImport';
import { readUploadAsCsvText, UPLOAD_ACCEPT } from '@/lib/fileImport';
import { applyFieldMapping } from '@/lib/fieldMapping';
import { DEFAULT_VALIDATION_RULES, validatePositions, type ValidationResult } from '@/engine/validation';
import { planSupersede, currentBatch, ALL_CONTRIBUTORS } from '@/engine/vintage';
import { downloadPositionTemplate } from '@/lib/positionTemplates';
import { downloadCsvTemplate } from '@/lib/csvTemplates';

const COUNTERPARTY_TEMPLATE_COLUMNS = ['code', 'name', 'sector', 'parentCode'];
const COUNTERPARTY_TEMPLATE_SAMPLE = ['CP-CORP-001', 'Example Corporate Client Ltd', 'Corporate', 'CP-ROOT'];
import { applyCodeMappings, deriveMembersFromFile, unmappedCodes } from '@/engine/dimensions';
import { referenceLoadBatch } from '@/lib/referenceBatch';
import { useConnectors } from '@/lib/connectorHooks';
import { useRules } from '@/lib/ruleHooks';
import { remediation, newId } from '@/lib/governanceHooks';
import type { CodeMappingRule, FieldMappingRule, ValidationRuleSet } from '@/engine/ruleTypes';
import type {
  Affiliate,
  DataDomain,
  DimensionMember,
  DimensionType,
  LoadBatch,
  Position,
  PositionContributor,
  Severity,
} from '@/engine/types';

// Hash of the file content, so a re-upload of the same bytes is detectable.
async function hashFile(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface Staged {
  batch: LoadBatch;
  positions: Position[];
  parseErrors: RowError[];
  ignoredColumns: string[];
}

interface StagedMembers {
  fileName: string;
  members: DimensionMember[];
  parseErrors: RowError[];
  ignoredColumns: string[];
}

export interface DataLoadPanelState {
  rowsStaged: number | null;
  parseErrors: number | null;
  validation: 'Blocked' | 'Passed' | null;
  balanceCheck: string | null;
}

export function DataLoadPanel({
  affiliate,
  domain,
  asOfDate,
  onCommitted,
  onStateChange,
}: {
  affiliate: Affiliate;
  domain: DataDomain;
  asOfDate: string;
  /** Fires once a batch actually commits - callers use this to advance a wizard step or refresh a status. */
  onCommitted?: (batch: LoadBatch) => void;
  /** Fires whenever the staged/validation state changes - lets a caller mirror it into its own header/metrics. */
  onStateChange?: (state: DataLoadPanelState) => void;
}) {
  const { user, hasPermission } = useAuth();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { data: connectors = [] } = useConnectors();
  const { data: validationRuleSets = [] } = useRules<ValidationRuleSet>('ValidationRule');
  const { data: allFieldMappings = [] } = useRules<FieldMappingRule>('FieldMapping');
  const { data: allCodeMappings = [] } = useRules<CodeMappingRule>('CodeMapping');
  const saveBatch = useSaveBatch();
  const raiseIssue = remediation.useSave();
  const commit = useCommitBatch();
  const saveStagedBatch = useSaveStagedBatch();
  const deleteStagedBatch = useDeleteStagedBatch();
  const saveGlAccounts = useSaveDimensionMembers('GlAccount');
  const saveOrgUnits = useSaveDimensionMembers('OrgUnit');
  const saveCounterparties = useSaveDimensionMembers('Counterparty');
  const fileInput = useRef<HTMLInputElement>(null);

  // A connector is the authoritative feed for its domain once it is actually live; manual upload is blocked
  // to avoid silently overriding it. A feed mapped to a connector that isn't live yet (Blocked/Planned/Retired)
  // has no live feed to override, so file upload stands in for it - matching the connector's own status reason.
  const feed = affiliate.feeds.find((f) => f.domain === domain);
  const feedConnector = feed?.mode === 'Connector' ? connectors.find((c) => c.id === feed.connectorId) : undefined;
  const uploadBlockedByConnector = feed?.mode === 'Connector' && feedConnector?.status === 'Available';
  const canUpload = hasPermission('data.configure') && !uploadBlockedByConnector;

  // Affiliate-specific validation overrides the Group default of the same kind, same as every other rule kind.
  const applicableValidationRules =
    validationRuleSets.find((s) => s.affiliateCode === affiliate.code)?.rules ??
    validationRuleSets.find((s) => s.affiliateCode === null)?.rules ??
    DEFAULT_VALIDATION_RULES;

  // Unlike validation (one active set per scope), a domain can have several source-system mappings
  // at once (e.g. Flexcube and a legacy export) - the uploader picks which one applies, if any.
  const applicableMappings = allFieldMappings.filter(
    (m) => m.domain === domain && m.isActive && (m.affiliateCode === affiliate.code || m.affiliateCode === null),
  );
  const [selectedMappingId, setSelectedMappingId] = useState('');
  const selectedMapping = applicableMappings.find((m) => m.id === selectedMappingId) ?? null;
  useEffect(() => setSelectedMappingId(''), [domain]);

  // Code mapping applies silently (no picker) - unlike field mapping it doesn't change how the file is
  // parsed, it just translates already-parsed codes, so there's no ambiguity for the uploader to resolve.
  // One rule per dimension: this affiliate's own fork if it has one, else the Group default.
  const applicableCodeMappings = (['OrgUnit', 'GlAccount', 'CommonCoa'] as const)
    .map((dim) => {
      const forDimension = allCodeMappings.filter((m) => m.dimension === dim && m.isActive);
      return forDimension.find((m) => m.affiliateCode === affiliate.code) ?? forDimension.find((m) => m.affiliateCode === null) ?? null;
    })
    .filter((m): m is CodeMappingRule => m !== null);

  // Which department this Positions upload represents - Loans, Deposits and Treasury each contribute an
  // independent slice of the same affiliate/date; the book is assembled from however many have submitted,
  // not received as one file. Irrelevant (and left unset) outside the Positions domain.
  const [contributor, setContributor] = useState<PositionContributor | ''>('');
  const [staged, setStaged] = useState<Staged | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [supersedeReason, setSupersedeReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [autoMapping, setAutoMapping] = useState(false);
  const [justCommitted, setJustCommitted] = useState<{ fileName: string; rowCount: number } | null>(null);
  // Set when the uploaded file itself couldn't be read (malformed JSON/XML/Excel) - distinct from
  // parseErrors, which are per-row problems in a file that was read successfully.
  const [fileError, setFileError] = useState<string | null>(null);

  // Counterparties is a flat dimension-member list, not a versioned/validated position batch - it gets its
  // own lightweight staging state rather than being forced through the position-shaped flow above.
  const [stagedMembers, setStagedMembers] = useState<StagedMembers | null>(null);
  const [savingMembers, setSavingMembers] = useState(false);
  const [membersSaved, setMembersSaved] = useState<{ fileName: string; count: number } | null>(null);

  // Resume a previously saved staging session so leaving mid-upload doesn't silently drop staged rows.
  const { data: resumable } = useStagedBatchFor(affiliate.code, domain, asOfDate, contributor || undefined);
  useEffect(() => {
    if (staged || !resumable) return;
    setStaged({ batch: resumable.batch, positions: resumable.positions, parseErrors: [], ignoredColumns: [] });
    if (resumable.batch.contributor) setContributor(resumable.batch.contributor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resuming is a one-shot hydration, not a sync effect
  }, [resumable]);

  // Loans, Deposits and Treasury each stage and commit independently (see the `contributor` comment
  // above) - checking the balance-sheet identity against just the file being staged would flag every
  // single-contributor upload as unbalanced, since one department's slice is never one-sided by itself.
  // It's checked against this contributor's file plus whatever the *other* contributors have already
  // committed for the same affiliate/date instead - the book as it will actually stand once this commits.
  const { data: existingPositions = [] } = usePositions(affiliate.code, asOfDate);
  const isPositionsDomain = domain === 'Positions';
  const otherContributorBatchIds = useMemo(() => {
    if (!isPositionsDomain) return new Set<string>();
    return new Set(
      ALL_CONTRIBUTORS.filter((c) => c !== contributor)
        .map((c) => currentBatch(batches, affiliate.code, 'Positions', asOfDate, c))
        .filter((b): b is LoadBatch => b !== null)
        .map((b) => b.id),
    );
  }, [batches, affiliate.code, asOfDate, isPositionsDomain, contributor]);

  // Even combined with what's already committed, the book can still be genuinely partial - e.g. Loans
  // arriving before Deposits or Treasury exist at all for this date. The identity only means anything
  // once every required department is in, so it's skipped (not failed) until this commit would complete
  // the set - matching positionBookReadiness's own notion of "complete" (engine/vintage.ts).
  const bookCompleteAfterCommit = useMemo(() => {
    if (!isPositionsDomain) return true;
    const required = affiliate.requiredContributors ?? ALL_CONTRIBUTORS;
    return required
      .filter((c) => c !== contributor)
      .every((c) => currentBatch(batches, affiliate.code, 'Positions', asOfDate, c) !== null);
  }, [batches, affiliate, asOfDate, isPositionsDomain, contributor]);

  // What the balance-sheet identity is actually checked against - see the balanceCheck state below,
  // which reports on this same set rather than each contributor's one-sided slice.
  const balancePositions = useMemo(() => {
    if (!staged) return [];
    if (!isPositionsDomain) return staged.positions;
    if (!bookCompleteAfterCommit) return [];
    return [...existingPositions.filter((p) => otherContributorBatchIds.has(p.batchId)), ...staged.positions];
  }, [staged, isPositionsDomain, bookCompleteAfterCommit, existingPositions, otherContributorBatchIds]);

  const validation: ValidationResult | null = useMemo(() => {
    if (!staged) return null;
    return validatePositions(
      staged.positions,
      { asOfDate, knownAffiliateCodes: affiliates.map((a) => a.code) },
      applicableValidationRules,
      balancePositions,
    );
  }, [staged, asOfDate, affiliates, applicableValidationRules, balancePositions]);

  // The book-level balance state a header/summary should actually show - distinct from `totals` below,
  // which is this contributor's own file and is never expected to balance on its own (see its note in
  // the JSX). Null while a Positions upload is still waiting on other departments, so a caller doesn't
  // report a false "unbalanced" alarm for one-sided data that was never going to balance alone.
  const balanceCheck: string | null = useMemo(() => {
    if (!staged) return null;
    if (isPositionsDomain && !bookCompleteAfterCommit) return null;
    const assets = balancePositions.filter((p) => p.category === 'Asset').reduce((s, p) => s + p.amount, 0);
    const liabilities = balancePositions.filter((p) => p.category === 'Liability').reduce((s, p) => s + p.amount, 0);
    const capital = balancePositions.filter((p) => p.category === 'Capital').reduce((s, p) => s + p.amount, 0);
    const difference = assets - (liabilities + capital);
    return Math.abs(difference) < 0.01 ? 'Balances' : `Out by ${difference.toFixed(0)}`;
  }, [staged, isPositionsDomain, bookCompleteAfterCommit, balancePositions]);

  const { data: orgUnits = [] } = useDimensionMembers('OrgUnit', affiliate.code);
  const { data: glAccounts = [] } = useDimensionMembers('GlAccount', affiliate.code);
  const { data: commonCoa = [] } = useDimensionMembers('CommonCoa', affiliate.code);
  const { data: counterparties = [] } = useDimensionMembers('Counterparty', affiliate.code);
  const knownMembers = useMemo(
    () => [...orgUnits, ...glAccounts, ...commonCoa, ...counterparties],
    [orgUnits, glAccounts, commonCoa, counterparties],
  );

  const unmapped = useMemo(() => {
    if (!staged) return [] as Array<{ dimension: string; codes: string[] }>;
    return (['OrgUnit', 'GlAccount', 'CommonCoa', 'Counterparty'] as const)
      .map((dimension) => ({ dimension, codes: unmappedCodes(staged.positions, dimension, knownMembers) }))
      .filter((x) => x.codes.length > 0);
  }, [staged, knownMembers]);

  const supersede = planSupersede(batches, affiliate.code, domain, asOfDate, contributor || undefined);

  const handleCounterpartyFile = async (file: File) => {
    setBusy(true);
    setMembersSaved(null);
    setFileError(null);
    try {
      let text: string;
      try {
        text = await readUploadAsCsvText(file);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'This file could not be read.');
        return;
      }
      const mappedText = selectedMapping ? applyFieldMapping(text, selectedMapping) : text;
      const result = importCounterparties(mappedText, affiliate.code);
      setStagedMembers({
        fileName: file.name,
        members: result.rows,
        parseErrors: result.errors,
        ignoredColumns: result.ignoredColumns,
      });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleSaveMembers = async () => {
    if (!stagedMembers || stagedMembers.members.length === 0) return;
    setSavingMembers(true);
    try {
      await saveCounterparties.mutateAsync(stagedMembers.members);
      setMembersSaved({ fileName: stagedMembers.fileName, count: stagedMembers.members.length });
      setStagedMembers(null);
    } finally {
      setSavingMembers(false);
    }
  };

  const handleFile = async (file: File) => {
    if (domain === 'Counterparties') {
      await handleCounterpartyFile(file);
      return;
    }
    if (domain === 'Positions' && !contributor) return; // guarded by the disabled file input below too
    setBusy(true);
    setJustCommitted(null);
    setFileError(null);
    try {
      let text: string;
      try {
        text = await readUploadAsCsvText(file);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'This file could not be read.');
        return;
      }
      // Hashed before mapping - "the same file re-uploaded" means the same source bytes, not the
      // same transformed output, so duplicate detection stays meaningful regardless of which
      // mapping (if any) was applied this time.
      const hash = await hashFile(text);
      const duplicate = batches.find(
        (b) => b.fileHash === hash && b.status === 'Committed' && b.contributor === (contributor || null),
      );
      const version = supersede?.nextVersion ?? 1;
      const idSuffix = domain === 'Positions' ? `${contributor}-${asOfDate}` : asOfDate;
      const batchId = `B-${affiliate.code}-${idSuffix}-v${version}`;
      const mappedText = selectedMapping ? applyFieldMapping(text, selectedMapping) : text;
      const result = importPositions(mappedText, {
        affiliateCode: affiliate.code,
        asOfDate,
        batchId,
        defaultCurrency: affiliate.functionalCurrency,
        defaultLegalEntityCode: affiliate.legalEntityCode,
      });
      const mappedPositions = applyCodeMappings(result.rows, applicableCodeMappings);

      // Lineage: which mapping rule version(s), if any, actually touched this batch's file - see
      // docs/DATA_MAPPING_PLAN.md's "source -> mapping version -> batch -> run -> report" chain.
      const appliedMappingRules = [
        ...(selectedMapping ? [selectedMapping] : []),
        ...applicableCodeMappings,
      ];
      const mappingRuleVersionsUsed =
        appliedMappingRules.length > 0
          ? Object.fromEntries(appliedMappingRules.map((r) => [r.id, r.version]))
          : undefined;

      setStaged({
        batch: {
          id: batchId,
          affiliateCode: affiliate.code,
          domain,
          contributor: domain === 'Positions' ? (contributor as PositionContributor) : null,
          asOfDate,
          version,
          fileName: file.name,
          fileHash: hash,
          rowCount: result.rows.length + result.errors.length,
          rowsAccepted: result.rows.length,
          rowsRejected: result.errors.length,
          status: 'Staged',
          supersedesBatchId: null,
          supersededReason: duplicate ? `Identical file already committed as ${duplicate.id}` : null,
          uploadedBy: user?.name ?? 'unknown',
          uploadedAt: new Date().toISOString(),
          committedBy: null,
          committedAt: null,
          reconciledBy: null,
          reconciledAt: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectedReason: null,
          mappingRuleVersionsUsed,
        },
        positions: mappedPositions,
        parseErrors: result.errors,
        ignoredColumns: result.ignoredColumns,
      });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const editRow = (id: string, patch: Partial<Position>) => {
    setStaged((prev) =>
      prev ? { ...prev, positions: prev.positions.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : prev,
    );
  };

  const discardRow = (id: string) => {
    setStaged((prev) => (prev ? { ...prev, positions: prev.positions.filter((p) => p.id !== id) } : prev));
  };

  const handleCommit = () => {
    if (!staged || !validation || validation.blocked) return;
    commit.mutate(
      {
        batch: staged.batch,
        positions: staged.positions,
        supersedes: supersede?.superseded ?? null,
        reason: supersede?.superseded ? supersedeReason || null : null,
      },
      {
        onSuccess: () => {
          const committed = { ...staged.batch, status: 'Committed' as const };
          setJustCommitted({ fileName: staged.batch.fileName, rowCount: staged.positions.length });
          setStaged(null);
          setContributor('');
          onCommitted?.(committed);
        },
      },
    );
  };

  const handleSaveStaged = async () => {
    if (!staged) return;
    await saveBatch.mutateAsync(staged.batch);
    await saveStagedBatch.mutateAsync({
      id: staged.batch.id,
      affiliateCode: affiliate.code,
      domain,
      asOfDate,
      batch: staged.batch,
      positions: staged.positions,
      savedAt: new Date().toISOString(),
    });
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  const handleDiscard = () => {
    if (staged) {
      // A batch that failed a blocking rule stays on record as Rejected rather than vanishing without a
      // trace - a bank needs to know an upload was attempted and why it didn't make it in, not just that
      // there's no trace of it. A batch discarded before it ever failed validation just goes away.
      if (validation?.blocked && user) {
        const blocking = validation.exceptions.filter((e) => e.blocksCommit);
        const reason = blocking.map((e) => e.description).slice(0, 3).join('; ') || 'Failed blocking validation';
        void saveBatch.mutateAsync({
          ...staged.batch,
          status: 'Rejected',
          rejectedBy: user.name,
          rejectedAt: new Date().toISOString(),
          rejectedReason: reason,
        });

        // Wired automatically, same as Limits.tsx's auto-escalation on a new breach - a rejected batch
        // shouldn't depend on someone remembering to raise it manually to get tracked toward resolution.
        const severityRank: Record<Severity, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };
        const worst = blocking.reduce<Severity>(
          (worstSoFar, e) => (severityRank[e.severity] > severityRank[worstSoFar] ? e.severity : worstSoFar),
          'Low',
        );
        const now = new Date().toISOString();
        void raiseIssue.mutateAsync({
          id: newId('CR'),
          title: `Data upload rejected - ${staged.batch.fileName}`,
          description: reason,
          source: 'Data Upload',
          linkedLimitId: null,
          linkedBatchId: staged.batch.id,
          severity: worst,
          stage: 'Identified',
          owner: '',
          affiliateCode: affiliate.code,
          raisedBy: user.name,
          raisedAt: now,
          dueDate: null,
          closedAt: null,
          closureApprovedBy: null,
          updates: [{ at: now, by: user.name, stage: 'Identified', note: 'Auto-raised from a rejected data-upload batch.' }],
        });
      }
      void deleteStagedBatch.mutateAsync(staged.batch.id);
    }
    setStaged(null);
    setContributor('');
  };

  const autoMappable = unmapped.filter((u) => u.dimension !== 'CommonCoa');
  const dimensionSavers: Partial<Record<string, { mutateAsync: (m: DimensionMember[]) => Promise<void> }>> = {
    GlAccount: saveGlAccounts,
    OrgUnit: saveOrgUnits,
    Counterparty: saveCounterparties,
  };

  const handleAutoMap = async () => {
    if (!staged || autoMappable.length === 0) return;
    setAutoMapping(true);
    try {
      for (const { dimension, codes } of autoMappable) {
        const members = deriveMembersFromFile(
          dimension as DimensionType,
          codes,
          staged.positions,
          affiliate.code,
          affiliate.name,
        );
        await dimensionSavers[dimension]?.mutateAsync(members);
        // Counterparty is the one auto-mappable dimension Data Sources' freshness page actually tracks -
        // without recording a batch here, creating one this way (rather than through the Counterparty
        // Register's own "Register" button) would still leave that domain reading "Never loaded".
        if (dimension === 'Counterparty' && user) {
          saveBatch.mutate(
            referenceLoadBatch({
              domain: 'Counterparties',
              affiliateCode: affiliate.code,
              asOfDate,
              label: `Created from ${staged.batch.fileName}`,
              uploadedBy: user.name,
              rowCount: codes.length,
            }),
          );
        }
      }
    } finally {
      setAutoMapping(false);
    }
  };

  const totals = useMemo(() => {
    if (!staged) return null;
    const by = (c: string) => staged.positions.filter((p) => p.category === c).reduce((s, p) => s + p.amount, 0);
    const assets = by('Asset');
    const difference = assets - (by('Liability') + by('Capital'));
    return { assets, liabilities: by('Liability'), capital: by('Capital'), difference };
  }, [staged]);

  useEffect(() => {
    if (domain === 'Counterparties') {
      onStateChange?.({
        rowsStaged: stagedMembers ? stagedMembers.members.length : null,
        parseErrors: stagedMembers ? stagedMembers.parseErrors.length : null,
        validation: null,
        balanceCheck: null,
      });
      return;
    }
    onStateChange?.({
      rowsStaged: staged ? staged.positions.length : null,
      parseErrors: staged ? staged.parseErrors.length : null,
      validation: validation ? (validation.blocked ? 'Blocked' : 'Passed') : null,
      balanceCheck,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onStateChange is expected to be stable per caller; including it would re-fire on every parent render
  }, [domain, staged, validation, balanceCheck, stagedMembers]);

  const columns: ResultColumn<Position>[] = [
    { key: 'id', header: 'ID', render: (p) => <span className="font-mono text-[11px]">{p.id}</span> },
    { key: 'product', header: 'Product', render: (p) => <span className="text-navy-900">{p.productClass}</span> },
    {
      key: 'class',
      header: 'Class',
      render: (p) => <StatusBadge status={p.accountClass} tone={p.accountClass === 'Customer' ? 'info' : 'neutral'} />,
    },
    {
      key: 'gl',
      header: 'GL',
      render: (p) => <span className="font-mono text-[11px] text-gray-500">{p.glAccountCode}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (p) =>
        canUpload ? (
          <>
            <label htmlFor={`amt-${p.id}`} className="sr-only">
              Amount for {p.id}
            </label>
            <input
              id={`amt-${p.id}`}
              type="number"
              value={p.amount}
              onChange={(e) => editRow(p.id, { amount: Number(e.target.value) })}
              className="w-32 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
          </>
        ) : (
          <Amount value={p.amount} currency={p.currency} />
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) =>
        canUpload ? (
          <button
            type="button"
            onClick={() => discardRow(p.id)}
            className="text-[11px] font-bold text-danger hover:underline"
          >
            Discard
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      {uploadBlockedByConnector ? (
        <div className="mb-4 rounded-2xl border border-navy-100 bg-navy-50 p-4">
          <p className="text-[12px] font-bold text-navy-900">
            {domain} is fed by {feedConnector?.name ?? 'a configured connector'}, not manual upload
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-navy-900/80">
            This affiliate&rsquo;s connectivity configuration declares a connector as the authoritative source for this
            domain. Data is expected to arrive from it directly - uploading a file here would let it silently override
            what the connector delivers. To upload manually instead, switch this domain to File substitution in
            Connectivity (Step 3 of onboarding, or Connectors &amp; Data Sources).
          </p>
        </div>
      ) : (
        <div className="mb-4 space-y-3">
          {domain === 'Positions' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <label htmlFor="up-contributor" className="mb-2 flex items-center gap-1.5 text-[11px] text-gray-600">
                Contributing department
                <InfoButton label="What is a contributing department">
                  The internal desk submitting this file - not the source system the data came from.
                </InfoButton>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  id="up-contributor"
                  value={contributor}
                  onChange={(e) => setContributor(e.target.value as PositionContributor | '')}
                  disabled={!!staged}
                  className="rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
                >
                  <option value="">- select department -</option>
                  {ALL_CONTRIBUTORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {contributor && (
                  <button
                    type="button"
                    onClick={() => downloadPositionTemplate(contributor)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-700 hover:border-navy-700 hover:bg-navy-50"
                  >
                    Download {contributor} CSV template
                  </button>
                )}
              </div>
            </div>
          )}

          {applicableMappings.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <label htmlFor="up-mapping" className="mb-2 flex items-center gap-1.5 text-[11px] text-gray-600">
                Source format
                <InfoButton label="What is a field mapping">
                  A stored translation from a source system&rsquo;s own column names into this platform&rsquo;s
                  canonical ones — configured under this affiliate&rsquo;s Settings, Business Rules, Field Mappings.
                  Leave this on Canonical for a file that already uses the expected column names.
                </InfoButton>
              </label>
              <select
                id="up-mapping"
                value={selectedMappingId}
                onChange={(e) => setSelectedMappingId(e.target.value)}
                disabled={!!staged}
                className="rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
              >
                <option value="">Canonical (no mapping)</option>
                {applicableMappings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.sourceSystem || m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (canUpload && !busy && !(domain === 'Positions' && !contributor)) setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (!canUpload || busy || (domain === 'Positions' && !contributor)) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              dragActive ? 'border-navy-700 bg-navy-50' : 'border-gray-200 bg-gray-50/50 hover:border-navy-300'
            }`}
          >
            <DownloadIcon className="mb-2 h-6 w-6 rotate-180 text-gray-400" aria-hidden="true" />
            <p className="text-[12px] font-bold text-navy-900">
              Drag a file here, or{' '}
              <label htmlFor={`up-file-${domain}`} className="cursor-pointer text-navy-700 underline hover:text-navy-900">
                browse
              </label>
            </p>
            <p className="mt-1 text-[11px] text-gray-500">CSV, Excel, JSON or XML - {domain}</p>
            <input
              id={`up-file-${domain}`}
              ref={fileInput}
              type="file"
              accept={UPLOAD_ACCEPT}
              disabled={!canUpload || busy || (domain === 'Positions' && !contributor)}
              title={domain === 'Positions' && !contributor ? 'Select the contributing department first' : undefined}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </div>
          {fileError && <p className="max-w-xs text-[11px] text-red-700">{fileError}</p>}
          <div>
            {domain === 'Counterparties' && (
              <button
                type="button"
                onClick={() =>
                  downloadCsvTemplate(
                    COUNTERPARTY_TEMPLATE_COLUMNS,
                    COUNTERPARTY_TEMPLATE_SAMPLE,
                    'counterparties_template.csv',
                  )
                }
                className="block text-[10px] font-bold text-navy-700 hover:underline"
              >
                Download CSV template
              </button>
            )}
          </div>
          {busy && <span className="text-[12px] text-gray-400">Parsing…</span>}
          {!staged && !busy && !justCommitted && (
            <span className="text-[11px] text-gray-400">
              As of {asOfDate} · {affiliate.name}
            </span>
          )}
        </div>
      )}

      {domain === 'Counterparties' ? (
        <>
          {membersSaved && !stagedMembers && (
            <div role="status" className="mb-4 rounded-lg bg-success-bg px-4 py-3 text-[12px] text-success">
              <span className="font-bold">✓ Saved.</span> {membersSaved.fileName} - {membersSaved.count} counterpart
              {membersSaved.count === 1 ? 'y' : 'ies'} registered.
            </div>
          )}

          {stagedMembers && (
            <>
              {stagedMembers.ignoredColumns.length > 0 && (
                <div role="status" className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[12px] text-navy-900">
                  <span className="font-bold">Columns not used:</span> {stagedMembers.ignoredColumns.join(', ')}.
                </div>
              )}

              {stagedMembers.parseErrors.length > 0 && (
                <section className="mb-4 rounded-2xl border border-danger/20 bg-danger-bg p-6">
                  <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-danger">
                    Parse errors ({stagedMembers.parseErrors.length})
                  </h2>
                  <ul className="space-y-1 text-[12px] text-gray-700">
                    {stagedMembers.parseErrors.slice(0, 20).map((e, i) => (
                      <li key={`${e.line}-${e.column}-${i}`}>
                        <span className="font-mono">line {e.line}</span> · <span className="font-bold">{e.column}</span>{' '}
                        - {e.message}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                      Parsed counterparties - {stagedMembers.fileName}
                    </h2>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {stagedMembers.members.length} row{stagedMembers.members.length === 1 ? '' : 's'} ready to
                      register - re-uploading a code already on file updates it rather than duplicating it.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStagedMembers(null)}
                      className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveMembers()}
                      disabled={!canUpload || savingMembers || stagedMembers.members.length === 0}
                      className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                    >
                      {savingMembers
                        ? 'Saving…'
                        : `Register ${stagedMembers.members.length} counterpart${stagedMembers.members.length === 1 ? 'y' : 'ies'}`}
                    </button>
                  </div>
                </div>

                <ResultTable
                  rows={stagedMembers.members.slice(0, 200)}
                  rowKey={(m) => m.id}
                  columns={[
                    {
                      key: 'code',
                      header: 'Code',
                      render: (m) => <span className="font-mono text-[11px] text-gray-500">{m.code}</span>,
                    },
                    { key: 'name', header: 'Name', render: (m) => <span className="text-navy-900">{m.name}</span> },
                    {
                      key: 'sector',
                      header: 'Sector',
                      render: (m) => <span className="text-gray-600">{String(m.attributes?.sector ?? '-')}</span>,
                    },
                  ]}
                />
                {stagedMembers.members.length > 200 && (
                  <p className="mt-2 text-[11px] text-gray-400">
                    Showing the first 200 of {stagedMembers.members.length} rows.
                  </p>
                )}
              </section>
            </>
          )}

          {!stagedMembers && !membersSaved && !uploadBlockedByConnector && (
            <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="text-[13px] font-bold text-navy-900">No file staged for Counterparties</p>
              <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
                Upload a CSV above, or register one at a time from the Counterparty Register screen.
              </p>
            </section>
          )}
        </>
      ) : (
        <>
          {justCommitted && !staged && (
            <div role="status" className="mb-4 rounded-lg bg-success-bg px-4 py-3 text-[12px] text-success">
              <span className="font-bold">✓ Committed.</span> {justCommitted.fileName} - {justCommitted.rowCount} row
              {justCommitted.rowCount === 1 ? '' : 's'} for {domain}.
            </div>
          )}

          {supersede?.superseded && !staged && (
            <div className="mb-4 rounded-lg bg-warning-bg px-4 py-3">
              <p className="text-[12px] text-warning">
                <span className="font-bold">
                  {contributor
                    ? `${contributor} already has committed data for this date.`
                    : 'This as-of date already has committed data.'}
                </span>{' '}
                Uploading creates version {supersede.nextVersion} and supersedes {supersede.superseded.id}
                {contributor ? ` - only ${contributor}'s prior submission, not other departments'.` : '.'}
              </p>
            </div>
          )}

          {staged && supersede?.superseded && (
            <div className="mb-4 rounded-lg bg-warning-bg px-4 py-3">
              <label htmlFor={`supersede-reason-${domain}`} className="mb-1 block text-[11px] font-bold text-warning">
                Reason for the reload (required)
              </label>
              <input
                id={`supersede-reason-${domain}`}
                value={supersedeReason}
                onChange={(e) => setSupersedeReason(e.target.value)}
                placeholder="Restated after month-end adjustments"
                className="w-full rounded border border-warning/30 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
              />
            </div>
          )}

          {staged && (
            <>
              {staged.ignoredColumns.length > 0 && (
                <div role="status" className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[12px] text-navy-900">
                  <span className="font-bold">Columns not used:</span> {staged.ignoredColumns.join(', ')}.
                </div>
              )}

              {staged.parseErrors.length > 0 && (
                <section className="mb-4 rounded-2xl border border-danger/20 bg-danger-bg p-6">
                  <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-danger">
                    Parse errors ({staged.parseErrors.length})
                  </h2>
                  <ul className="space-y-1 text-[12px] text-gray-700">
                    {staged.parseErrors.slice(0, 20).map((e, i) => (
                      <li key={`${e.line}-${e.column}-${i}`}>
                        <span className="font-mono">line {e.line}</span> · <span className="font-bold">{e.column}</span>{' '}
                        - {e.message}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {validation && validation.exceptions.length > 0 && (
                <section className="mb-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                      Validation exceptions ({validation.exceptions.length})
                    </h2>
                    <StatusBadge
                      status={validation.blocked ? 'Commit blocked' : 'Advisory only'}
                      tone={validation.blocked ? 'danger' : 'warning'}
                    />
                  </div>
                  <ResultTable
                    rows={validation.exceptions.slice(0, 30)}
                    rowKey={(e) => e.id}
                    rowTone={(e) =>
                      e.severity === 'Critical' || e.severity === 'High' ? 'danger' : 'warning'
                    }
                    columns={[
                      {
                        key: 'rule',
                        header: 'Rule',
                        render: (e) => <span className="text-navy-900">{e.ruleName}</span>,
                      },
                      {
                        key: 'severity',
                        header: 'Severity',
                        sortValue: (e) => e.severity,
                        render: (e) => (
                          <StatusBadge
                            status={e.severity}
                            tone={e.severity === 'Critical' || e.severity === 'High' ? 'danger' : 'warning'}
                          />
                        ),
                      },
                      {
                        key: 'row',
                        header: 'Row',
                        render: (e) => (
                          <span className="font-mono text-[11px] text-gray-500">{e.positionId ?? '-'}</span>
                        ),
                      },
                      {
                        key: 'description',
                        header: 'Description',
                        render: (e) => <span className="text-gray-600">{e.description}</span>,
                      },
                    ]}
                  />
                </section>
              )}

              {unmapped.length > 0 && (
                <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[12px] text-navy-900">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="font-bold">Unmapped codes - must be created before commit:</span>
                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                      <Link
                        href={`/affiliates/${affiliate.code}/settings?section=rule-CodeMapping`}
                        className="text-[11px] font-bold text-navy-700 hover:underline"
                      >
                        Configure code mapping →
                      </Link>
                      {autoMappable.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleAutoMap()}
                          disabled={!canUpload || autoMapping}
                          className="rounded-lg bg-navy-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                        >
                          {autoMapping ? 'Mapping…' : 'Create these from the file'}
                        </button>
                      )}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {unmapped.map((u) => (
                      <li key={u.dimension}>
                        <span className="font-bold">{u.dimension}</span>
                        {u.dimension === 'CommonCoa' && (
                          <span className="text-[11px] text-gray-500"> - fix in source file, not auto-created</span>
                        )}
                        <span className="ml-1 font-mono text-[11px]">{u.codes.join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                      Staged rows - {staged.batch.fileName}
                      {staged.batch.contributor && (
                        <span className="ml-2 font-normal text-gray-400">({staged.batch.contributor})</span>
                      )}
                    </h2>
                    <p className="mt-1 text-[11px] text-gray-500">
                      Version {staged.batch.version} · hash <span className="font-mono">{staged.batch.fileHash}</span> ·
                      editable until committed
                      {resumable && ' · resumed from a previous "Save as staged"'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDiscard}
                      className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
                    >
                      Discard batch
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveStaged()}
                      disabled={saveStagedBatch.isPending}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                    >
                      {justSaved ? 'Saved ✓' : saveStagedBatch.isPending ? 'Saving…' : 'Save as staged'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCommit}
                      disabled={
                        !canUpload ||
                        commit.isPending ||
                        validation?.blocked === true ||
                        unmapped.length > 0 ||
                        (supersede?.superseded !== null &&
                          supersede?.superseded !== undefined &&
                          !supersedeReason.trim())
                      }
                      className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                      title={validation?.blocked ? 'Resolve the blocking exceptions first' : undefined}
                    >
                      {commit.isPending ? 'Committing…' : 'Commit batch'}
                    </button>
                  </div>
                </div>

                {totals && (
                  <div className="mb-4">
                    <dl className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-4">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Assets</dt>
                        <dd>
                          <Amount value={totals.assets} currency={affiliate.functionalCurrency} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Liabilities</dt>
                        <dd>
                          <Amount value={totals.liabilities} currency={affiliate.functionalCurrency} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Capital</dt>
                        <dd>
                          <Amount value={totals.capital} currency={affiliate.functionalCurrency} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">A − (L + C)</dt>
                        <dd
                          className={
                            domain === 'Positions'
                              ? 'text-gray-500'
                              : Math.abs(totals.difference) < 0.01
                                ? 'text-success'
                                : 'text-danger'
                          }
                        >
                          <Amount value={totals.difference} currency={affiliate.functionalCurrency} />
                        </dd>
                      </div>
                    </dl>
                    {domain === 'Positions' && (
                      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                        This is {contributor || 'this department'}&rsquo;s contribution only - a single
                        department&rsquo;s slice is not expected to balance on its own. The combined book, once every
                        department has submitted, is checked against the general ledger in{' '}
                        <Link
                          href="/data/operations/gl-reconciliation"
                          className="font-bold text-navy-700 hover:underline"
                        >
                          GL Reconciliation
                        </Link>
                        , not here.
                      </p>
                    )}
                  </div>
                )}

                <ResultTable
                  rows={staged.positions}
                  columns={columns}
                  rowKey={(p) => p.id}
                  emptyMessage="Every row was discarded."
                />
              </section>
            </>
          )}

          {!staged && !justCommitted && !uploadBlockedByConnector && (
            <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="text-[13px] font-bold text-navy-900">No batch staged for {domain}</p>
              <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
                Upload a file above to get started.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
