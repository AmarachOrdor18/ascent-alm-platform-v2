import { RuleEditor } from '@/components/ui/RuleEditor';
import { RuleRows, RowInput, RowSelect, type RowColumn } from '@/components/ui/RuleRows';
import { Amount } from '@/components/ui/Amount';
import { useAuth } from '@/context/AuthContext';
import { useCurrencies, useDimensionMembers } from '@/lib/hooks';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import type { TransactionAction, TransactionLine, TransactionStrategyRule } from '@/engine/ruleTypes';

const ACTIONS: Array<{ value: TransactionAction; label: string }> = [
  { value: 'Add', label: 'Add (originate or issue)' },
  { value: 'Sell', label: 'Sell (dispose)' },
  { value: 'Hedge', label: 'Hedge (off-balance-sheet)' },
];

export function TransactionStrategies() {
  const { user } = useAuth();
  const { data: products = [] } = useDimensionMembers('Product');
  const { data: currencies = [] } = useCurrencies();
  const { data: rules = [], isLoading } = useRules<TransactionStrategyRule>('TransactionStrategy');
  const { save, remove, checkDependencies } = useRuleMutations<TransactionStrategyRule>('TransactionStrategy');

  const leaves = products.filter((p) => p.isLeaf);

  const createDefault = (): TransactionStrategyRule => ({
    ...newRuleMeta('TransactionStrategy', 'New transaction strategy', user?.name ?? 'unknown'),
    kind: 'TransactionStrategy',
    transactions: [],
  });

  const columns: RowColumn<TransactionLine>[] = [
    {
      key: 'action',
      header: 'Action',
      width: '16%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`act-${row.productCode}-${row.amount}`}
          label="Action"
          value={row.action}
          options={ACTIONS}
          disabled={readOnly}
          onChange={(v) => update({ action: v })}
        />
      ),
    },
    {
      key: 'product',
      header: 'Product',
      width: '20%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`tsprod-${row.productCode}-${row.amount}`}
          label="Product"
          value={row.productCode}
          options={leaves.map((p) => ({ value: p.code, label: p.name }))}
          disabled={readOnly}
          onChange={(v) => update({ productCode: v })}
        />
      ),
    },
    {
      key: 'currency',
      header: 'Ccy',
      width: '8%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`tsccy-${row.productCode}-${row.amount}`}
          label="Currency"
          value={row.currency}
          options={currencies.map((c) => c.code)}
          disabled={readOnly}
          onChange={(v) => update({ currency: v })}
        />
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`tsamt-${row.productCode}-${row.amount}`}
          label="Amount"
          type="number"
          value={row.amount}
          disabled={readOnly}
          onChange={(v) => update({ amount: Number(v) })}
        />
      ),
    },
    {
      key: 'execution',
      header: 'Executes',
      render: (row, update, readOnly) => (
        <RowInput
          id={`tsexe-${row.productCode}-${row.amount}`}
          label="Execution date"
          type="date"
          value={row.executionDate ?? ''}
          disabled={readOnly}
          onChange={(v) => update({ executionDate: v || null })}
        />
      ),
    },
    {
      key: 'maturity',
      header: 'Matures',
      render: (row, update, readOnly) => (
        <RowInput
          id={`tsmat-${row.productCode}-${row.amount}`}
          label="Maturity date"
          type="date"
          value={row.maturityDate ?? ''}
          disabled={readOnly}
          onChange={(v) => update({ maturityDate: v || null })}
        />
      ),
    },
    {
      key: 'rate',
      header: 'Rate %',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`tsrate-${row.productCode}-${row.amount}`}
          label="Rate"
          type="number"
          step="0.05"
          value={row.ratePercent ?? ''}
          disabled={readOnly}
          onChange={(v) => update({ ratePercent: v === '' ? null : Number(v) })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<TransactionStrategyRule>
      title="Transaction Strategies"
      description="Balance-sheet actions inside a scenario — issue, sell, hedge. The difference between shocking rates and testing a decision."
      noun="strategy"
      rules={rules}
      isLoading={isLoading}
      createDefault={createDefault}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.transactions.length} transaction(s)`}
      validate={(r) => {
        for (const t of r.transactions) {
          if (t.amount <= 0) return 'Every transaction needs a positive amount — use the action to express direction.';
          if (t.executionDate && t.maturityDate && t.maturityDate <= t.executionDate) {
            return `${t.productCode}: maturity must fall after execution.`;
          }
        }
        return null;
      }}
      guidance={
        <>
          <span className="font-bold">Decisions, not shocks.</span> A rate scenario asks what happens if the market
          moves. A transaction strategy asks what happens if <em>we</em> move — issue term funding, sell down the bill
          book, hedge the duration gap. Attach one to a run to see the combined effect.
        </>
      }
      renderBody={(rule, update, readOnly) => {
        const byAction = (action: TransactionAction) =>
          rule.transactions.filter((t) => t.action === action).reduce((s, t) => s + t.amount, 0);

        return (
          <div className="space-y-4">
            <RuleRows<TransactionLine>
              rows={rule.transactions}
              columns={columns}
              rowKey={(_t, i) => `tx-${i}`}
              onChange={(transactions) => update({ transactions })}
              readOnly={readOnly}
              addLabel="Add transaction"
              emptyMessage="No transactions. Add one to express a balance-sheet action."
              createRow={() => ({
                action: 'Add',
                productCode: leaves[0]?.code ?? '',
                currency: currencies[0]?.code ?? 'USD',
                amount: 0,
                executionDate: null,
                maturityDate: null,
                ratePercent: null,
                isOffBalanceSheet: false,
                note: '',
              })}
            />

            {rule.transactions.length > 0 && (
              <dl className="grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4 text-[12px]">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Added</dt>
                  <dd>
                    <Amount value={byAction('Add')} currency={rule.transactions[0]!.currency} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sold</dt>
                  <dd>
                    <Amount value={byAction('Sell')} currency={rule.transactions[0]!.currency} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Hedged (notional)</dt>
                  <dd>
                    <Amount value={byAction('Hedge')} currency={rule.transactions[0]!.currency} />
                  </dd>
                </div>
              </dl>
            )}

            {rule.transactions.map((t, i) => (
              <div key={`note-${i}`} className="flex items-start gap-2">
                <label htmlFor={`tsnote-${i}`} className="mt-1 w-24 shrink-0 text-[11px] text-gray-500">
                  Note {i + 1}
                </label>
                <input
                  id={`tsnote-${i}`}
                  value={t.note}
                  disabled={readOnly}
                  placeholder="Why this transaction is in the strategy"
                  onChange={(e) =>
                    update({
                      transactions: rule.transactions.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)),
                    })
                  }
                  className="flex-1 rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
                />
              </div>
            ))}
          </div>
        );
      }}
    />
  );
}
