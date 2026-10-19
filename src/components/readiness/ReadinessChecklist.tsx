// A readiness list grouped by category (Setup, Data, From Group, Rules, Calibration, Governance): each item's
// status, what exactly is missing, the output it degrades and who can fix it. Used by the Run screen's
// pre-flight check; reusable on Home.
import { cn } from '@/lib/cn';
import {
  READINESS_CATEGORIES,
  type Readiness,
  type ReadinessItem,
  type ReadinessStatus,
  type ReadinessVerdict,
} from '@/lib/readiness';
import { WhoCanFix } from './WhoCanFix';

const MARK: Record<ReadinessStatus, { sign: string; cls: string; label: string }> = {
  ok: { sign: '✓', cls: 'bg-success text-white', label: 'done' },
  missing: { sign: '✗', cls: 'bg-danger text-white', label: 'missing' },
  warning: { sign: '!', cls: 'bg-warning text-white', label: 'needs attention' },
  default: { sign: '–', cls: 'bg-gray-300 text-white', label: 'standard default in use' },
};

export const VERDICT_TONE: Record<ReadinessVerdict, string> = {
  Ready: 'bg-success-bg text-success',
  'Ready with warnings': 'bg-warning-bg text-warning',
  Blocked: 'bg-danger-bg text-danger',
  'Signed off': 'bg-navy-50 text-navy-700',
};

export function VerdictBadge({ verdict }: { verdict: ReadinessVerdict }) {
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-bold', VERDICT_TONE[verdict])}>
      {verdict === 'Ready' ? 'Ready to run' : verdict}
    </span>
  );
}

export function ReadinessRow({ item, affiliateCode }: { item: ReadinessItem; affiliateCode: string | null }) {
  if (item.signedOff) {
    return (
      <li className="flex items-start gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-navy-900">{item.label}</p>
          <p className="text-[12px] leading-relaxed text-gray-500">
            {item.detail} To run this date again, reopen it (Run &amp; results → Runs → Reopen) - that creates a new
            version.
          </p>
        </div>
      </li>
    );
  }
  const mark = item.blocking && item.status !== 'ok' ? MARK.missing : MARK[item.status];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
          mark.cls,
        )}
      >
        {mark.sign}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-navy-900">
          {item.label}
          <span className="sr-only"> - {mark.label}</span>
          {item.blocking && item.status !== 'ok' && (
            <span className="ml-2 text-[11px] font-bold uppercase text-danger">Blocks the run</span>
          )}
        </p>
        <p className="text-[12px] leading-relaxed text-gray-500">{item.detail}</p>
        {item.status !== 'ok' && item.degradation && (
          <p className="text-[12px] leading-relaxed text-warning">Effect: {item.degradation}</p>
        )}
        {item.status !== 'ok' && <WhoCanFix item={item} affiliateCode={affiliateCode} className="mt-1" />}
      </div>
    </li>
  );
}

export function ReadinessChecklist({
  readiness,
  showOk = true,
  categories = READINESS_CATEGORIES,
}: {
  readiness: Readiness;
  /** Include items that are already done. */
  showOk?: boolean;
  categories?: typeof READINESS_CATEGORIES;
}) {
  const affiliateCode = readiness.affiliateCode === 'GROUP' ? null : readiness.affiliateCode;
  // What needs attention is shown in full; what is done is one short line (detail on hover) - less scrolling.
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
      {categories.map((cat) => {
        const inCat = readiness.items.filter((i) => i.category === cat);
        const open = inCat.filter((i) => i.status !== 'ok');
        const done = showOk ? inCat.filter((i) => i.status === 'ok') : [];
        if (open.length === 0 && done.length === 0) return null;
        return (
          <section key={cat}>
            <h3 className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {cat}
              <span className="font-normal normal-case tracking-normal">
                {done.length}/{inCat.length} done
              </span>
            </h3>
            {open.length > 0 && (
              <ul className="divide-y divide-gray-50">
                {open.map((i) => (
                  <ReadinessRow key={i.key} item={i} affiliateCode={affiliateCode} />
                ))}
              </ul>
            )}
            {done.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {done.map((i) => (
                  <li key={i.key} title={i.detail} className="flex items-center gap-2 text-[12px] text-gray-600">
                    <span aria-hidden="true" className="font-bold text-success">
                      ✓
                    </span>
                    <span className="truncate">{i.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
