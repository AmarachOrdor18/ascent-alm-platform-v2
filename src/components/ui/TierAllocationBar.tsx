/**
 * A drag-to-resize stacked bar for a set of tiers that must sum to 100%.
 *
 * The table below still exists for precise numeric entry and as the audit
 * trail — the same split this app already draws between a chart and its
 * table everywhere else (a chart is not an audit trail). This is the fast,
 * visual way in: drag the boundary between two tiers and both percentages
 * update together, so the pair can never sum to anything but what they
 * started at. The one thing typing two numbers into two boxes can't
 * guarantee, dragging one handle does by construction.
 */

import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface AllocationSegment {
  key: string;
  label: string;
  percent: number;
  tone: 'core' | 'volatile';
}

const TONE_CLASS: Record<AllocationSegment['tone'], string> = {
  core: 'bg-navy-700',
  volatile: 'bg-gold-500',
};

const MIN_PERCENT = 1;

interface TierAllocationBarProps {
  segments: AllocationSegment[];
  /** Called with the updated percent for the two segments straddling a dragged handle. */
  onResize: (leftIndex: number, rightIndex: number, leftPercent: number, rightPercent: number) => void;
  readOnly?: boolean;
}

export function TierAllocationBar({ segments, onResize, readOnly }: TierAllocationBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const total = segments.reduce((s, seg) => s + seg.percent, 0);
  if (total <= 0) return null;

  const offsets: number[] = [];
  let running = 0;
  for (const seg of segments) {
    offsets.push(running);
    running += seg.percent;
  }

  const handlePointerDown = (handleIndex: number) => (e: React.PointerEvent) => {
    if (readOnly) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(handleIndex);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragging === null || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const pointPercent = fraction * total;

    const left = dragging;
    const right = dragging + 1;
    const pairStart = offsets[left]!;
    const pairTotal = segments[left]!.percent + segments[right]!.percent;
    const pairEnd = pairStart + pairTotal;

    const clamped = Math.min(pairEnd - MIN_PERCENT, Math.max(pairStart + MIN_PERCENT, pointPercent));
    const leftPercent = clamped - pairStart;
    const rightPercent = pairEnd - clamped;

    onResize(left, right, Number(leftPercent.toFixed(1)), Number(rightPercent.toFixed(1)));
  };

  const endDrag = () => setDragging(null);

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        className="relative flex h-12 w-full overflow-hidden rounded-lg"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {segments.map((seg, i) => (
          <div
            key={seg.key}
            style={{ width: `${(seg.percent / total) * 100}%` }}
            className={cn(
              'flex shrink-0 items-center justify-center text-[11px] font-bold text-white transition-colors',
              TONE_CLASS[seg.tone],
              i > 0 && 'border-l border-white/30',
            )}
            title={`${seg.label}: ${seg.percent.toFixed(1)}%`}
          >
            {seg.percent / total > 0.08 && (
              <span className="truncate px-1">
                {seg.label} · {seg.percent.toFixed(0)}%
              </span>
            )}
          </div>
        ))}

        {!readOnly &&
          segments.slice(0, -1).map((_seg, i) => (
            <button
              key={`handle-${i}`}
              type="button"
              aria-label={`Drag to reallocate between ${segments[i]!.label} and ${segments[i + 1]!.label}`}
              onPointerDown={handlePointerDown(i)}
              style={{ left: `${(offsets[i + 1]! / total) * 100}%` }}
              className={cn(
                'absolute top-0 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none',
                'after:absolute after:left-1/2 after:top-1/2 after:h-6 after:w-1 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-white/70',
                dragging === i && 'after:bg-white',
              )}
            />
          ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-gray-400">
        <span>Drag a divider to reallocate between neighbouring tiers</span>
        <span className={Math.abs(total - 100) < 0.05 ? 'text-success' : 'text-danger'}>{total.toFixed(1)}% allocated</span>
      </div>
    </div>
  );
}
