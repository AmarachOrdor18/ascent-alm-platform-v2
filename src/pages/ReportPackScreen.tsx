import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { RunPicker } from '@/components/layout/RunPicker';
import { useAuth } from '@/context/AuthContext';
import { GROUP_CODE } from '@/context/ScopeContext';
import { reportPacks, newId } from '@/lib/governanceHooks';
import { scopedListCode } from '@/lib/scope';
import { useRuns, useRunResults } from '@/lib/runHooks';
import { useAffiliates, useBatches } from '@/lib/hooks';
import { isRunStale, isRunUnreconciled } from '@/lib/runStaleness';
import { METRIC_SPECS, formatMetric } from '@/lib/metrics';
import { exportPackPdf, exportPackCsv, exportPackXlsx, type PdfPackData } from '@/lib/pdfExport';
import type { CalculationElement, PackKind, PackSection, ReportPack } from '@/engine/types';

interface SectionCandidate {
  element: CalculationElement;
  title: string;
}

const STATUS_TONE: Record<ReportPack['status'], 'success' | 'warning' | 'neutral'> = {
  Draft: 'neutral', Generated: 'warning', Distributed: 'success',
};

export function ReportPackScreen({
  kind, title, description, candidates,
}: { kind: PackKind; title: string; description: string; candidates: SectionCandidate[] }) {
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission('reporting.generate') || hasPermission('reporting.manage') || hasPermission('run.execute');
  // A user confined to one affiliate only sees that affiliate's own packs, plus any Group-wide ones.
  const { data: packs = [], isLoading } = reportPacks.useList(scopedListCode(user, hasPermission));
  // Same restriction applies to which runs can be picked as a pack's source - otherwise a restricted
  // user could build a pack from another affiliate's run even though they'd never see it listed above.
  const { data: runsForScope = [] } = useRuns(scopedListCode(user, hasPermission));
  const { data: allAffiliates = [] } = useAffiliates();
  // A run belonging to an affiliate that isn't (or is no longer) Live never belongs in a pack's source
  // picker - Group runs are always fine, since Group consolidation itself only draws from Live affiliates.
  const runs = runsForScope.filter(
    (r) => r.affiliateCode === GROUP_CODE || allAffiliates.find((a) => a.code === r.affiliateCode)?.status === 'Live',
  );
  const save = reportPacks.useSave();
  const remove = reportPacks.useRemove();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [packName, setPackName] = useState('');

  const rows = packs.filter((p) => p.kind === kind).sort((a, b) => (b.generatedAt ?? '').localeCompare(a.generatedAt ?? ''));
  const generated = rows.filter((p) => p.status !== 'Draft').length;
  const distributed = rows.filter((p) => p.status === 'Distributed').length;

  const generate = async () => {
    if (!runId) return;
    const run = runs.find((r) => r.id === runId);
    if (!run) return;

    const sections: PackSection[] = candidates.map((c) => ({
      id: newId('SEC'),
      title: c.title,
      source: c.element,
      included: run.elements.includes(c.element),
      commentary: '',
    }));

    const pack: ReportPack = {
      id: newId('PACK'),
      name: packName.trim() || `${title} - ${run.asOfDate}`,
      kind,
      // The pack's affiliate is the source run's own affiliate, not the ambient scope selector - a
      // Group-scoped user building a pack from an affiliate's run still produces an affiliate pack.
      affiliateCode: run.affiliateCode === 'GROUP' ? null : run.affiliateCode,
      runId,
      sections,
      scheduleId: null,
      status: 'Generated',
      recipients: [],
      generatedAt: new Date().toISOString(),
      generatedBy: user?.name ?? 'unknown',
      updatedBy: user?.name ?? 'unknown',
      updatedAt: new Date().toISOString(),
    };
    await save.mutateAsync(pack);
    setBuilding(false);
    setRunId(null);
    setPackName('');
    setExpanded(pack.id);
  };

  const distribute = async (pack: ReportPack, recipients: string) => {
    await save.mutateAsync({
      ...pack,
      status: 'Distributed',
      recipients: recipients.split(',').map((s) => s.trim()).filter(Boolean),
      updatedBy: user?.name ?? 'unknown',
      updatedAt: new Date().toISOString(),
    });
  };

  const columns: ResultColumn<ReportPack>[] = [
    { key: 'name', header: 'Pack', render: (p) => <span className="font-medium text-navy-900">{p.name}</span> },
    { key: 'generated', header: 'Generated', render: (p) => <span className="font-mono text-[11px]">{p.generatedAt?.slice(0, 10) ?? '-'}</span> },
    { key: 'by', header: 'By', render: (p) => p.generatedBy ?? '-' },
    { key: 'sections', header: 'Sections', align: 'right', render: (p) => <span className="font-mono">{p.sections.filter((s) => s.included).length}/{p.sections.length}</span> },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} tone={STATUS_TONE[p.status]} /> },
    {
      key: 'actions', header: '', render: (p) => (
        <div className="flex gap-2">
          <button type="button" onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="text-[11px] font-bold text-navy-900 hover:underline">
            {expanded === p.id ? 'Hide' : 'View'}
          </button>
          <button type="button" onClick={() => void remove.mutateAsync(p)} disabled={!canEdit} className="text-[11px] font-bold text-danger hover:underline disabled:opacity-40">
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title={title}
        description={description}
        asOfDate={null}
        metrics={[
          { label: 'Packs generated', value: String(generated), about: 'Packs built from a source run, whether or not they have gone out yet.' },
          { label: 'Distributed', value: String(distributed), about: 'Packs marked as actually sent to their recipients - a tracked step, not an assumption.' },
          { label: 'Sections tracked', value: String(candidates.length), about: 'The fixed set of sections this pack type can include - each one only fills in if the source run actually computed it.' },
          { label: 'Total', value: String(rows.length), about: 'Every pack of this type ever built, including drafts.' },
        ]}
        actions={
          <button type="button" onClick={() => setBuilding(true)} disabled={!canEdit} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40">
            Generate pack
          </button>
        }
      />

      {building && (
        <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">New pack</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="pack-name" className="mb-1 block text-[11px] font-medium text-gray-600">Name (optional)</label>
              <input id="pack-name" value={packName} onChange={(e) => setPackName(e.target.value)} placeholder={`${title} - auto-named from the run`} className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none" />
            </div>
            <RunPicker runs={runs} value={runId} onChange={setRunId} label="Source run" />
          </div>
          <p className="mt-3 text-[11px] text-gray-500">
            Sections included are whichever of these the run actually computed - nothing is filled in for an element the run skipped.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {candidates.map((c) => (
              <span key={c.element} className={`rounded border px-2 py-0.5 text-[10px] ${runId && runs.find((r) => r.id === runId)?.elements.includes(c.element) ? 'border-success/40 bg-success/5 text-success' : 'border-gray-200 text-gray-400'}`}>
                {c.title}
              </span>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setBuilding(false)} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">Cancel</button>
            <button type="button" onClick={() => void generate()} disabled={!runId} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40">Generate</button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <ResultTable
          rows={rows}
          columns={columns}
          rowKey={(p) => p.id}
          emptyMessage={isLoading ? 'Loading…' : 'No packs generated yet.'}
        />
      </section>

      {expanded && rows.find((p) => p.id === expanded) && (
        <PackDetail pack={rows.find((p) => p.id === expanded)!} canEdit={canEdit} onDistribute={distribute} />
      )}
    </>
  );
}

function PackDetail({
  pack, canEdit, onDistribute,
}: { pack: ReportPack; canEdit: boolean; onDistribute: (p: ReportPack, recipients: string) => Promise<void> }) {
  const { hasPermission, user } = useAuth();
  const { data: results = [] } = useRunResults(pack.runId);
  const { data: runs = [] } = useRuns(scopedListCode(user, hasPermission));
  const { data: batches = [] } = useBatches();
  const [recipients, setRecipients] = useState(pack.recipients.join(', '));

  const sourceRun = runs.find((r) => r.id === pack.runId) ?? null;
  const stale = isRunStale(sourceRun, batches);
  const unreconciled = isRunUnreconciled(sourceRun, batches);

  const headline = (element: string): string => {
    const spec = METRIC_SPECS.find((m) => m.element === element);
    const result = results.find((r) => r.element === element);
    if (!result) return '-';
    if (!spec) return 'computed';
    const value = spec.extract(result.payload as Record<string, unknown>);
    return formatMetric(value, spec.key);
  };

  const sectionRows = pack.sections.map((s) => ({
    title: s.title,
    status: s.included ? 'Computed' : 'Not computed by this run',
    value: s.included ? headline(s.source) : '-',
  }));

  const packData = (): PdfPackData => ({
    packName: pack.name,
    kindLabel: pack.kind,
    status: pack.status,
    generatedAt: pack.generatedAt,
    generatedBy: pack.generatedBy,
    runAsOfDate: sourceRun?.asOfDate ?? null,
    recipients: pack.recipients,
    sections: sectionRows,
  });

  const downloadPdf = () => exportPackPdf(packData());
  const downloadCsv = () => exportPackCsv(packData());
  const downloadXlsx = () => exportPackXlsx(packData());

  const emailPack = () => {
    const to = recipients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(',');
    const subject = `${pack.name} - ALM report pack`;
    const bodyLines = [
      pack.runId ? 'Reading live from the attached run.' : 'No run attached.',
      '',
      ...sectionRows.map((r) => `${r.title}: ${r.value}${r.status === 'Computed' ? '' : ` (${r.status})`}`),
    ];
    const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
    window.location.href = href;
  };

  return (
    <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">{pack.name}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={downloadPdf}
            className="rounded-lg border border-navy-700 px-3 py-1.5 text-[11px] font-bold text-navy-700 hover:bg-navy-700 hover:text-white"
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={downloadXlsx}
            className="rounded-lg border border-navy-700 px-3 py-1.5 text-[11px] font-bold text-navy-700 hover:bg-navy-700 hover:text-white"
          >
            Download Excel
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded-lg border border-navy-700 px-3 py-1.5 text-[11px] font-bold text-navy-700 hover:bg-navy-700 hover:text-white"
          >
            Download CSV
          </button>
        </div>
      </div>
      <p className="mb-4 text-[11px] text-gray-500">
        {pack.runId ? `Reading live from the attached run.` : 'No run attached.'} Generated {pack.generatedAt?.slice(0, 10)} by {pack.generatedBy}.
      </p>

      {(stale || unreconciled) && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
          {stale && (
            <>
              <span className="font-bold">Source run consumed data that has since been superseded.</span>{' '}
            </>
          )}
          {unreconciled && (
            <>
              <span className="font-bold">Source positions have not been reconciled against the GL.</span>{' '}
            </>
          )}
          The figures below are what the run actually computed - defensible, but worth checking before this pack goes out.
        </p>
      )}

      <div className="space-y-2">
        {pack.sections.map((s) => (
          <div key={s.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-[12px] ${s.included ? 'bg-gray-50' : 'bg-gray-50/50 text-gray-400'}`}>
            <span>{s.title}{!s.included && ' (not computed by this run)'}</span>
            <span className="font-mono font-bold">{s.included ? headline(s.source) : '-'}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        {pack.status === 'Distributed' ? (
          <p className="text-[11px] text-gray-500">Distributed to: {pack.recipients.join(', ') || 'no recipients recorded'}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="pack-recipients" className="mb-1 block text-[11px] font-medium text-gray-600">Recipients (comma-separated)</label>
              <input id="pack-recipients" value={recipients} onChange={(e) => setRecipients(e.target.value)} className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none" />
            </div>
            <button
              type="button"
              onClick={emailPack}
              disabled={!recipients.trim()}
              className="rounded-lg border border-navy-700 px-4 py-2 text-[12px] font-bold text-navy-700 hover:bg-navy-700 hover:text-white disabled:opacity-40"
            >
              Email pack
            </button>
            <button
              type="button"
              onClick={() => void onDistribute(pack, recipients)}
              disabled={!canEdit || !recipients.trim()}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              Mark distributed
            </button>
          </div>
        )}
        <p className="mt-2 text-[10px] text-gray-400">
          "Email pack" opens your own mail client with the figures filled in - the platform doesn't run a mail server
          itself. "Mark distributed" is the audit record of what actually went out.
        </p>
      </div>
    </section>
  );
}
