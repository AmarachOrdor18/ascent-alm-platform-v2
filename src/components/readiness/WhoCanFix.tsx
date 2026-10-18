// "Can be fixed by: ..." for one readiness item - the people who hold the permission at that scope - and,
// when the signed-in user is one of them, the button that fixes it. Never names a single owner.
import { Link } from 'wouter';
import { cn } from '@/lib/cn';
import { fixerSentence, useCanFix, useWhoCanFix } from '@/lib/whoCanFix';
import type { ReadinessItem } from '@/lib/readiness';

export function WhoCanFix({
  item,
  affiliateCode,
  className,
  hideAction,
}: {
  item: Pick<ReadinessItem, 'fixPermission' | 'fixHref' | 'fixLabel' | 'scope'>;
  /** The affiliate the item belongs to (ignored for a Group item). */
  affiliateCode: string | null;
  className?: string;
  /** Show only the names, not the fix button. */
  hideAction?: boolean;
}) {
  const scopeCode = item.scope === 'Group' ? 'GROUP' : affiliateCode;
  const canFix = useCanFix()(item.fixPermission, item.scope, scopeCode);
  const { data: fixers, isLoading } = useWhoCanFix(item.fixPermission, scopeCode);

  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-[12px]', className)}>
      <span className="text-gray-500">
        <span className="font-bold text-gray-600">Can be fixed by:</span>{' '}
        {isLoading ? '…' : fixerSentence(fixers ?? [])}
        {item.scope === 'Group' && <span className="text-gray-400"> - a Group item</span>}
      </span>
      {canFix && !hideAction && (
        <Link
          href={item.fixHref}
          className="rounded-lg bg-navy-900 px-3 py-1 text-[12px] font-bold text-white hover:bg-navy-700"
        >
          {item.fixLabel}
        </Link>
      )}
    </div>
  );
}
