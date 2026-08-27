/**
 * Shared tab bar for a sidebar "module" that groups several existing
 * screens. Reused by every module wrapper under `src/pages/modules/` so the
 * tab UI is visually consistent and the permission logic lives in one place
 * instead of being re-implemented per module.
 *
 * Route access (can this role open the module at all) and tab access (can
 * this role see this specific tab) are separate checks, same as the
 * existing route-vs-action split (`RouteGate` vs. in-page `hasPermission`
 * checks) — a tab never becomes visible just because its module is
 * reachable. See `protected-controls.md` §1–2.
 */

import { Suspense, type ComponentType, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';

export interface ModuleTab {
  key: string;
  label: string;
  /** Absolute path this tab renders at. */
  path: string;
  /** Permission required for this tab to appear at all — independent of the module's own route permission. */
  permission: string;
  Component: ComponentType;
}

function ScreenFallback() {
  return (
    <div className="flex items-center justify-center p-12" role="status" aria-live="polite">
      <span className="text-[12px] text-gray-400">Loading…</span>
    </div>
  );
}

function TabBar({
  tabs,
  activeKey,
  variant,
}: {
  tabs: ModuleTab[];
  activeKey: string;
  variant: 'primary' | 'secondary';
}) {
  if (tabs.length <= 1) return null;
  return (
    <div
      className={cn(
        'mb-5 flex flex-wrap gap-2',
        variant === 'primary' ? 'border-b border-gray-100 pb-3' : 'border-b border-gray-100 pb-2.5',
      )}
    >
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <Link
            key={t.key}
            href={t.path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-lg font-bold transition-colors',
              variant === 'primary' ? 'px-3 py-1.5 text-[12px]' : 'px-2.5 py-1 text-[11px]',
              active
                ? 'bg-navy-900 text-white'
                : 'border border-gray-200 text-gray-600 hover:border-navy-700 hover:text-navy-900',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

function AccessRestricted() {
  return (
    <div role="alert" className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
      <p className="text-[13px] font-bold text-navy-900">Access restricted</p>
      <p className="mt-1 text-[12px] text-gray-500">Your role doesn&rsquo;t have access to any screen in this module.</p>
    </div>
  );
}

/**
 * Renders a horizontal tab bar (hidden when only one tab is visible, so a
 * permission-filtered-down-to-one-tab module never shows a pointless single
 * button) and the active tab's existing page component beneath it.
 *
 * `matchMode: 'prefix'` is for a tab that is itself a nested sub-module (see
 * `DataManagementModule.tsx`) — the tab counts as active for every path
 * beneath it, not just its own exact path.
 */
export function ModuleTabs({
  tabs,
  variant = 'primary',
  matchMode = 'exact',
  fallback,
}: {
  tabs: ModuleTab[];
  variant?: 'primary' | 'secondary';
  matchMode?: 'exact' | 'prefix';
  fallback?: ReactNode;
}) {
  const [location] = useLocation();
  const { hasPermission } = useAuth();
  const visible = tabs.filter((t) => hasPermission(t.permission));

  if (visible.length === 0) return <AccessRestricted />;

  const active =
    (matchMode === 'exact'
      ? visible.find((t) => t.path === location)
      : visible.find((t) => location === t.path || location.startsWith(`${t.path}/`))) ?? visible[0]!;

  const ActiveComponent = active.Component;

  return (
    <>
      <TabBar tabs={visible} activeKey={active.key} variant={variant} />
      <Suspense fallback={fallback ?? <ScreenFallback />}>
        <ActiveComponent />
      </Suspense>
    </>
  );
}
