// Upload data: pick a source - or drop several files and let each go to the source whose fields its
// headers match - check every file before anything is saved, then send it to the source's lobby or
// admit it straight away. Nobody picks an affiliate here: the source says whose data it is.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { AsOfDateField } from './AsOfDateField';
import { DownloadIcon } from '@/components/icons/Icons';
import { useScope } from '@/context/ScopeContext';
import { readUploadAsCsvText, UPLOAD_ACCEPT } from '@/lib/fileImport';
import { fileHeaders, normHeader, routeFile, sourceKindLabel } from '@/lib/dataSources';
import {
  blockingCount,
  canAdmitNow,
  canSendToLobby,
  checkFile,
  derivedSentence,
  type DerivedSummary,
  type FileCheck,
  type ReconciliationSummary,
} from '@/lib/sourceIngest';
import { sourceForLoad, useAdmitLoad, useCanMapColumns, useCheckEnv, useSendToLobby } from '@/lib/sourceHooks';
import { repository } from '@/store/repositoryInstance';
import { ColumnMapping } from './ColumnMapping';
import { useAffiliates } from '@/lib/hooks';
import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/cn';
import { btn, FieldChip, inputCls, Notice, StatTiles } from './sourceUi';
import type { DataSource, LoadBatch } from '@/engine/types';

interface PickedFile {
  key: string;
  fileName: string;
  rawText: string;
  sourceId: string | null;
  asOfOverride: string;
  check: FileCheck | null;
  checking: boolean;
  readError: string | null;
  reason: string;
  /** An earlier load of the same source this file replaces; undefined = the suggested one (same file name). */
  replacesId?: string | null;
  outcome:
    | { kind: 'lobby' | 'admitted'; reconciliation: ReconciliationSummary | null; derived?: DerivedSummary | null }
    | { kind: 'error'; message: string }
    | null;
}

/**
 * Whether a checked file still needs its columns confirmed: a required field has no column, or the file has
 * headers nobody has confirmed for this source yet. Once a mapping is saved for these headers, later uploads
 * apply it without asking.
 */
export function needsMapping(c: FileCheck): boolean {
  if (c.headerMatch.missingRequired.length > 0) return true;
  if (c.ignoredColumns.length === 0) return false;
  const confirmed = new Set(c.source.mappedHeaders ?? []);
  return c.ignoredColumns.some((h) => !confirmed.has(normHeader(h)));
}

/** The source's last admitted load before this file - what the diff compares against. */
function previousLoad(c: FileCheck, batches: LoadBatch[]): LoadBatch | null {
  const same = batches.filter(
    (b) =>
      b.status === 'Committed' &&
      b.affiliateCode === c.source.affiliateCode &&
      b.domain === c.source.domain &&
      (b.sourceId
        ? b.sourceId === c.source.id
        : c.source.domain !== 'Positions' || (b.contributor ?? null) === (c.source.contributor ?? null)),
  );
  return (
    [...same].sort((a, b) => b.asOfDate.localeCompare(a.asOfDate) || b.uploadedAt.localeCompare(a.uploadedAt))[0] ??
    null
  );
}

const AUTO = '__auto__';

export function sourceLabel(s: DataSource, groupView: boolean, affiliateName?: string): string {
  return groupView ? `${affiliateName ?? s.affiliateCode} · ${s.name}` : s.name;
}

export function UploadDataModal({
  sources,
  initialSourceId,
  groupView,
  pickDate = false,
  onClose,
}: {
  /** Sources this user may upload to (already scoped to them). */
  sources: DataSource[];
  initialSourceId?: string | null;
  groupView: boolean;
  /** Show the As-of date picker here - in onboarding, where the header with its date picker is not shown. */
  pickDate?: boolean;
  onClose: () => void;
}) {
  // The working date from the header is the default as-of date; a date in the file itself wins.
  const { asOfDate: scopeDate, asOfDateChosen, affiliateCode: scopeCode } = useScope();
  // One date for every upload: the As-of date chosen in the header.
  const workingDate = asOfDateChosen ? scopeDate : null;
  const { data: affiliates = [] } = useAffiliates();
  const env = useCheckEnv();
  const send = useSendToLobby();
  const admit = useAdmitLoad();
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadable = useMemo(() => sources.filter((s) => s.isActive), [sources]);
  const [chosen, setChosen] = useState<string>(
    initialSourceId && uploadable.some((s) => s.id === initialSourceId)
      ? initialSourceId
      : uploadable.length === 1
        ? uploadable[0]!.id
        : AUTO,
  );
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const affName = (code: string) => affiliates.find((a) => a.code === code)?.name ?? code;
  const label = (s: DataSource) => sourceLabel(s, groupView, affName(s.affiliateCode));
  // A mapping saved in this drawer applies straight away, before the sources list refetches.
  const savedSources = useRef<Record<string, DataSource>>({});

  const runCheck = async (f: PickedFile): Promise<PickedFile> => {
    const source = f.sourceId
      ? (savedSources.current[f.sourceId] ?? uploadable.find((s) => s.id === f.sourceId))
      : undefined;
    if (!source || f.readError) return { ...f, check: null, checking: false };
    const check = await checkFile(source, f.fileName, f.rawText, env, {
      asOfDate: workingDate ?? undefined,
      defaultAsOfDate: scopeDate ?? undefined,
    });
    return { ...f, check, checking: false };
  };

  const update = (key: string, patch: Partial<PickedFile>) =>
    setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const recheck = async (key: string, patch: Partial<PickedFile> = {}) => {
    const current = files.find((f) => f.key === key);
    if (!current) return;
    const next = { ...current, ...patch, checking: true, outcome: null };
    update(key, next);
    const checked = await runCheck(next);
    update(key, checked);
  };

  // Re-check when the lobby/loads change underneath (e.g. after creating missing codes).
  const envKey = `${env.batches.length}:${env.lobby.length}`;
  useEffect(() => {
    if (files.length === 0) return;
    void Promise.all(files.filter((f) => !f.outcome).map(runCheck)).then((checked) =>
      setFiles((prev) => prev.map((f) => checked.find((c) => c.key === f.key) ?? f)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the stored loads change
  }, [envKey]);

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const picked: PickedFile[] = [];
    for (const file of Array.from(list)) {
      let rawText = '';
      let readError: string | null = null;
      try {
        rawText = await readUploadAsCsvText(file);
      } catch (err) {
        readError = err instanceof Error ? err.message : 'This file could not be read.';
      }
      // Smart drop zone: route by the file's name (loans / deposits / treasury / gl / history / market) and
      // then its headers. A file routed by name whose columns don't all match is mapped inline below.
      const routed =
        chosen !== AUTO && list.length === 1
          ? (uploadable.find((s) => s.id === chosen) ?? null)
          : routeFile(file.name, fileHeaders(rawText), uploadable, scopeCode);
      // A market-data workbook keeps FX rates, curves and policy rates on separate sheets - read them all.
      if (routed?.domain === 'MarketData' && !readError && /\.xlsx?$/i.test(file.name)) {
        try {
          rawText = await readUploadAsCsvText(file, { allSheets: true });
        } catch (err) {
          readError = err instanceof Error ? err.message : 'This file could not be read.';
        }
      }
      picked.push({
        key: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fileName: file.name,
        rawText,
        sourceId: routed?.id ?? (chosen !== AUTO ? chosen : null),
        asOfOverride: '',
        check: null,
        checking: !readError,
        readError,
        reason: '',
        outcome: null,
      });
    }
    setFiles((prev) => [...prev, ...picked]);
    const checked = await Promise.all(picked.map(runCheck));
    setFiles((prev) => prev.map((f) => checked.find((c) => c.key === f.key) ?? f));
    if (inputRef.current) inputRef.current.value = '';
  };

  /** Earlier admitted loads of the file's source for other dates - a wrong file it may be correcting. */
  const replaceOptions = (f: PickedFile): LoadBatch[] =>
    f.check
      ? env.batches
          .filter(
            (b) =>
              b.status === 'Committed' &&
              b.asOfDate !== f.check!.asOfDate &&
              sourceForLoad(b, [f.check!.source])?.id === f.check!.source.id,
          )
          .sort((a, z) => z.uploadedAt.localeCompare(a.uploadedAt))
      : [];
  const replacesFor = (f: PickedFile): string | null =>
    f.replacesId !== undefined ? f.replacesId : (replaceOptions(f).find((b) => b.fileName === f.fileName)?.id ?? null);

  useEffect(() => {
    const open = files.filter((f) => !f.outcome && f.sourceId && !f.readError);
    if (open.length === 0) return;
    void Promise.all(open.map(runCheck)).then((checked) =>
      setFiles((prev) => prev.map((f) => checked.find((c) => c.key === f.key) ?? f)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the date changes
  }, [workingDate]);

  const pending = files.filter((f) => !f.outcome || f.outcome.kind === 'error');
  const needsReason = (f: PickedFile) => !!f.check?.replaces && !f.reason.trim();
  const lobbyReady = workingDate ? pending.filter((f) => f.check && canSendToLobby(f.check)) : [];
  const admitReady = workingDate ? pending.filter((f) => f.check && canAdmitNow(f.check) && !needsReason(f)) : [];

  const submit = async (mode: 'lobby' | 'admit') => {
    setWorking(true);
    try {
      for (const f of mode === 'lobby' ? lobbyReady : admitReady) {
        const check = f.check!;
        try {
          // A source set to admit clean files straight away skips the lobby for a file with nothing to review.
          const autoAdmit =
            mode === 'lobby' && check.source.autoAdmit && canAdmitNow(check) && !needsReason(f) && check.flagged === 0;
          if (mode === 'lobby' && !autoAdmit) {
            // The replacement choice travels with the file, so admitting it from the lobby honours it.
            await send.mutateAsync({ ...check, batch: { ...check.batch, replacesBatchId: replacesFor(f) } });
            update(f.key, { outcome: { kind: 'lobby', reconciliation: null } });
          } else {
            const out = await admit.mutateAsync({
              source: check.source,
              batch: { ...check.batch, replacesBatchId: replacesFor(f) },
              positions: check.positions,
              records: check.records,
              reason: f.reason || null,
            });
            update(f.key, { outcome: { kind: 'admitted', reconciliation: out.reconciliation, derived: out.derived } });
          }
        } catch (err) {
          update(f.key, { outcome: { kind: 'error', message: err instanceof Error ? err.message : String(err) } });
        }
      }
    } finally {
      setWorking(false);
    }
  };

  const onMapped = (key: string, saved: DataSource) => {
    savedSources.current[saved.id] = saved;
    void recheck(key);
  };

  const noSources = uploadable.length === 0;

  return (
    <Modal
      title="Upload data"
      description="Files are checked first - nothing reaches calculations until it is admitted."
      onClose={onClose}
      wide="xl"
      footer={
        files.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-gray-500">
              {lobbyReady.length} of {pending.length} file{pending.length === 1 ? '' : 's'} ready
            </p>
            <div className="flex gap-2">
              <button type="button" className={btn.secondary} onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className={btn.secondary}
                disabled={working || lobbyReady.length === 0}
                onClick={() => void submit('lobby')}
              >
                Send to lobby{lobbyReady.length > 1 ? ` (${lobbyReady.length})` : ''}
              </button>
              <button
                type="button"
                className={btn.primary}
                disabled={working || admitReady.length === 0}
                onClick={() => void submit('admit')}
              >
                {working ? 'Working…' : `Upload & admit${admitReady.length > 1 ? ` (${admitReady.length})` : ''}`}
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {noSources ? (
        <Notice tone="info">There is no data source you can upload to yet. Ask an administrator to add one.</Notice>
      ) : (
        <div className="space-y-5">
          {pickDate ? (
            <AsOfDateField />
          ) : workingDate ? (
            <Notice tone="info">
              Every file is loaded as of {workingDate} - the As-of date at the top of the page.
            </Notice>
          ) : (
            <Notice tone="warning">
              Pick the As-of date at the top of the page first - every file is loaded as of that date.
            </Notice>
          )}
          <div>
            <label htmlFor="upload-source" className="mb-1 block text-[12px] font-bold text-gray-600">
              Where is this data going?
            </label>
            <select id="upload-source" className={inputCls} value={chosen} onChange={(e) => setChosen(e.target.value)}>
              {uploadable.length > 1 && <option value={AUTO}>Match each file to a source automatically</option>}
              {uploadable.map((s) => (
                <option key={s.id} value={s.id}>
                  {label(s)}
                </option>
              ))}
            </select>
            {chosen === AUTO && (
              <p className="mt-1 text-[12px] text-gray-500">
                Drop one or more files - each goes to the source whose columns it matches. You can change it below.
              </p>
            )}
          </div>

          <div
            role="button"
            tabIndex={0}
            data-tour="upload-drop"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void addFiles(e.dataTransfer.files);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
              dragging ? 'border-navy-700 bg-navy-50' : 'border-gray-200 bg-gray-50/50 hover:border-navy-300',
            )}
          >
            <DownloadIcon className="mb-2 h-6 w-6 rotate-180 text-gray-400" aria-hidden="true" />
            <p className="text-[13px] font-bold text-navy-900">Drag files here, or click to choose</p>
            <p className="mt-1 text-[12px] text-gray-500">CSV, Excel, JSON or XML</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              className="hidden"
              onChange={(e) => void addFiles(e.target.files)}
            />
          </div>

          {files.map((f) => (
            <FileCard
              key={f.key}
              file={f}
              sources={uploadable}
              label={label}
              onChangeSource={(id) => void recheck(f.key, { sourceId: id || null })}
              onReason={(r) => update(f.key, { reason: r })}
              replaceOptions={replaceOptions(f)}
              replacesId={replacesFor(f)}
              onReplaces={(id) => update(f.key, { replacesId: id })}
              onRemove={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
              onMapped={(saved) => onMapped(f.key, saved)}
              previous={f.check ? previousLoad(f.check, env.batches) : null}
              currency={affiliates.find((a) => a.code === f.check?.source.affiliateCode)?.functionalCurrency ?? 'USD'}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function FileCard({
  file: f,
  sources,
  label,
  onChangeSource,
  onReason,
  replaceOptions,
  replacesId,
  onReplaces,
  onRemove,
  onMapped,
  previous,
  currency,
}: {
  file: PickedFile;
  sources: DataSource[];
  label: (s: DataSource) => string;
  onChangeSource: (id: string) => void;
  onReason: (r: string) => void;
  replaceOptions: LoadBatch[];
  replacesId: string | null;
  onReplaces: (id: string | null) => void;
  onRemove: () => void;
  onMapped: (saved: DataSource) => void;
  previous: LoadBatch | null;
  currency: string;
}) {
  const c = f.check;
  const blocking = c ? blockingCount(c) : 0;
  const creatable = c?.unmapped ?? [];
  const [showIssues, setShowIssues] = useState(false);
  const canMap = useCanMapColumns(c?.source.affiliateCode);
  const mapping = !!c && !f.checking && needsMapping(c);
  const matchedColumns = c ? c.headers.length - c.ignoredColumns.length : 0;

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold text-navy-900">{f.fileName}</p>
          {c && <p className="text-[12px] text-gray-500">{sourceKindLabel(c.source)}</p>}
        </div>
        {!f.outcome && (
          <button type="button" className={btn.link} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

      {f.outcome?.kind === 'lobby' && c && (
        <div className="mt-3">
          <Notice tone="success">
            Sent to the lobby of {label(c.source)}.{' '}
            <Link href={`/data/operations?source=${c.source.id}&tab=lobby`} className="font-bold underline">
              Review it there
            </Link>
            , then admit it.
          </Notice>
        </div>
      )}
      {f.outcome?.kind === 'admitted' && c && (
        <div className="mt-3 space-y-2">
          <Notice tone="success">
            Admitted into {label(c.source)} as of {c.asOfDate} - {c.valid.toLocaleString()} row
            {c.valid === 1 ? '' : 's'}.
            {derivedSentence(f.outcome.derived) && <> {derivedSentence(f.outcome.derived)}</>}
          </Notice>
          {f.outcome.reconciliation && <ReconciliationNotice summary={f.outcome.reconciliation} currency={currency} />}
        </div>
      )}
      {f.outcome?.kind === 'error' && (
        <div className="mt-3">
          <Notice tone="danger">{f.outcome.message}</Notice>
        </div>
      )}

      {!f.outcome || f.outcome.kind === 'error' ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-400"
                htmlFor={`src-${f.key}`}
              >
                Source
              </label>
              <select
                id={`src-${f.key}`}
                className={inputCls}
                value={f.sourceId ?? ''}
                onChange={(e) => onChangeSource(e.target.value)}
              >
                <option value="">- choose a source -</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-400"
                htmlFor={`date-${f.key}`}
              >
                Data as of
              </label>
              <p id={`date-${f.key}`} className="py-1.5 text-[13px] font-bold text-navy-900">
                {c?.asOfDate ?? '-'}
              </p>
              {c && (
                <p className="mt-0.5 text-[11px] text-gray-500">
                  The As-of date in the header.
                  {c.fileDate && c.fileDate !== c.asOfDate && (
                    <span className="font-bold text-warning">
                      {' '}
                      The file says {c.fileDate} - it is loaded as {c.asOfDate}.
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {f.readError && <Notice tone="danger">{f.readError}</Notice>}
          {!f.readError && !f.sourceId && (
            <Notice tone="warning">
              No source matches this file&rsquo;s columns. Choose one above to see what is missing.
            </Notice>
          )}
          {f.checking && <p className="text-[12px] text-gray-400">Checking…</p>}

          {mapping && c && (
            <div className="rounded-lg border border-navy-700/20 bg-navy-50/40 p-3">
              <p className="mb-2 text-[13px] font-bold text-navy-900">
                {matchedColumns} of {c.headers.length} columns matched - confirm the rest
              </p>
              <p className="mb-3 text-[12px] text-gray-500">
                The first time a file arrives for {c.source.name}, check how its columns line up. The answer is saved,
                so later files with the same columns are read straight away.
              </p>
              {canMap ? (
                <ColumnMapping
                  key={`${c.source.id}-${c.headers.join('|')}`}
                  source={c.source}
                  initialSample={{ fileName: f.fileName, headers: c.headers }}
                  inline
                  saveLabel="Save and continue"
                  onSaved={onMapped}
                />
              ) : (
                <Notice tone="warning">Only someone who can upload for this affiliate can confirm the columns.</Notice>
              )}
            </div>
          )}

          {c && !f.checking && !mapping && !c.fileError && previous && (
            <LoadDiff check={c} previous={previous} currency={currency} />
          )}

          {c && !f.checking && (
            <>
              {c.fileError && !mapping ? (
                <Notice tone="danger">{c.fileError}</Notice>
              ) : c.fileError ? null : (
                <StatTiles
                  items={[
                    { label: 'Rows', value: c.rows },
                    { label: 'Valid', value: c.valid, tone: 'success' },
                    { label: 'Invalid', value: c.invalid, tone: c.invalid > 0 ? 'danger' : 'neutral' },
                    { label: 'Duplicates', value: c.duplicates, tone: c.duplicates > 0 ? 'warning' : 'neutral' },
                  ]}
                />
              )}
              <div className="flex flex-wrap gap-1">
                {c.headerMatch.fields
                  .filter((m) => m.header || m.required)
                  .map((m) => (
                    <FieldChip key={m.field} field={m.field} header={m.header} required={m.required} />
                  ))}
                {c.ignoredColumns.map((h) => (
                  <span
                    key={h}
                    title="Not one of this source's fields - ignored"
                    className="rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-400 line-through"
                  >
                    {h}
                  </span>
                ))}
              </div>

              {c.duplicateOf && (
                <Notice tone="danger">
                  This exact file is already {c.duplicateOf.status === 'Committed' ? 'admitted' : 'in the lobby'} (
                  {c.duplicateOf.fileName}, as of {c.duplicateOf.asOfDate}). Loading it again would count every row
                  twice. If it is a corrected file, change it, or withdraw the old one first.
                </Notice>
              )}

              {creatable.length > 0 && (
                <Notice tone="info">
                  New codes in this file are created for {c.source.affiliateCode} when it is admitted:{' '}
                  {creatable.map((u) => `${u.codes.length} ${u.dimension}`).join(', ')}. Existing ones are left as they
                  are.
                </Notice>
              )}

              {c.issues.length > 0 && (
                <div className="rounded-lg border border-gray-100 px-3 py-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left text-[13px]"
                    onClick={() => setShowIssues((v) => !v)}
                  >
                    <span>
                      {blocking > 0 ? (
                        <span className="font-bold text-danger">
                          {blocking} problem{blocking === 1 ? '' : 's'} must be fixed before admitting
                        </span>
                      ) : (
                        <span className="font-bold text-warning">Nothing blocking</span>
                      )}
                      <span className="text-gray-500">
                        {' '}
                        · {c.issues.length - blocking} note{c.issues.length - blocking === 1 ? '' : 's'} to review
                      </span>
                    </span>
                    <span className="text-[12px] font-bold text-navy-700">{showIssues ? 'Hide' : 'Show'}</span>
                  </button>
                  {showIssues && (
                    <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[12px]">
                      {c.issues.map((i, n) => (
                        <li key={n} className={i.blocking ? 'text-danger' : 'text-gray-600'}>
                          {i.line ? <span className="font-mono">line {i.line} · </span> : null}
                          {i.field && <span className="font-bold">{i.field}</span>} {i.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {replaceOptions.length > 0 && (
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <label htmlFor={`replaces-${f.key}`} className="mb-1 block text-[12px] font-bold text-navy-900">
                    Replaces an earlier upload of {c.source.name}
                  </label>
                  <select
                    id={`replaces-${f.key}`}
                    className={inputCls}
                    value={replacesId ?? ''}
                    onChange={(e) => onReplaces(e.target.value || null)}
                  >
                    <option value="">No - keep the earlier uploads</option>
                    {replaceOptions.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.fileName} - as of {b.asOfDate}
                      </option>
                    ))}
                  </select>
                  {replacesId && (
                    <p className="mt-1 text-[12px] text-warning">
                      That upload is withdrawn when this one is admitted - it stops counting, and stays in History.
                    </p>
                  )}
                </div>
              )}

              {c.replaces && (
                <div className="rounded-lg bg-warning-bg px-3 py-2">
                  <label htmlFor={`reason-${f.key}`} className="mb-1 block text-[12px] font-bold text-warning">
                    {c.source.name} already has data admitted for {c.asOfDate} ({c.replaces.fileName}). Admitting this
                    replaces it - why?
                  </label>
                  <input
                    id={`reason-${f.key}`}
                    className={inputCls}
                    value={f.reason}
                    onChange={(e) => onReason(e.target.value)}
                    placeholder="e.g. Restated after month-end adjustments"
                  />
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

/** "Last load (30 Jun 2026): 1,204 rows, NGN 3.1bn - this file: 1,231 rows (+27), NGN 3.3bn (+6.2%)". */
function LoadDiff({ check, previous, currency }: { check: FileCheck; previous: LoadBatch; currency: string }) {
  const isPositions = check.source.domain === 'Positions';
  const { data: prevTotal } = useQuery({
    queryKey: ['positions', 'batchTotal', previous.id],
    queryFn: async () =>
      (await repository.queryPositions({ affiliateCode: previous.affiliateCode, batchIds: [previous.id] })).reduce(
        (s, p) => s + p.amount,
        0,
      ),
    enabled: isPositions,
    staleTime: 5 * 60_000,
  });
  const total = isPositions ? check.positions.reduce((s, p) => s + p.amount, 0) : null;
  const rowDelta = check.valid - previous.rowsAccepted;
  const pct = total !== null && prevTotal ? ((total - prevTotal) / Math.abs(prevTotal)) * 100 : null;
  return (
    <p className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
      <span className="font-bold text-navy-900">Saved column mapping applied.</span> Compared with the last load (
      {previous.asOfDate}): {check.valid.toLocaleString()} rows ({rowDelta >= 0 ? '+' : ''}
      {rowDelta.toLocaleString()})
      {total !== null && prevTotal !== undefined && (
        <>
          , total {formatAmount(total, currency)}
          {pct !== null && ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`}
        </>
      )}
      .
    </p>
  );
}

export function ReconciliationNotice({ summary, currency }: { summary: ReconciliationSummary; currency: string }) {
  return (
    <Notice tone={summary.outOfTolerance === 0 ? 'success' : 'warning'}>
      Ledger check for {summary.asOfDate}: {summary.accounts} account{summary.accounts === 1 ? '' : 's'} compared,{' '}
      {summary.outOfTolerance === 0 ? 'all within tolerance' : `${summary.outOfTolerance} outside tolerance`} (total
      difference {formatAmount(summary.totalVariance, currency)}).{' '}
      {summary.outOfTolerance > 0 &&
        'If Loans, Deposits or Treasury for this date are still waiting, the check runs again as each is admitted. '}
      Review and sign off in the ledger check (General ledger source → Ledger check).
    </Notice>
  );
}
