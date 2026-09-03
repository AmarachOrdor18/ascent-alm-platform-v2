import { Suspense, type ComponentType, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';

export interface ModuleTab {
  key: string;
  label: string;
  path: string;
  /** Independent of the module's own route permission. */
  permission: string;
  Component: ComponentType;
  /**
   * Extra path prefixes (in `prefix` matchMode) or exact paths (in `exact` matchMode) that also
   * count as "on this tab" - for a tab whose content spans more than one top-level route prefix.
   * Defaults to `[path]` when omitted, matching every existing caller's current behaviour.
   */
  matchPaths?: string[];
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

  // Secondary tabs render as an underline strip on a shaded strip, visually
  // subordinate to the primary pill tabs above them - otherwise both variants
  // read as the same kind of button and the nesting is invisible to a user.
  if (variant === 'secondary') {
    return (
      <div className="mb-5 -mt-1 flex flex-wrap gap-1 rounded-lg bg-gray-50 p-1">
        {tabs.map((t) => {
          const active = t.key === activeKey;
          return (
            <Link
              key={t.key}
              href={t.path}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors',
                active ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-navy-900',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    );
  }

  // A shared rounded track (segmented-control style) rather than separate bordered buttons over a
  // bottom rule - reads as one cohesive control, with a bolder filled pill than the secondary
  // variant's lighter treatment so the two remain visually distinct where one nests inside the other.
  return (
    <div className="mb-5 inline-flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <Link
            key={t.key}
            href={t.path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3.5 py-1.5 text-[12px] font-bold transition-colors',
              active ? 'bg-navy-900 text-white shadow-sm' : 'text-gray-600 hover:bg-white/60 hover:text-navy-900',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

function AccessRestricted({ screenName }: { screenName?: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
      <p className="text-[13px] font-bold text-navy-900">Access restricted</p>
      <p className="mt-1 text-[12px] text-gray-500">
        {screenName
          ? `Your role doesn't have access to ${screenName}.`
          : "Your role doesn't have access to any screen in this module."}
      </p>
    </div>
  );
}

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

  // 'prefix' matches nested sub-module paths beneath the tab (see DataManagementModule.tsx).
  const matches = (t: ModuleTab) => {
    const paths = t.matchPaths ?? [t.path];
    return matchMode === 'exact'
      ? paths.includes(location)
      : paths.some((p) => location === p || location.startsWith(`${p}/`));
  };

  // A module's own route can gate on the loosest of its tabs' permissions (so at least one tab is
  // reachable), which means a specific tab can still require more than that to actually view it.
  // Falling back to visible[0] here used to silently substitute a *different* tab's content with no
  // explanation whenever the URL named one the user couldn't see - landing on /treasury/ftp without
  // treasury.view rendered Profitability Ratios instead, unexplained. Distinguishing "no tab in the
  // URL at all" (fall back to the first visible tab) from "a real tab exists but this role can't see
  // it" (say so) fixes that.
  const requested = tabs.find(matches);
  const active = visible.find(matches) ?? (requested ? null : visible[0]!);

  if (!active) return <AccessRestricted screenName={requested!.label} />;

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
