import { RuleEditor, RuleField, ruleInput } from '@/components/ui/RuleEditor';
import { RuleRows, RowInput, type RowColumn } from '@/components/ui/RuleRows';
import { useAuth } from '@/context/AuthContext';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import type { CodeMappingEntry, CodeMappingRule } from '@/engine/ruleTypes';

type MappedDimension = CodeMappingRule['dimension'];

const DIMENSIONS: MappedDimension[] = ['OrgUnit', 'GlAccount', 'CommonCoa'];
const DIMENSION_LABEL: Record<MappedDimension, string> = {
  OrgUnit: 'Org Units',
  GlAccount: 'GL Accounts',
  CommonCoa: 'Common Chart of Accounts',
};

export function CodeMappings() {
  const { user } = useAuth();
  const { data: rules = [], isLoading } = useRules<CodeMappingRule>('CodeMapping');
  const { save, remove, checkDependencies } = useRuleMutations<CodeMappingRule>('CodeMapping');

  const columns: RowColumn<CodeMappingEntry>[] = [
    {
      key: 'sourceValue',
      header: 'Source code',
      width: '50%',
      render: (row, update, readOnly) => (
        <RowInput
          id={`cm-source-${row.sourceValue}`}
          label="Source code"
          value={row.sourceValue}
          placeholder="e.g. 10045"
          disabled={readOnly}
          onChange={(v) => update({ sourceValue: v })}
        />
      ),
    },
    {
      key: 'targetCode',
      header: 'Existing code to translate into',
      render: (row, update, readOnly) => (
        <RowInput
          id={`cm-target-${row.sourceValue}`}
          label="Existing code to translate into"
          value={row.targetCode}
          placeholder="e.g. P-CORP-TERM-LOAN"
          disabled={readOnly}
          onChange={(v) => update({ targetCode: v })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<CodeMappingRule>
      title="Code Mappings"
      description="Translates a source system's own reference codes (org units, GL accounts, chart of accounts) into codes that already exist here, so a Flexcube-shaped code doesn't fork a duplicate classification instead of resolving to the real one."
      noun="code mapping"
      rules={rules}
      isLoading={isLoading}
      // Code mapping translates raw source data into the platform's own model — the same category
      // of change RuleEditor's own guidance puts behind data.configure rather than the default rules.edit.
      editPermission="data.configure"
      createDefault={() => ({
        ...newRuleMeta('CodeMapping', 'New code mapping', user?.name ?? 'unknown'),
        kind: 'CodeMapping',
        dimension: 'GlAccount',
        sourceSystem: '',
        mappings: [],
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.sourceSystem || 'Unnamed source'} · ${DIMENSION_LABEL[r.dimension]} · ${r.mappings.length} code(s)`}
      validate={(r) => {
        if (!r.sourceSystem.trim()) return 'Name the source system this mapping is for.';
        if (r.mappings.length === 0) return 'Add at least one code mapping.';
        if (r.mappings.some((m) => !m.sourceValue.trim() || !m.targetCode.trim())) {
          return 'Every row needs both a source code and a target code.';
        }
        return null;
      }}
      guidance={
        <>
          The target code must already exist as a real member of that dimension — this only translates a source
          value into it, it never creates a new one. Counterparties aren&rsquo;t mapped here: use the "Also known
          as" cross-reference on the Counterparty Register instead, which is edited directly on the counterparty
          itself rather than as a bulk table.
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <RuleField label="Dimension" hint="Which classification this mapping applies to.">
              <select
                value={rule.dimension}
                disabled={readOnly}
                onChange={(e) => update({ dimension: e.target.value as MappedDimension })}
                className={ruleInput}
                aria-label="Dimension"
              >
                {DIMENSIONS.map((d) => (
                  <option key={d} value={d}>
                    {DIMENSION_LABEL[d]}
                  </option>
                ))}
              </select>
            </RuleField>
            <RuleField label="Source system" hint="Organizational label only, e.g. Flexcube.">
              <input
                value={rule.sourceSystem}
                disabled={readOnly}
                onChange={(e) => update({ sourceSystem: e.target.value })}
                placeholder="e.g. Flexcube"
                className={ruleInput}
              />
            </RuleField>
          </div>

          <RuleRows<CodeMappingEntry>
            rows={rule.mappings}
            columns={columns}
            rowKey={(m, i) => `${m.sourceValue}-${i}`}
            onChange={(mappings) => update({ mappings })}
            readOnly={readOnly}
            addLabel="Add code"
            emptyMessage="No codes mapped yet — every source code will be treated as unrecognized."
            createRow={() => ({ sourceValue: '', targetCode: '' })}
          />
        </div>
      )}
    />
  );
}
