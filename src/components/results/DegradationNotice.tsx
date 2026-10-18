// "What this run computed without" - the named degradations a run recorded (no time bucket rule, no product
// characteristics, no curve, no FTP or profitability rules ...), each with a link to the screen that fixes it.
import { Link } from 'wouter';
import type { CalculationElement, ProcessRun } from '@/engine/types';

export function DegradationNotice({
  run,
  elements,
  className = 'mb-6',
}: {
  run: ProcessRun;
  /** Only show gaps affecting these elements (run-wide gaps always show). Omit for all. */
  elements?: CalculationElement[];
  className?: string;
}) {
  const list = (run.degradations ?? []).filter((d) => !elements || d.element === 'Run' || elements.includes(d.element));
  if (list.length === 0) return null;
  // The same message can be recorded against two elements (LCR and NSFR) - show it once.
  const unique = list.filter((d, i) => list.findIndex((x) => x.message === d.message) === i);
  return (
    <div
      className={`${className} rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[12px] leading-relaxed text-navy-900`}
    >
      <p className="font-bold">This run computed with something missing:</p>
      <ul className="mt-1 space-y-0.5">
        {unique.map((d) => (
          <li key={`${d.element}-${d.message}`}>
            • {d.message}
            {d.fixHref && (
              <>
                {' '}
                <Link href={d.fixHref} className="font-bold underline hover:no-underline">
                  Fix this →
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
