import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/cn';
import { formatPct } from '@/lib/format';

export interface RatioThreshold {
  label: string;
  value: number;
  kind: 'regulatory' | 'internal';
}

export interface RatioPoint {
  label: string;
  value: number;
  /** Optional prior-period value; rendered as a second, muted series. */
  priorValue?: number;
}

interface RatioChartProps {
  data: RatioPoint[];
  /** At minimum the regulatory floor. */
  thresholds: RatioThreshold[];
  variant?: 'line' | 'bar';
  /** `higher` means above the threshold is good (LCR); `lower` means below is good (LDR). */
  direction?: 'higher' | 'lower';
  height?: number;
  seriesName?: string;
  className?: string;
}

const AXIS = { fontSize: 11, fill: 'hsl(var(--gray-500))' };

export function RatioChart({
  data,
  thresholds,
  variant = 'line',
  direction = 'higher',
  height = 260,
  seriesName = 'Ratio',
  className,
}: RatioChartProps) {
  const values = data.map((d) => d.value);
  const thresholdValues = thresholds.map((t) => t.value);
  const all = [...values, ...thresholdValues];
  // Keep every threshold inside the visible range.
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = Math.max((max - min) * 0.15, 2);

  const referenceLines = thresholds.map((t) => (
    <ReferenceLine
      key={`${t.kind}-${t.label}`}
      y={t.value}
      stroke={t.kind === 'regulatory' ? 'hsl(var(--danger))' : 'hsl(var(--warning))'}
      strokeDasharray={t.kind === 'regulatory' ? undefined : '5 4'}
      strokeWidth={t.kind === 'regulatory' ? 2 : 1.5}
      label={{
        value: `${t.label} ${formatPct(t.value, 0)}`,
        position: 'right',
        fontSize: 10,
        fill: t.kind === 'regulatory' ? 'hsl(var(--danger))' : 'hsl(var(--warning))',
      }}
    />
  ));

  const shared = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--gray-200))" vertical={false} />
      <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
      <YAxis domain={[min - pad, max + pad]} tick={AXIS} axisLine={false} tickLine={false} unit="%" width={52} />
      <Tooltip
        formatter={(v: number) => formatPct(v)}
        contentStyle={{ fontSize: 12, borderRadius: 9, border: '1px solid hsl(var(--gray-200))' }}
      />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {referenceLines}
    </>
  );

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        {variant === 'bar' ? (
          <BarChart data={data} margin={{ top: 8, right: 72, bottom: 4, left: 0 }}>
            {shared}
            {data.some((d) => d.priorValue !== undefined) && (
              <Bar dataKey="priorValue" name="Prior period" fill="hsl(var(--gray-300))" radius={[3, 3, 0, 0]} />
            )}
            <Bar dataKey="value" name={seriesName} fill="hsl(var(--teal-700))" radius={[3, 3, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 72, bottom: 4, left: 0 }}>
            {shared}
            {data.some((d) => d.priorValue !== undefined) && (
              <Line
                type="monotone"
                dataKey="priorValue"
                name="Prior period"
                stroke="hsl(var(--gray-300))"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              name={seriesName}
              stroke="hsl(var(--teal-700))"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
      <p className="mt-1 text-[10px] text-gray-400">
        {direction === 'higher' ? 'Higher is better' : 'Lower is better'} · solid red = regulatory minimum · dashed
        amber = internal trigger
      </p>
    </div>
  );
}
