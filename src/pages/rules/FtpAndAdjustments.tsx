/**
 * FTP Rules (screen 25) and Adjustment Rules (screen 26).
 *
 * Oracle splits transfer pricing into cash-flow and non-cash-flow method
 * families, and is explicit that ledger-grain data supports only the second
 * (ALM UG §7.18). This platform is ledger-grain, so the methods offered are
 * Oracle's own prescribed answer for this data shape — not a simplification
 * we invented.
 *
 * Adjustments stack as separate named add-ons, because RFP §2.1 asks for
 * "Base FTP and Liquidity Premium" as distinguishable components. The
 * previous platform produced one blended group-wide premium.
 */

import { RuleEditor, RuleField } from '@/components/ui/RuleEditor';
import { RuleRows, RowInput, RowSelect, type RowColumn } from '@/components/ui/RuleRows';
import { useAuth } from '@/context/AuthContext';
import { useDimensionMembers, useYieldCurves } from '@/lib/hooks';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import { resolveAdjustmentBps } from '@/engine/ftp';
import { formatBps } from '@/lib/format';
import type { AdjustmentLine, AdjustmentRuleDef, FtpAssignment, FtpRule } from '@/engine/ruleTypes';
import type { TpMethod } from '@/engine/ftp';

const TP_METHODS: Array<{ value: TpMethod; label: string }> = [
  { value: 'SpreadFromInterestRateCode', label: 'Spread from interest rate code' },
  { value: 'SpreadFromNoteRate', label: 'Spread from note rate' },
  { value: 'RedemptionCurve', label: 'Redemption curve' },
  { value: 'MovingAverage', label: 'Moving average' },
];

const ADJUSTMENT_TYPES = ['LiquidityPremium', 'BasisRiskCost', 'PricingIncentive', 'OtherAdjustment'] as const;

// ─────────────────────────────────────────────────────────────────────────

export function FtpRules() {
  const { user } = useAuth();
  const { data: coa = [] } = useDimensionMembers('CommonCoa');
  const { data: curves = [] } = useYieldCurves();
  const { data: rules = [], isLoading } = useRules<FtpRule>('FtpRule');
  const { save, remove, checkDependencies } = useRuleMutations<FtpRule>('FtpRule');

  const leaves = coa.filter((c) => c.isLeaf);

  const columns: RowColumn<FtpAssignment>[] = [
    {
      key: 'coa',
      header: 'Product class (COA)',
      width: '34%',
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
      width: '34%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`ftpm-${row.commonCoaCode}`}
          label="Method"
          value={row.method}
          options={TP_METHODS}
          disabled={readOnly}
          onChange={(v) => update({ method: v })}
        />
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
          options={[
            { value: '', label: '— affiliate default —' },
            ...curves.map((c) => ({ value: c.code, label: c.code })),
          ]}
          disabled={readOnly}
          onChange={(v) => update({ curveCode: v || null })}
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
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.assignments.length} assignment(s)`}
      validate={(r) => {
        const seen = new Set<string>();
        for (const a of r.assignments) {
          if (seen.has(a.commonCoaCode)) return `Duplicate assignment for ${a.commonCoaCode}.`;
          seen.add(a.commonCoaCode);
        }
        return null;
      }}
      guidance={
        <>
          <span className="font-bold">Non-cash-flow methods, by design.</span> Oracle states plainly that ledger-grain
          data cannot support cash-flow transfer pricing, and prescribes this family instead. That is a defensible
          position in a comparison rather than an apology.
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <RuleRows<FtpAssignment>
          rows={rule.assignments}
          columns={columns}
          rowKey={(a, i) => `${a.commonCoaCode}-${i}`}
          onChange={(assignments) => update({ assignments })}
          readOnly={readOnly}
          addLabel="Add assignment"
          emptyMessage="No assignments. Positions with no rule are reported as unpriced rather than assumed zero."
          createRow={() => ({
            commonCoaCode: leaves[0]?.code ?? '',
            method: 'SpreadFromInterestRateCode',
            curveCode: null,
          })}
        />
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────

export function AdjustmentRules() {
  const { user } = useAuth();
  const { data: coa = [] } = useDimensionMembers('CommonCoa');
  const { data: rules = [], isLoading } = useRules<AdjustmentRuleDef>('AdjustmentRule');
  const { save, remove, checkDependencies } = useRuleMutations<AdjustmentRuleDef>('AdjustmentRule');

  const leaves = coa.filter((c) => c.isLeaf);

  const columns: RowColumn<AdjustmentLine>[] = [
    {
      key: 'type',
      header: 'Adjustment type',
      width: '20%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`adjt-${row.id}`}
          label="Adjustment type"
          value={row.type}
          options={ADJUSTMENT_TYPES}
          disabled={readOnly}
          onChange={(v) => update({ type: v })}
        />
      ),
    },
    {
      key: 'coa',
      header: 'Applies to',
      width: '24%',
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
      key: 'method',
      header: 'Method',
      width: '16%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`adjm-${row.id}`}
          label="Method"
          value={row.method}
          options={[
            { value: 'FixedRate' as const, label: 'Fixed rate' },
            { value: 'LcrDriven' as const, label: 'LCR-driven' },
          ]}
          disabled={readOnly}
          onChange={(v) => update({ method: v })}
        />
      ),
    },
    {
      key: 'value',
      header: 'Fixed bps',
      align: 'right',
      render: (row, update, readOnly) => (
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
      description="Named add-ons stacked on the base transfer rate — liquidity premium, basis risk, pricing incentive."
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
      validate={(r) =>
        r.adjustments.some((a) => a.method === 'LcrDriven' && a.lcrCapBps <= 0)
          ? 'An LCR-driven adjustment needs a positive cap, or it is unbounded.'
          : null
      }
      guidance={
        <>
          <span className="font-bold">Separable, not blended.</span> Several adjustments can apply to one product and
          each is reported by name, so a business unit can see what it is being charged for rather than one opaque
          spread.
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
              <table className="w-full max-w-md text-[11px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-400">
                    <th className="py-1 font-bold uppercase tracking-wider">If LCR is</th>
                    <th className="py-1 text-right font-bold uppercase tracking-wider">Add-on</th>
                  </tr>
                </thead>
                <tbody>
                  {[170, 140, 120, 100, 80].map((lcr) => {
                    const line = rule.adjustments.find((a) => a.method === 'LcrDriven')!;
                    return (
                      <tr key={lcr} className="border-b border-gray-100">
                        <td className="py-1 font-mono">{lcr}%</td>
                        <td className="py-1 text-right font-mono text-navy-900">
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
