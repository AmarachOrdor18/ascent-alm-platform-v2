import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { HierarchyBrowser } from '@/components/ui/HierarchyBrowser';
import { InfoButton } from '@/components/ui/InfoButton';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useBatches, useDimensionMembers, useFxRates } from '@/lib/hooks';
import { useRules } from '@/lib/ruleHooks';
import { useExecuteRun } from '@/lib/runHooks';
import { ALL_ELEMENTS, draftRun } from '@/engine/run';
import { availableAsOfDates, currentBatch } from '@/engine/vintage';
import { buildFxTable, missingRates } from '@/engine/fx';
import { formatDate } from '@/lib/format';
import type { CalculationElement, ProcessRun as Run, ProcessType } from '@/engine/types';
import type { ForecastScenarioRule, NewBusinessRule, TransactionStrategyRule } from '@/engine/ruleTypes';

const ELEMENT_LABELS: Record<CalculationElement, string> = {
  Lcr: 'Liquidity Coverage Ratio',
  Nsfr: 'Net Stable Funding Ratio',
  LoanToDeposit: 'Loan-to-Deposit Ratio',
  Concentration: 'Depositor Concentration',
  LiquidityGap: 'Liquidity Gap (contractual & behavioural)',
  RepricingGap: 'Repricing Gap',
  NiiSensitivity: 'NII Sensitivity',
  EveSensitivity: 'EVE Sensitivity',
  SurvivalHorizon: 'Survival Horizon',
  ProfitabilityRatios: 'Profitability Ratios',
  FxPosition: 'FX Position',
  TransferPricing: 'Funds Transfer Pricing',
  TpAdjustments: 'FTP Adjustments',
};

export function ProcessRun() {
  const [, navigate] = useLocation();
  const { hasPermission, user } = useAuth();
  const { affiliateCode, setRun } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { data: fxRates = [] } = useFxRates();
  const { data: orgUnits = [] } = useDimensionMembers('OrgUnit');
  const { data: products = [] } = useDimensionMembers('Product');
  const { data: bucketRules = [] } = useRules('TimeBucket');
  const { data: behaviourRules = [] } = useRules('BehaviourPattern');
  const { data: productRules = [] } = useRules('ProductCharacteristic');
  const { data: scenarios = [] } = useRules<ForecastScenarioRule>('ForecastScenario');
  const { data: newBusiness = [] } = useRules<NewBusinessRule>('NewBusiness');
  const { data: strategies = [] } = useRules<TransactionStrategyRule>('TransactionStrategy');
  const execute = useExecuteRun();
  const canRun = hasPermission('run.execute');

  const affiliate = affiliates.find((a) => a.code === affiliateCode) ?? affiliates.find((a) => a.code !== 'GROUP');

  // A Group run has no positions of its own; its available dates are the
  // union of what each real affiliate has committed.
  const dates =
    affiliateCode === 'GROUP'
      ? Array.from(
          new Set(affiliates.filter((a) => a.code !== 'GROUP').flatMap((a) => availableAsOfDates(batches, a.code))),
        ).sort((a, b) => b.localeCompare(a))
      : affiliate
        ? availableAsOfDates(batches, affiliate.code)
        : [];

  const [name, setName] = useState('');
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [processType, setProcessType] = useState<ProcessType>('Static');
  const [orgUnitCodes, setOrgUnitCodes] = useState<string[]>([]);
  const [productCodes, setProductCodes] = useState<string[]>([]);
  const [elements, setElements] = useState<CalculationElement[]>(ALL_ELEMENTS);
  const [bucketRuleId, setBucketRuleId] = useState('');
  const [behaviourRuleId, setBehaviourRuleId] = useState('');
  const [productRuleId, setProductRuleId] = useState('');
  const [scenarioIds, setScenarioIds] = useState<string[]>([]);
  const [newBusinessId, setNewBusinessId] = useState('');
  const [strategyId, setStrategyId] = useState('');
  const [outcome, setOutcome] = useState<{ run: Run; count: number } | null>(null);

  const effectiveDate = asOfDate || dates[0] || '';
  const batch = affiliate && effectiveDate ? currentBatch(batches, affiliate.code, 'Positions', effectiveDate) : null;

  // A Group run must be able to convert every currency it will encounter.
  const required = useMemo(
    () =>
      affiliateCode === 'GROUP'
        ? Array.from(new Set(affiliates.flatMap((a) => [a.functionalCurrency, ...a.activeCurrencies])))
        : affiliate
          ? [affiliate.functionalCurrency, ...affiliate.activeCurrencies]
          : [],
    [affiliateCode, affiliates, affiliate],
  );
  const reportingCurrency = affiliateCode === 'GROUP' ? 'USD' : (affiliate?.functionalCurrency ?? 'USD');
  const missingFx = missingRates(required, reportingCurrency, buildFxTable('USD', fxRates, effectiveDate));

  const blockers: string[] = [];
  if (!affiliate) blockers.push('No affiliate selected.');
  if (!effectiveDate) blockers.push('No as-of date with committed data.');
  if (!batch && affiliateCode !== 'GROUP') blockers.push('No committed position batch for this date.');
  if (missingFx.length > 0) blockers.push(`No FX rate for ${missingFx.join(', ')} — the run would fail.`);
  if (elements.length === 0) blockers.push('Select at least one calculation element.');
  if (processType === 'Dynamic' && !newBusinessId) blockers.push('A dynamic run needs a new-business rule.');

  const handleExecute = async () => {
    if (!affiliate || blockers.length > 0) return;
    const run: Run = {
      ...draftRun({
        id: `RUN-${Date.now().toString(36).toUpperCase()}`,
        name: name.trim() || `${affiliate.name} — ${formatDate(effectiveDate)}`,
        asOfDate: effectiveDate,
        affiliateCode: affiliate.code,
        reportingCurrency,
        timeBucketRuleId: bucketRuleId,
        batchIds: batch ? [batch.id] : [],
        createdBy: user?.name ?? 'unknown',
        createdAt: new Date().toISOString(),
        elements,
      }),
      processType,
      orgUnitCodes: orgUnitCodes.length > 0 ? orgUnitCodes : null,
      productCodes: productCodes.length > 0 ? productCodes : null,
      productCharacteristicRuleId: productRuleId || null,
      behaviourPatternRuleId: behaviourRuleId || null,
      forecastScenarioIds: scenarioIds,
      newBusinessRuleId: newBusinessId || null,
      transactionStrategyId: strategyId || null,
    };

    const result = await execute.mutateAsync(run);
    setOutcome({ run: result.run, count: result.results.length });
    if (result.run.status === 'Completed') setRun(result.run);
  };

  return (
    <>
      <ModuleHeader
        title="Process Run"
        description="Compose a run from a date, a scope, a rule set and a scenario, then execute it. Results are immutable and pinned to the versions consumed."
        asOfDate={effectiveDate || null}
        scope={affiliate?.name ?? 'No affiliate'}
        currency={reportingCurrency}
        metrics={[
          { label: 'Process type', value: processType, about: 'Static models the existing book running off; Dynamic layers a New Business rule’s growth assumptions on top.' },
          { label: 'Elements', value: `${elements.length}/${ALL_ELEMENTS.length}`, about: 'How many of the available calculation elements this run will compute — fewer elements means a lighter, faster run.' },
          { label: 'Data version', value: batch ? `v${batch.version}` : '—', about: 'The committed position batch version this run will pin to — reloading data later never changes what this run reports.' },
          {
            label: 'Ready',
            value: blockers.length === 0 ? 'Yes' : `${blockers.length} blocker(s)`,
            tone: blockers.length === 0 ? 'success' : 'danger',
            about: 'Whether every precondition is met — a missing FX rate, an unselected element or an incomplete scope all block execution rather than letting the run fail silently.',
          },
        ]}
        actions={
          <button
            type="button"
            onClick={() => void handleExecute()}
            disabled={!canRun || blockers.length > 0 || execute.isPending}
            title={blockers[0]}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            {execute.isPending ? 'Running…' : 'Execute run'}
          </button>
        }
      />

      {blockers.length > 0 && (
        <div role="alert" className="mb-6 rounded-lg bg-danger-bg px-4 py-3 text-[12px] leading-relaxed text-danger">
          <span className="font-bold">Cannot run yet.</span>
          <ul className="mt-1 space-y-0.5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {outcome && (
        <div
          role="status"
          className={cn(
            'mb-6 rounded-lg px-4 py-3 text-[12px] leading-relaxed',
            outcome.run.status === 'Completed' ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger',
          )}
        >
          {outcome.run.status === 'Completed' ? (
            <>
              <span className="font-bold">{outcome.run.name} completed.</span> {outcome.count} element(s) computed.{' '}
              <button
                type="button"
                onClick={() => navigate('/runs')}
                className="font-bold underline hover:no-underline"
              >
                View in run history
              </button>
            </>
          ) : (
            <>
              <span className="font-bold">Run failed.</span> {outcome.run.errorLog[0]?.message}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Run definition</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Run name" hint="Defaults to the affiliate and date if left blank.">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={affiliate ? `${affiliate.name} — ${formatDate(effectiveDate)}` : ''}
                  className={input}
                  aria-label="Run name"
                />
              </Field>
              <Field label="As-of date" hint="Only dates with committed position data appear.">
                <select
                  value={effectiveDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className={input}
                  aria-label="As-of date"
                >
                  {dates.length === 0 && <option value="">— no committed data —</option>}
                  {dates.map((d) => (
                    <option key={d} value={d}>
                      {formatDate(d)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Process type"
                hint="Static models the existing book running off. Dynamic layers new business on top."
              >
                <select
                  value={processType}
                  onChange={(e) => setProcessType(e.target.value as ProcessType)}
                  className={input}
                  aria-label="Process type"
                >
                  <option value="Static">Static — existing book only</option>
                  <option value="Dynamic">Dynamic — with new business</option>
                </select>
              </Field>
              <Field label="Reporting currency" hint="Group runs consolidate into USD.">
                <input value={reportingCurrency} readOnly className={`${input} bg-gray-50 font-mono`} aria-label="Reporting currency" />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Scope</h2>
              <InfoButton label="How scope selection works">
                Leave a selection empty for no constraint. Selecting a rollup brings its whole subtree — picking
                Retail Banking captures every region beneath it.
              </InfoButton>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <HierarchyBrowser
                members={orgUnits}
                selectedCodes={orgUnitCodes}
                onChange={setOrgUnitCodes}
                label="Organisational unit"
              />
              <HierarchyBrowser
                members={products}
                selectedCodes={productCodes}
                onChange={setProductCodes}
                label="Product"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Calculation elements
              </h2>
              <InfoButton label="Why choose elements">
                Choose what this run computes, per Oracle's element selection (ALM UG §35.2). Computing only what is
                needed keeps a scheduled daily liquidity run light.
              </InfoButton>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {ALL_ELEMENTS.map((element) => (
                <div key={element} className="flex items-center gap-2">
                  <input
                    id={`el-${element}`}
                    type="checkbox"
                    checked={elements.includes(element)}
                    onChange={(e) =>
                      setElements(
                        e.target.checked ? [...elements, element] : elements.filter((x) => x !== element),
                      )
                    }
                    className="accent-gold-500"
                  />
                  <label htmlFor={`el-${element}`} className="cursor-pointer text-[12px] text-gray-700">
                    {ELEMENT_LABELS[element]}
                  </label>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-3 border-t border-gray-50 pt-3">
              <button type="button" onClick={() => setElements(ALL_ELEMENTS)} className="text-[11px] font-bold text-navy-700 hover:text-navy-900">
                Select all
              </button>
              <button type="button" onClick={() => setElements([])} className="text-[11px] font-bold text-gray-500 hover:text-navy-900">
                Clear
              </button>
              <button
                type="button"
                onClick={() => setElements(['Lcr', 'SurvivalHorizon', 'Concentration'])}
                className="text-[11px] font-bold text-navy-700 hover:text-navy-900"
              >
                Daily liquidity only
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Rules</h2>
              <InfoButton label="What happens when a rule is left unselected">
                A rule left unselected falls back to the engine default, and the result says which basis it used.
              </InfoButton>
            </div>
            <div className="space-y-3">
              <Field label="Time bucket rule">
                <select value={bucketRuleId} onChange={(e) => setBucketRuleId(e.target.value)} className={input} aria-label="Time bucket rule">
                  <option value="">— engine default —</option>
                  {bucketRules.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Product characteristics">
                <select value={productRuleId} onChange={(e) => setProductRuleId(e.target.value)} className={input} aria-label="Product characteristics rule">
                  <option value="">— position data as loaded —</option>
                  {productRules.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Behaviour patterns">
                <select value={behaviourRuleId} onChange={(e) => setBehaviourRuleId(e.target.value)} className={input} aria-label="Behaviour pattern rule">
                  <option value="">— engine default —</option>
                  {behaviourRules.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
              {processType === 'Dynamic' && (
                <Field label="New business" hint="Required for a dynamic run.">
                  <select value={newBusinessId} onChange={(e) => setNewBusinessId(e.target.value)} className={input} aria-label="New business rule">
                    <option value="">— select —</option>
                    {newBusiness.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Transaction strategy" hint="Balance-sheet actions applied inside the run.">
                <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} className={input} aria-label="Transaction strategy">
                  <option value="">— none —</option>
                  {strategies.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">Rate scenarios</h2>
            {scenarios.length === 0 ? (
              <p className="text-[11px] text-gray-500">
                No scenarios defined. The run computes the base case only.
              </p>
            ) : (
              <div className="space-y-2">
                {scenarios.map((s) => (
                  <div key={s.id} className="flex items-start gap-2">
                    <input
                      id={`sc-${s.id}`}
                      type="checkbox"
                      checked={scenarioIds.includes(s.id)}
                      onChange={(e) =>
                        setScenarioIds(
                          e.target.checked ? [...scenarioIds, s.id] : scenarioIds.filter((x) => x !== s.id),
                        )
                      }
                      className="mt-0.5 accent-gold-500"
                    />
                    <label htmlFor={`sc-${s.id}`} className="cursor-pointer text-[12px]">
                      <span className="block text-navy-900">{s.name}</span>
                      <span className="block text-[10px] text-gray-500">{s.description || 'No description'}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Data version</h2>
              <InfoButton label="Why the run pins a data version">
                The run pins this version. Reloading the data later creates a new version — this run keeps reporting
                what it computed, and says which version that was.
              </InfoButton>
            </div>
            {batch ? (
              <dl className="space-y-2 text-[11px]">
                <Row label="Batch" value={batch.id} mono />
                <Row label="Version" value={`v${batch.version}`} mono />
                <Row label="Rows" value={String(batch.rowsAccepted)} mono />
                <Row label="Committed" value={batch.committedAt ? formatDate(batch.committedAt.slice(0, 10)) : '—'} />
              </dl>
            ) : (
              <p className="text-[11px] text-gray-500">
                {affiliateCode === 'GROUP'
                  ? 'A Group run reads every Live affiliate’s committed data.'
                  : 'No committed batch for this date.'}
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

const input =
  'w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-gray-600">{label}</span>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-gray-400">{hint}</p>}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className={mono ? 'font-mono text-navy-900' : 'text-navy-900'}>{value}</dd>
    </div>
  );
}
