/**
 * A drag-to-set bar chart for signed values around a zero line — a rate
 * shock in basis points per bucket, not an allocation that must sum to
 * anything. Each bar moves independently; dragging up steepens a rise,
 * down steepens a fall, past the centre line into the other sign.
 */

import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface ShockPoint {
  key: string;
  label: string;
  value: number;
}

interface ShockCurveEditorProps {
  points: ShockPoint[];
  onChange: (key: string, value: number) => void;
  readOnly?: boolean;
  /** Basis-point step a drag snaps to. */
  step?: number;
}

const HEIGHT = 140;

export function ShockCurveEditor({ points, onChange, readOnly, step = 5 }: ShockCurveEditorProps) {
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [dragging, setDragging] = useState<string | null>(null);

  const maxAbs = Math.max(200, ...points.map((p) => Math.abs(p.value)));
  const range = Math.ceil((maxAbs * 1.2) / 50) * 50;

  const valueForClientY = (key: string, clientY: number) => {
    const el = colRefs.current[key];
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const raw = range - fraction * (2 * range);
    return Math.round(raw / step) * step;
  };

  const handlePointerDown = (key: string) => (e: React.PointerEvent) => {
    if (readOnly) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(key);
    onChange(key, valueForClientY(key, e.clientY));
  };

  const handlePointerMove = (key: string) => (e: React.PointerEvent) => {
    if (dragging !== key) return;
    onChange(key, valueForClientY(key, e.clientY));
  };

  const endDrag = () => setDragging(null);

  return (
    <div className="select-none">
      <div className="flex items-stretch gap-1 rounded-lg border border-gray-200 bg-gray-50/50 px-2 pt-3 pb-1" style={{ height: HEIGHT + 24 }}>
        {points.map((p) => {
          const zeroFraction = 0.5;
          const valueFraction = 0.5 - p.value / (2 * range);
          const barTop = Math.min(zeroFraction, valueFraction) * HEIGHT;
          const barHeight = Math.max(2, Math.abs(zeroFraction - valueFraction) * HEIGHT);

          return (
            <div key={p.key} className="flex flex-1 flex-col items-center">
              <div
                ref={(el) => {
                  colRefs.current[p.key] = el;
                }}
                className={cn('relative w-full touch-none', !readOnly && 'cursor-ns-resize')}
                style={{ height: HEIGHT }}
                onPointerDown={handlePointerDown(p.key)}
                onPointerMove={handlePointerMove(p.key)}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                title={`${p.label}: ${p.value > 0 ? '+' : ''}${p.value}bp`}
              >
                <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-300" />
                <div
                  className={cn(
                    'absolute left-1/2 w-3 -translate-x-1/2 rounded-sm transition-colors',
                    p.value >= 0 ? 'bg-[#01607E]' : 'bg-gold-500',
                    dragging === p.key && 'ring-2 ring-navy-900/30',
                  )}
                  style={{ top: barTop, height: barHeight }}
                />
              </div>
              <span className="mt-1 text-[9px] font-mono text-gray-500">{p.value > 0 ? '+' : ''}{p.value}</span>
              <span className="text-[9px] text-gray-400">{p.label}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-gray-400">Drag a bar up or down to set its shock in basis points</p>
    </div>
  );
}
