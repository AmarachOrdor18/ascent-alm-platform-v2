import { useState } from 'react';
import { RuleEditor, RuleField, ruleInput } from '@/components/ui/RuleEditor';
import { RuleRows, RowInput, RowSelect, type RowColumn } from '@/components/ui/RuleRows';
import { InfoButton } from '@/components/ui/InfoButton';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useCurrencies, useDimensionMembers, useYieldCurves } from '@/lib/hooks';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import {
  CORE_TP_METHODS,
  LEGACY_TP_METHODS,
  TP_METHOD_HELP,
  TP_METHOD_LABELS,
  resolveAdjustmentBps,
  resolveTpMethod,
  type AdjustmentMethod,
  type AdjustmentType,
  type FtpPool,
  type SpreadPoint,
  type TpMethod,
} from '@/engine/ftp';
import { formatBps } from '@/lib/format';
import type { AdjustmentLine, AdjustmentRuleDef, FtpAssignment, FtpRule } from '@/engine/ruleTypes';

/** The five calculated methods, then any legacy name already saved on a row (so it still displays). */
function methodOptions(current?: TpMethod): Array<{ value: TpMethod; label: string }> {
  const core = CORE_TP_METHODS.map((m) => ({ value: m as TpMethod, label: TP_METHOD_LABELS[m] }));
  return current && (LEGACY_TP_METHODS as string[]).includes(current)
    ? [...core, { value: current, label: TP_METHOD_LABELS[current] }]
    : core;
}

const ADJUSTMENT_TYPES: Array<{ value: AdjustmentType; label: string }> = [
  { value: 'LiquidityPremium', label: 'Liquidity premium' },
  { value: 'BasisRiskCost', label: 'Basis risk cost' },
  { value: 'CurrencyBasis', label: 'Currency basis' },
  { value: 'BasisSpread', label: 'Basis spread (index vs funding curve)' },
  { value: 'PricingIncentive', label: 'Pricing incentive' },
  { value: 'OtherAdjustment', label: 'Other adjustment' },
];

/** Which calculation methods make sense for each adjustment type. */
function adjustmentMethods(type: AdjustmentType): Array<{ value: AdjustmentMethod; label: string }> {
  const fixed = { value: 'FixedRate' as const, label: 'Fixed bps' };
  if (type === 'CurrencyBasis') return [fixed, { value: 'TenorSpread', label: 'Spread curve by tenor' }];
  if (type === 'BasisSpread') return [{ value: 'CurveDifference', label: 'Index − funding curve' }, fixed];
  return [fixed, { value: 'LcrDriven', label: 'LCR-driven' }, { value: 'TenorSpread', label: 'Spread curve by tenor' }];
}

function formatSpreadCurve(points: SpreadPoint[] | undefined): string {
  return (points ?? []).map((p) => `${p.tenorDays}:${p.bps}`).join(', ');
}

/** "0:10, 365:30" → points; null when the text does not parse, so the editor can say so. */
function parseSpreadCurve(text: string): SpreadPoint[] | null {
  if (!text.trim()) return [];
  const points: SpreadPoint[] = [];
  for (const part of text.split(',')) {
    const [t, b] = part.split(':').map((x) => x.trim());
    const tenorDays = Number(t);
    const bps = Number(b);
    if (!t || !b || !Number.isFinite(tenorDays) || !Number.isFinite(bps) || tenorDays < 0) return null;
    points.push({ tenorDays, bps });
  }
  return points.sort((a, b) => a.tenorDays - b.tenorDays);
}

// ─────────────────────────────────────────────────────────────────────────

export function FtpRules() {
  const { user } = useAuth();
  const { affiliateCode } = useScope();
  const { data: coa = [] } = useDimensionMembers('CommonCoa', affiliateCode === 'GROUP' ? '' : affiliateCode);
  const { data: curves = [] } = useYieldCurves();
  const { data: currencies = [] } = useCurrencies();
  const { data: rules = [], isLoading } = useRules<FtpRule>('FtpRule');
  const { save, remove, checkDependencies } = useRuleMutations<FtpRule>('FtpRule');

  const leaves = coa.filter((c) => c.isLeaf);
  const curveCodes = Array.from(new Set(curves.map((c) => c.code)));
  const currencyCodes = currencies.filter((c) => c.isActive).map((c) => c.code);

  const columns: RowColumn<FtpAssignment>[] = [
    {
      key: 'coa',
      header: 'Product class (COA)',
      width: '30%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`ftpcoa-${row.commonCoaCode}`}
          label="COA node"
          value={row.commonCoaCode}
          options={leaves.map((c) => ({ value: c.code, label: c.name }))}
          disabled={readOnly}
          onChange={(v) => update({ commonCoaCode: v })}
        />
      ),
    },
    {
      key: 'method',
      header: 'Transfer pricing method',
      width: '38%',
      render: (row, update, readOnly) => (
        <div>
          <RowSelect
            id={`ftpm-${row.commonCoaCode}`}
            label="Method"
            value={row.method}
            options={methodOptions(row.method)}
            disabled={readOnly}
            onChange={(v) => update({ method: v })}
          />
          <p className="mt-0.5 text-[11px] leading-snug text-gray-400">{TP_METHOD_HELP[resolveTpMethod(row.method)]}</p>
        </div>
      ),
    },
    {
      key: 'curve',
      header: 'Curve',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`ftpc-${row.commonCoaCode}`}
          label="Curve"
          value={row.curveCode ?? ''}
          options={[{ value: '', label: '- affiliate default -' }, ...curveCodes.map((c) => ({ value: c, label: c }))]}
          disabled={readOnly}
          onChange={(v) => update({ curveCode: v || null })}
        />
      ),
    },
  ];

  const poolColumns: RowColumn<FtpPool>[] = [
    {
      key: 'name',
      header: 'Pool',
      width: '26%',
      render: (row, update, readOnly) => (
        <RowInput
          id={`pooln-${row.id}`}
          label="Pool name"
          value={row.name}
          disabled={readOnly}
          onChange={(v) => update({ name: v })}
        />
      ),
    },
    {
      key: 'ccy',
      header: 'Currency',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`poolc-${row.id}`}
          label="Currency"
          value={row.currency}
          options={currencyCodes.length > 0 ? currencyCodes : [row.currency]}
          disabled={readOnly}
          onChange={(v) => update({ currency: v })}
        />
      ),
    },
    {
      key: 'from',
      header: 'From (days)',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`poolf-${row.id}`}
          label="Tenor from, days"
          type="number"
          value={row.tenorFromDays}
          disabled={readOnly}
          onChange={(v) => update({ tenorFromDays: Number(v) })}
        />
      ),
    },
    {
      key: 'to',
      header: 'To (days)',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`poolt-${row.id}`}
          label="Tenor to, days (blank for open-ended)"
          type="number"
          placeholder="open"
          value={row.tenorToDays ?? ''}
          disabled={readOnly}
          onChange={(v) => update({ tenorToDays: v === '' ? null : Number(v) })}
        />
      ),
    },
    {
      key: 'rate',
      header: 'Pool rate % (optional)',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`poolr-${row.id}`}
          label="Treasury-set pool rate, percent - blank to use the curve"
          type="number"
          step="0.01"
          placeholder="from curve"
          value={row.rate ?? ''}
          disabled={readOnly}
          onChange={(v) => update({ rate: v === '' ? null : Number(v) })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<FtpRule>
      title="FTP Rules"
      description="Which transfer-pricing method applies to which product class, and off which curve."
      noun="FTP rule"
      rules={rules}
      isLoading={isLoading}
      createDefault={() => ({
        ...newRuleMeta('FtpRule', 'New FTP rule', user?.name ?? 'unknown'),
        kind: 'FtpRule',
        assignments: [],
        defaultMethod: 'MatchedMaturity',
        pools: [],
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) =>
        `${r.assignments.length} assignment(s), default ${TP_METHOD_LABELS[r.defaultMethod ?? 'RepricingTerm'].split(' (')[0]}` +
        (r.pools?.length ? `, ${r.pools.length} pool(s)` : '')
      }
      validate={(r) => {
        const seen = new Set<string>();
        for (const a of r.assignments) {
          if (seen.has(a.commonCoaCode)) return `Duplicate assignment for ${a.commonCoaCode}.`;
          seen.add(a.commonCoaCode);
        }
        for (const p of r.pools ?? []) {
          if (!p.name.trim()) return 'Every funding pool needs a name.';
          if (!(p.tenorFromDays >= 0)) return `Pool "${p.name}" needs a tenor from of 0 days or more.`;
          if (p.tenorToDays !== null && p.tenorToDays <= p.tenorFromDays) {
            return `Pool "${p.name}" ends at or before it starts.`;
          }
        }
        const pools = r.pools ?? [];
        for (const a of pools) {
          for (const b of pools) {
            if (a === b || a.currency !== b.currency) continue;
            const aEnd = a.tenorToDays ?? Infinity;
            const bEnd = b.tenorToDays ?? Infinity;
            if (a.tenorFromDays < bEnd && b.tenorFromDays < aEnd) {
              return `Pools "${a.name}" and "${b.name}" overlap for ${a.currency} - a position must fall in one pool only.`;
            }
          }
        }
        const usesPooled = r.defaultMethod === 'Pooled' || r.assignments.some((a) => a.method === 'Pooled');
        if (usesPooled && pools.length === 0) return 'The Pooled method needs at least one funding pool.';
        return null;
      }}
      guidance={
        <>
          <span className="font-bold">Priced on the run&apos;s cashflows.</span> Every method reads the same contractual
          and behavioural cashflows the liquidity gap and IRRBB use - so a prepaying loan, or a current account running
          off over its behaviour pattern, is funded on the timing the rest of the platform assumes. With the Pooled
          method and no Treasury-set pool rate, a pool&apos;s rate is the balance-weighted curve rate of every position
          whose average life falls in the band. Legacy method names on older rules are still accepted and priced as
          repricing term.
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-5">
          <RuleField label="Default method" hint="Applies to every product class with no assignment below.">
            <select
              aria-label="Default transfer pricing method"
              className={`${ruleInput} max-w-md`}
              value={rule.defaultMethod ?? 'RepricingTerm'}
              disabled={readOnly}
              onChange={(e) => update({ defaultMethod: e.target.value as TpMethod })}
            >
              {methodOptions(rule.defaultMethod).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </RuleField>

          <RuleField label="Assignments by product class">
            <RuleRows<FtpAssignment>
              rows={rule.assignments}
              columns={columns}
              rowKey={(a, i) => `${a.commonCoaCode}-${i}`}
              onChange={(assignments) => update({ assignments })}
              readOnly={readOnly}
              addLabel="Add assignment"
              emptyMessage="No assignments - every product class is priced by the default method. Positions with no curve are reported as unpriced rather than assumed zero."
              createRow={() => ({
                commonCoaCode: leaves[0]?.code ?? '',
                method: 'MatchedMaturity',
                curveCode: null,
              })}
            />
          </RuleField>

          <RuleField
            label="Funding pools (Pooled method)"
            hint="Tenor bands per currency; a position uses the band its average life falls in."
          >
            <RuleRows<FtpPool>
              rows={rule.pools ?? []}
              columns={poolColumns}
              rowKey={(p) => p.id}
              onChange={(pools) => update({ pools })}
              readOnly={readOnly}
              addLabel="Add pool"
              emptyMessage="No funding pools. Only needed if a product class uses the Pooled method."
              createRow={() => {
                const pools = rule.pools ?? [];
                const ccy = currencyCodes[0] ?? 'USD';
                const last = pools
                  .filter((p) => p.currency === ccy)
                  .reduce((m, p) => Math.max(m, p.tenorToDays ?? 0), 0);
                return {
                  id: `POOL-${Date.now().toString(36)}`,
                  name: `${ccy} ${last}d+`,
                  currency: ccy,
                  tenorFromDays: last,
                  tenorToDays: null,
                  rate: null,
                };
              }}
            />
          </RuleField>

          <InfoButton label="How each method prices a position">
            <dl className="space-y-2">
              {CORE_TP_METHODS.map((m) => (
                <div key={m}>
                  <dt className="font-bold text-navy-900">{TP_METHOD_LABELS[m]}</dt>
                  <dd className="leading-relaxed">{TP_METHOD_HELP[m]}</dd>
                </div>
              ))}
            </dl>
          </InfoButton>
        </div>
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────

/** Spread-curve text field that keeps the raw text while it is being typed and only commits when it parses. */
function SpreadCurveInput({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: SpreadPoint[] | undefined;
  disabled: boolean;
  onChange: (points: SpreadPoint[]) => void;
}) {
  const [text, setText] = useState(formatSpreadCurve(value));
  const invalid = parseSpreadCurve(text) === null;
  return (
    <div>
      <RowInput
        id={id}
        label="Spread curve, tenor days : bps, comma separated"
        placeholder="0:10, 365:30"
        value={text}
        disabled={disabled}
        onChange={(v) => {
          setText(v);
          const parsed = parseSpreadCurve(v);
          if (parsed) onChange(parsed);
        }}
      />
      {invalid && <p className="mt-0.5 text-[11px] text-danger">Use days:bps pairs, e.g. 0:10, 365:30</p>}
    </div>
  );
}

export function AdjustmentRules() {
  const { user } = useAuth();
  const { affiliateCode } = useScope();
  const { data: coa = [] } = useDimensionMembers('CommonCoa', affiliateCode === 'GROUP' ? '' : affiliateCode);
  const { data: currencies = [] } = useCurrencies();
  const { data: curves = [] } = useYieldCurves();
  const { data: rules = [], isLoading } = useRules<AdjustmentRuleDef>('AdjustmentRule');
  const { save, remove, checkDependencies } = useRuleMutations<AdjustmentRuleDef>('AdjustmentRule');

  const leaves = coa.filter((c) => c.isLeaf);
  const currencyCodes = currencies.filter((c) => c.isActive).map((c) => c.code);
  const indexCodes = Array.from(new Set(curves.map((c) => c.code)));

  const columns: RowColumn<AdjustmentLine>[] = [
    {
      key: 'type',
      header: 'Adjustment type',
      width: '20%',
      render: (row, update, readOnly) => (
        <div>
          <RowSelect
            id={`adjt-${row.id}`}
            label="Adjustment type"
            value={row.type}
            options={ADJUSTMENT_TYPES}
            disabled={readOnly}
            onChange={(v) => {
              const allowed = adjustmentMethods(v).map((m) => m.value);
              update({ type: v, method: allowed.includes(row.method) ? row.method : allowed[0]! });
            }}
          />
        </div>
      ),
    },
    {
      key: 'coa',
      header: 'Applies to',
      width: '18%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`adjc-${row.id}`}
          label="Applies to"
          value={row.commonCoaCode ?? ''}
          options={[{ value: '', label: 'All products' }, ...leaves.map((c) => ({ value: c.code, label: c.name }))]}
          disabled={readOnly}
          onChange={(v) => update({ commonCoaCode: v || null })}
        />
      ),
    },
    {
      key: 'scope',
      header: 'Currency / index',
      width: '12%',
      render: (row, update, readOnly) =>
        row.type === 'CurrencyBasis' ? (
          <RowSelect
            id={`adjccy-${row.id}`}
            label="Position currency"
            value={row.currency ?? ''}
            options={[{ value: '', label: 'Any foreign ccy' }, ...currencyCodes.map((c) => ({ value: c, label: c }))]}
            disabled={readOnly}
            onChange={(v) => update({ currency: v || null })}
          />
        ) : row.type === 'BasisSpread' ? (
          <RowSelect
            id={`adjidx-${row.id}`}
            label="Rate index"
            value={row.indexCode ?? ''}
            options={[{ value: '', label: "Position's own index" }, ...indexCodes.map((c) => ({ value: c, label: c }))]}
            disabled={readOnly}
            onChange={(v) => update({ indexCode: v || null })}
          />
        ) : (
          <span className="text-[12px] text-gray-300">-</span>
        ),
    },
    {
      key: 'method',
      header: 'Method',
      width: '14%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`adjm-${row.id}`}
          label="Method"
          value={row.method}
          options={adjustmentMethods(row.type)}
          disabled={readOnly}
          onChange={(v) => update({ method: v })}
        />
      ),
    },
    {
      key: 'value',
      header: 'Fixed bps / curve',
      align: 'right',
      render: (row, update, readOnly) =>
        row.method === 'TenorSpread' ? (
          <SpreadCurveInput
            id={`adjsc-${row.id}`}
            value={row.spreadCurve}
            disabled={readOnly}
            onChange={(spreadCurve) => update({ spreadCurve })}
          />
        ) : row.method === 'CurveDifference' ? (
          <span className="text-[11px] text-gray-400">from curves on file</span>
        ) : (
          <RowInput
            id={`adjf-${row.id}`}
            label="Fixed basis points"
            type="number"
            step="5"
            value={row.fixedBps}
            disabled={readOnly || row.method !== 'FixedRate'}
            onChange={(v) => update({ fixedBps: Number(v) })}
          />
        ),
    },
    {
      key: 'threshold',
      header: 'LCR threshold %',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`adjl-${row.id}`}
          label="LCR threshold"
          type="number"
          value={row.lcrThresholdPercent}
          disabled={readOnly || row.method !== 'LcrDriven'}
          onChange={(v) => update({ lcrThresholdPercent: Number(v) })}
        />
      ),
    },
    {
      key: 'cap',
      header: 'Cap bps',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`adjcap-${row.id}`}
          label="Cap in basis points"
          type="number"
          step="5"
          value={row.lcrCapBps}
          disabled={readOnly || row.method !== 'LcrDriven'}
          onChange={(v) => update({ lcrCapBps: Number(v) })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<AdjustmentRuleDef>
      title="Adjustment Rules"
      description="Named add-ons stacked on the base transfer rate - liquidity premium, basis risk, currency basis, basis spread, pricing incentive."
      noun="adjustment rule"
      rules={rules}
      isLoading={isLoading}
      createDefault={() => ({
        ...newRuleMeta('AdjustmentRule', 'New adjustment rule', user?.name ?? 'unknown'),
        kind: 'AdjustmentRule',
        adjustments: [],
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.adjustments.length} add-on(s)`}
      validate={(r) => {
        if (r.adjustments.some((a) => a.method === 'LcrDriven' && a.lcrCapBps <= 0)) {
          return 'An LCR-driven adjustment needs a positive cap, or it is unbounded.';
        }
        if (r.adjustments.some((a) => a.method === 'TenorSpread' && !(a.spreadCurve ?? []).length)) {
          return 'A spread-curve adjustment needs at least one tenor:bps point.';
        }
        if (r.adjustments.some((a) => a.method === 'CurveDifference' && a.type !== 'BasisSpread')) {
          return 'Only a basis-spread adjustment can be priced from the difference between two curves.';
        }
        return null;
      }}
      guidance={
        <>
          <span className="font-bold">Separable, not blended.</span> Several adjustments can apply to one product and
          each is reported by name on every transfer-rate line, so a business unit can see what it is being charged for
          rather than one opaque spread.
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-4">
          <RuleRows<AdjustmentLine>
            rows={rule.adjustments}
            columns={columns}
            rowKey={(a) => a.id}
            onChange={(adjustments) => update({ adjustments })}
            readOnly={readOnly}
            addLabel="Add adjustment"
            emptyMessage="No adjustments. The transfer rate is then the base curve alone."
            createRow={() => ({
              id: `ADJ-${Date.now().toString(36)}`,
              type: 'LiquidityPremium',
              commonCoaCode: null,
              method: 'LcrDriven',
              fixedBps: 0,
              lcrThresholdPercent: 130,
              lcrMultiplier: 1.5,
              lcrCapBps: 150,
            })}
          />

          {rule.adjustments.some((a) => a.method === 'LcrDriven') && (
            <RuleField
              label="LCR-driven preview"
              hint="Internal funding gets more expensive as the liquidity buffer thins. Coefficients are an illustrative treasury policy, not calibrated to Ecobank."
            >
              <table className="w-full max-w-md text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-400">
                    <th className="py-1 px-3 font-bold uppercase tracking-wider">If LCR is</th>
                    <th className="py-1 px-3 text-right font-bold uppercase tracking-wider">Add-on</th>
                  </tr>
                </thead>
                <tbody>
                  {[170, 140, 120, 100, 80].map((lcr) => {
                    const line = rule.adjustments.find((a) => a.method === 'LcrDriven')!;
                    return (
                      <tr key={lcr} className="border-b border-gray-100">
                        <td className="py-1 px-3 font-mono">{lcr}%</td>
                        <td className="py-1 px-3 text-right font-mono text-navy-900">
                          {formatBps(
                            resolveAdjustmentBps(
                              {
                                id: line.id,
                                type: line.type,
                                commonCoaCode: line.commonCoaCode,
                                method: 'LcrDriven',
                                lcrThresholdPercent: line.lcrThresholdPercent,
                                lcrMultiplier: line.lcrMultiplier,
                                lcrCapBps: line.lcrCapBps,
                              },
                              lcr,
                            ),
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </RuleField>
          )}
        </div>
      )}
    />
  );
}
