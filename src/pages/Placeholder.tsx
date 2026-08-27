import { ModuleHeader } from '@/components/layout/ModuleHeader';
import type { NavItem } from '@/components/layout/navigation';

export function Placeholder({ item }: { item: NavItem }) {
  return (
    <>
      <ModuleHeader
        title={item.name}
        description="This screen is part of the agreed scope and has not been built yet."
        asOfDate={null}
      />
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <p className="text-[13px] font-bold text-navy-900">Scheduled for phase {item.phase}</p>
        <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
          The foundation, engine and component library are built first so that every screen inherits the same
          conventions — currency-aware amounts, threshold lines, prior-period variance and drill-through — rather than
          each one re-deciding them.
        </p>
        <p className="mt-4 font-mono text-[11px] text-gray-400">{item.path}</p>
      </div>
    </>
  );
}
