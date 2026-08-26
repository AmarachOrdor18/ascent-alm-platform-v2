/**
 * Application shell — sidebar navigation, scope bar, content region.
 *
 * The scope bar is deliberately part of the shell rather than each screen:
 * affiliate, as-of date and the selected run are what results are derived
 * from, so they belong to the frame, not to individual pages.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import { GROUP_CODE, useScope } from '@/context/ScopeContext';
import { useBatches } from '@/lib/hooks';
import { NAV_GROUPS } from './navigation';

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['OVERVIEW', 'RISK MANAGEMENT']));
  const { user, role, hasPermission, logout } = useAuth();
  const { affiliateCode, setAffiliateCode, affiliates, run, currency } = useScope();
  const { data: batches = [] } = useBatches();

  // "As at" reflects the data actually on file, not a scope field nothing
  // in the app ever writes to — it always read as "no data loaded" even
  // right after a commit. The most recently committed batch in the current
  // scope (any affiliate, at Group) is the real answer to "as at when".
  const asOfDate = useMemo(() => {
    const committed = batches
      .filter((b) => b.status === 'Committed' && (affiliateCode === GROUP_CODE || b.affiliateCode === affiliateCode))
      .sort((a, b) => b.asOfDate.localeCompare(a.asOfDate));
    return committed[0]?.asOfDate ?? null;
  }, [batches, affiliateCode]);

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => hasPermission(item.permission)),
      })).filter((group) => group.items.length > 0),
    [hasPermission],
  );

  const selectable = affiliates.filter((a) => a.code === GROUP_CODE || a.status === 'Live');

  const toggleGroup = (groupLabel: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupLabel)) {
        next.delete(groupLabel);
      } else {
        next.add(groupLabel);
      }
      return next;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <nav
        aria-label="Main navigation"
        className={cn('flex h-full shrink-0 flex-col bg-navy-900 transition-all duration-200', collapsed ? 'w-16' : 'w-72')}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          {/* White plate behind the mark: the Ecobank logo is dark teal and
              would disappear against the navy rail. */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white p-0.5">
            <img src="/logo-icon.png" alt="Ecobank" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-[13px] font-bold tracking-wide text-white">Ecobank</span>
              <span className="text-[10px] font-medium text-white/60">ALM Platform</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="ml-auto rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? (
                <path d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
              ) : (
                <path d="M11 19l-7-7 7-7M19 19l-7-7 7-7"/>
              )}
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-2">
          {visibleGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.label);
            const hasActiveItem = group.items.some((item) => location === item.path || location.startsWith(`${item.path}/`));
            
            return (
              <div key={group.label} className="mb-2">
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors',
                      hasActiveItem ? 'text-gold-500' : 'text-white/50 hover:text-white/80'
                    )}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('transition-transform', isExpanded ? 'rotate-90' : 'rotate-0')}>
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                    <span>{group.label}</span>
                  </button>
                )}
                
                {collapsed && <div className="px-3 mb-2 border-b border-white/10 opacity-30"></div>}
                
                {(isExpanded || collapsed) && (
                  <ul className={cn('mt-1 space-y-0.5', collapsed && 'px-1')}>
                    {group.items.map((item) => {
                      const active = location === item.path || location.startsWith(`${item.path}/`);
                      return (
                        <li key={item.path}>
                          <Link
                            href={item.path}
                            aria-current={active ? 'page' : undefined}
                            title={collapsed ? item.name : undefined}
                            className={cn(
                              'flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] transition-all duration-150',
                              active
                                ? 'bg-gold-500/10 text-gold-500 font-medium border-l-2 border-gold-500'
                                : 'text-white/70 hover:bg-white/5 hover:text-white border-l-2 border-transparent',
                              collapsed && 'justify-center px-2'
                            )}
                          >
                            {collapsed ? (
                              <span className="text-[10px] font-bold">{item.name.charAt(0)}</span>
                            ) : (
                              <>
                                <span className={cn('w-1 h-1 rounded-full transition-colors', active ? 'bg-gold-500' : 'bg-white/30')}/>
                                {item.name}
                              </>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {!collapsed && user && (
          <div className="border-t border-white/10 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white font-bold text-[12px]">
                {user.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-[12px] font-bold text-white">{user.name}</p>
                <p className="truncate text-[10px] text-white/50">{role?.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        )}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-16 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-1 bg-gold-500 rounded-full"/>
            <div>
              <h1 className="text-[14px] font-bold text-navy-900">Asset & Liability Management</h1>
              <p className="text-[10px] text-gray-500">Ecobank Group Platform</p>
            </div>
          </div>
          
          <div className="ml-auto flex items-center gap-6">
            <div className="flex items-center gap-2">
              <label htmlFor="scope-affiliate" className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Scope
              </label>
              <select
                id="scope-affiliate"
                value={affiliateCode}
                onChange={(e) => setAffiliateCode(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 bg-gray-50"
              >
                {selectable.length === 0 && <option value={GROUP_CODE}>Ecobank Group</option>}
                {selectable.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code === GROUP_CODE ? 'Ecobank Group (Consolidated)' : `${a.name} — ${a.country}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="font-bold uppercase tracking-wider text-gray-400">As at</span>
              <span className="font-mono text-navy-900">{asOfDate ? formatDate(asOfDate) : 'no data loaded'}</span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="font-bold uppercase tracking-wider text-gray-400">Currency</span>
              <span className="font-mono text-navy-900">{currency}</span>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              {run ? (
                <>
                  <span className="font-bold uppercase tracking-wider text-gray-400">Run</span>{' '}
                  <span className="font-mono text-navy-900">{run.name}</span>
                </>
              ) : (
                <span className="text-gray-400">No run selected</span>
              )}
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
