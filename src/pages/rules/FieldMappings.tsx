import { RuleEditor, RuleField, ruleInput } from '@/components/ui/RuleEditor';
import { RuleRows, RowInput, RowSelect, type RowColumn } from '@/components/ui/RuleRows';
import { useAuth } from '@/context/AuthContext';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import { KNOWN_COLUMNS } from '@/lib/csvImport';
import { DOMAINS, DOMAIN_LABEL } from '@/components/connectors/connectorConstants';
import type { FieldMappingColumn, FieldMappingRule } from '@/engine/ruleTypes';
import type { DataDomain } from '@/engine/types';

const TRANSFORMS: FieldMappingColumn['transform'][] = ['Direct', 'Number', 'Date', 'Percent'];

export function FieldMappings() {
  const { user } = useAuth();
  const { data: rules = [], isLoading } = useRules<FieldMappingRule>('FieldMapping');
  const { save, remove, checkDependencies } = useRuleMutations<FieldMappingRule>('FieldMapping');

  const columns: RowColumn<FieldMappingColumn>[] = [
    {
      key: 'sourceField',
      header: 'Source column',
      width: '35%',
      render: (row, update, readOnly) => (
        <RowInput
          id={`fm-source-${row.sourceField}`}
          label="Source column"
          value={row.sourceField}
          placeholder="e.g. ACCT_NO"
          disabled={readOnly}
          onChange={(v) => update({ sourceField: v })}
        />
      ),
    },
    {
      key: 'targetField',
      header: 'Canonical field',
      width: '35%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`fm-target-${row.sourceField}`}
          label="Canonical field"
          value={row.targetField}
          options={KNOWN_COLUMNS}
          disabled={readOnly}
          onChange={(v) => update({ targetField: v })}
        />
      ),
    },
    {
      key: 'transform',
      header: 'Transform',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`fm-transform-${row.sourceField}`}
          label="Transform"
          value={row.transform}
          options={TRANSFORMS}
          disabled={readOnly}
          onChange={(v) => update({ transform: v as FieldMappingColumn['transform'] })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<FieldMappingRule>
      title="Field Mappings"
      description="How a source system's raw export translates into this platform's canonical columns, so a Flexcube-shaped file can be uploaded without pre-processing it by hand first."
      noun="field mapping"
      rules={rules}
      isLoading={isLoading}
      // Field mapping translates raw source data into the platform's own model — the same category
      // of change RuleEditor's own guidance puts behind data.configure rather than the default rules.edit.
      editPermission="data.configure"
      createDefault={() => ({
        ...newRuleMeta('FieldMapping', 'New field mapping', user?.name ?? 'unknown'),
        kind: 'FieldMapping',
        domain: 'Positions',
        sourceSystem: '',
        columns: [],
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.sourceSystem || 'Unnamed source'} · ${DOMAIN_LABEL[r.domain]} · ${r.columns.length} column(s)`}
      validate={(r) => {
        if (!r.sourceSystem.trim()) return 'Name the source system this mapping is for.';
        if (r.columns.length === 0) return 'Add at least one column mapping.';
        if (r.columns.some((c) => !c.sourceField.trim())) return 'Every row needs a source column name.';
        return null;
      }}
      guidance={
        <>
          A row not covered here passes through unchanged — only list the columns that actually differ from the
          canonical name. Lookups against a code table (e.g. a source product code) aren&rsquo;t handled here yet;
          this covers column renaming and simple value formats (numbers, dates, percentages).
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <RuleField label="Domain" hint="Which upload this mapping applies to.">
              <select
                value={rule.domain}
                disabled={readOnly}
                onChange={(e) => update({ domain: e.target.value as DataDomain })}
                className={ruleInput}
                aria-label="Domain"
              >
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {DOMAIN_LABEL[d]}
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

          <RuleRows<FieldMappingColumn>
            rows={rule.columns}
            columns={columns}
            rowKey={(c, i) => `${c.sourceField}-${i}`}
            onChange={(cols) => update({ columns: cols })}
            readOnly={readOnly}
            addLabel="Add column"
            emptyMessage="No columns mapped yet — every source column will be treated as unrecognized."
            createRow={() => ({ sourceField: '', targetField: KNOWN_COLUMNS[0]!, transform: 'Direct' })}
          />
        </div>
      )}
    />
  );
}
