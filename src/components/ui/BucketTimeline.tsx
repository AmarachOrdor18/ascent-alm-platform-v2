/**
 * A drag-to-set boundary timeline for an ascending ladder of day-count
 * cutoffs. Unlike an allocation bar, dragging one marker doesn't trade
 * against its neighbour by a fixed total — it just has to stay between
 * them, since a bucket ladder is a sequence, not a 100% split.
 *
 * Plotted on a log scale: a ladder typically runs from a few days to
 * several years, and a linear axis would crush every short-end boundary
 * that actually needs the most precision into a sliver of pixels.
 */

import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { paletteTone } from './TierAllocationBar';

export interface TimelineBucket {
  label: string;
  upperBoundDays: number | null;
}

interface BucketTimelineProps {
  buckets: TimelineBucket[];
  onChangeBoundary: (index: number, days: number) => void;
  readOnly?: boolean;
}

const HEIGHT = 40;
const TONE_CLASS: Record<string, string> = {
  a: 'bg-navy-700',
  b: 'bg-[#01607E]',
  c: 'bg-gold-500',
  d: 'bg-[#83858C]',
};

export function BucketTimeline({ buckets, onChangeBoundary, readOnly }: BucketTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const bounded = buckets.filter((b) => b.upperBoundDays !== null).map((b) => b.upperBoundDays!);
  const lastBound = bounded[bounded.length - 1] ?? 30;
  const maxDays = Math.max(30, Math.ceil(lastBound * 1.3));

  const toFraction = (days: number) => Math.log(days + 1) / Math.log(maxDays + 1);
  const toDays = (fraction: number) => Math.exp(fraction * Math.log(maxDays + 1)) - 1;

  const boundaries = buckets.map((b) => (b.upperBoundDays === null ? maxDays : b.upperBoundDays));
  const starts = [0, ...boundaries.slice(0, -1)];

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    if (readOnly) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(index);
  };

  const handlePointerMove = (index: number) => (e: React.PointerEvent) => {
    if (dragging !== index || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const rawDays = Math.round(toDays(fraction));

    const prevBound = index > 0 ? boundaries[index - 1]! : 0;
    const nextIsOpen = index === buckets.length - 2;
    const nextBound = nextIsOpen ? maxDays : boundaries[index + 1]!;
    const clamped = Math.min(nextBound - 1, Math.max(prevBound + 1, rawDays));

    onChangeBoundary(index, clamped);
  };

  const endDrag = () => setDragging(null);

  return (
    <div className="select-none">
      <div ref={trackRef} className="relative w-full overflow-hidden rounded-lg" style={{ height: HEIGHT }}>
        {buckets.map((b, i) => {
          const left = toFraction(starts[i]!) * 100;
          const width = (toFraction(boundaries[i]!) - toFraction(starts[i]!)) * 100;
          const isOpen = b.upperBoundDays === null;
          return (
            <div
              key={`${b.label}-${i}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              className={cn(
                'absolute top-0 flex h-full items-center justify-center text-[10px] font-bold text-white',
                TONE_CLASS[paletteTone(i)],
                i > 0 && 'border-l border-white/30',
                isOpen && 'bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.15)_0px,rgba(255,255,255,0.15)_6px,transparent_6px,transparent_12px)]',
              )}
              title={isOpen ? `${b.label}: open-ended` : `${b.label}: up to ${b.upperBoundDays}d`}
            >
              <span className="truncate px-1">{b.label}</span>
            </div>
          );
        })}

        {!readOnly &&
          buckets.slice(0, -1).map((b, i) => (
            <button
              key={`handle-${i}`}
              type="button"
              aria-label={`Drag ${b.label} boundary`}
              onPointerDown={handlePointerDown(i)}
              onPointerMove={handlePointerMove(i)}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ left: `${toFraction(boundaries[i]!) * 100}%` }}
              className={cn(
                'absolute top-0 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none',
                'after:absolute after:left-1/2 after:top-1/2 after:h-5 after:w-1 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-white/70',
                dragging === i && 'after:bg-white',
              )}
            />
          ))}
      </div>
      <p className="mt-1.5 text-[10px] text-gray-400">
        Drag a boundary to move the cutoff between two buckets · plotted on a log scale
      </p>
    </div>
  );
}
