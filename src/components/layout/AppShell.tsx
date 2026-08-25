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
import { NAV_GROUPS } from './navigation';

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { user, role, hasPermission, logout } = useAuth();
  const { affiliateCode, setAffiliateCode, affiliates, asOfDate, run, currency } = useScope();

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => hasPermission(item.permission)),
      })).filter((group) => group.items.length > 0),
    [hasPermission],
  );

  const selectable = affiliates.filter((a) => a.code === GROUP_CODE || a.status === 'Live');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <nav
        aria-label="Main navigation"
        className={cn('flex flex-col bg-navy-900 transition-all duration-200', collapsed ? 'w-16' : 'w-64')}
      >
        <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
          {!collapsed && <span className="text-[13px] font-bold tracking-wide text-white">Ascent ALM</span>}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="ml-auto rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {visibleGroups.map((group) => (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <h2 className="px-4 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/40">
                  {group.label}
                </h2>
              )}
              <ul>
                {group.items.map((item) => {
                  const active = location === item.path || location.startsWith(`${item.path}/`);
                  return (
                    <li key={item.path}>
                      <Link
                        href={item.path}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? item.name : undefined}
                        className={cn(
                          'flex items-center gap-2.5 px-4 py-2 text-[12px] transition-colors',
                          active
                            ? 'border-l-2 border-gold-500 bg-white/10 font-bold text-white'
                            : 'border-l-2 border-transparent text-white/70 hover:bg-white/5 hover:text-white',
                        )}
                      >
                        {collapsed ? <span aria-hidden="true">•</span> : item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {!collapsed && user && (
          <div className="border-t border-white/10 p-4">
            <p className="truncate text-[12px] font-bold text-white">{user.name}</p>
            <p className="truncate text-[10px] text-white/50">{role?.name}</p>
            <button
              type="button"
              onClick={logout}
              className="mt-2 text-[11px] font-bold text-white/60 hover:text-white"
            >
              Sign out
            </button>
          </div>
        )}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-6">
          <label htmlFor="scope-affiliate" className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Scope
          </label>
          <select
            id="scope-affiliate"
            value={affiliateCode}
            onChange={(e) => setAffiliateCode(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
          >
            {selectable.length === 0 && <option value={GROUP_CODE}>Ecobank Group</option>}
            {selectable.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code === GROUP_CODE ? 'Ecobank Group (Consolidated)' : `${a.name} — ${a.country}`}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span className="font-bold uppercase tracking-wider text-gray-400">As at</span>
            <span className="font-mono text-navy-900">{asOfDate ? formatDate(asOfDate) : 'no data loaded'}</span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span className="font-bold uppercase tracking-wider text-gray-400">Currency</span>
            <span className="font-mono text-navy-900">{currency}</span>
          </div>

          <div className="ml-auto text-[11px] text-gray-500">
            {run ? (
              <>
                <span className="font-bold uppercase tracking-wider text-gray-400">Run</span>{' '}
                <span className="text-navy-900">{run.name}</span>
              </>
            ) : (
              <span className="text-gray-400">No run selected — results screens will prompt you to execute one</span>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
