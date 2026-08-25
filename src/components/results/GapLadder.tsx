/**
 * A gap ladder — bars per bucket, cumulative gap as a line.
 *
 * Used by liquidity gap, repricing gap and the behavioural comparison, so
 * the three read identically. The cumulative line is what a banker actually
 * looks at: a single negative bucket is normal, a cumulative gap that never
 * closes is not.
 */

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Amount } from '@/components/ui/Amount';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { formatAmount } from '@/lib/format';
import type { BucketedTotal } from '@/engine/buckets';
import type { CurrencyCode } from '@/engine/types';

const AXIS = { fontSize: 11, fill: 'hsl(var(--gray-500))' };

export function GapLadderChart({
  buckets,
  currency,
  height = 300,
}: {
  buckets: BucketedTotal[];
  currency: CurrencyCode;
  height?: number;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={buckets} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="hsl(var(--gray-200))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="bucket" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatAmount(v, currency)} />
          <Tooltip
            formatter={(value: number, name: string) => [formatAmount(value, currency), name]}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--gray-200))' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {/* Zero is the meaningful reference on a gap chart, unlike on a
              ratio chart where v1 drew it and called it a threshold. */}
          <ReferenceLine y={0} stroke="hsl(var(--gray-400))" strokeWidth={1} />
          <Bar dataKey="assets" name="Assets" fill="hsl(var(--teal-700))" radius={[2, 2, 0, 0]} />
          <Bar dataKey="liabilities" name="Liabilities" fill="hsl(var(--amber-500))" radius={[2, 2, 0, 0]} />
          <Line
            type="monotone"
            dataKey="cumulativeGap"
            name="Cumulative gap"
            stroke="hsl(var(--danger))"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The same ladder as numbers, because a chart is not an audit trail. */
export function GapLadderTable({
  buckets,
  currency,
  priorBuckets,
}: {
  buckets: BucketedTotal[];
  currency: CurrencyCode;
  priorBuckets?: BucketedTotal[];
}) {
  const columns: ResultColumn<BucketedTotal>[] = [
    { key: 'bucket', header: 'Bucket', render: (b) => <span className="font-medium">{b.bucket}</span> },
    {
      key: 'assets',
      header: 'Assets',
      align: 'right',
      render: (b) => <Amount value={b.assets} currency={currency} />,
      compareValue: (b) => b.assets,
    },
    {
      key: 'liabilities',
      header: 'Liabilities',
      align: 'right',
      render: (b) => <Amount value={b.liabilities} currency={currency} />,
      compareValue: (b) => b.liabilities,
    },
    {
      key: 'gap',
      header: 'Gap',
      align: 'right',
      render: (b) => <Amount value={b.gap} currency={currency} colorBySign />,
      compareValue: (b) => b.gap,
    },
    {
      key: 'cumulativeGap',
      header: 'Cumulative gap',
      align: 'right',
      render: (b) => <Amount value={b.cumulativeGap} currency={currency} colorBySign />,
      compareValue: (b) => b.cumulativeGap,
    },
  ];

  return (
    <ResultTable
      rows={buckets}
      columns={columns}
      rowKey={(b) => b.bucket}
      priorRows={priorBuckets}
      priorLabel="vs contractual"
      emptyMessage="This run produced no buckets."
    />
  );
}
