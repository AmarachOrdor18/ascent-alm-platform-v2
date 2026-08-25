/**
 * Tree selector for dimension hierarchies.
 *
 * Used by almost every rule and by the Process Run scope picker. Selecting a
 * rollup node selects everything beneath it — picking "Retail Banking" must
 * capture every branch under it, not just positions tagged with the rollup
 * code itself.
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { buildHierarchy, descendantCodes, type HierarchyNode } from '@/engine/dimensions';
import type { DimensionMember } from '@/engine/types';

interface HierarchyBrowserProps {
  members: DimensionMember[];
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  /** Single-select for picking one node (a parent); multi for scoping. */
  mode?: 'single' | 'multi';
  /** Restrict selection to leaves — assumptions attach to leaves, not rollups. */
  leavesOnly?: boolean;
  label: string;
  emptyMessage?: string;
  className?: string;
}

export function HierarchyBrowser({
  members,
  selectedCodes,
  onChange,
  mode = 'multi',
  leavesOnly = false,
  label,
  emptyMessage = 'No members defined for this dimension yet.',
  className,
}: HierarchyBrowserProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildHierarchy(members), [members]);
  const selected = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  // A match keeps its ancestors visible, so a deep hit is not orphaned.
  const visible = useMemo(() => {
    if (!query.trim()) return null;
    const needle = query.toLowerCase();
    const keep = new Set<string>();
    const byCode = new Map(members.map((m) => [m.code, m]));
    for (const m of members) {
      if (!m.name.toLowerCase().includes(needle) && !m.code.toLowerCase().includes(needle)) continue;
      let current: DimensionMember | undefined = m;
      const guard = new Set<string>();
      while (current && !guard.has(current.code)) {
        guard.add(current.code);
        keep.add(current.code);
        current = current.parentCode ? byCode.get(current.parentCode) : undefined;
      }
    }
    return keep;
  }, [query, members]);

  const toggleNode = (node: HierarchyNode) => {
    if (leavesOnly && !node.isLeaf) return;

    if (mode === 'single') {
      onChange(selected.has(node.code) ? [] : [node.code]);
      return;
    }

    // Selecting a rollup selects its whole subtree; deselecting clears it.
    const subtree = node.isLeaf ? [node.code] : descendantCodes(members, node.code);
    const next = new Set(selected);
    const isSelected = selected.has(node.code);
    for (const code of subtree) {
      if (isSelected) next.delete(code);
      else next.add(code);
    }
    onChange(Array.from(next));
  };

  const toggleCollapse = (code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const renderNode = (node: HierarchyNode): React.ReactNode => {
    if (visible && !visible.has(node.code)) return null;
    const isCollapsed = collapsed.has(node.code) && !query.trim();
    const hasChildren = node.children.length > 0;
    const selectable = !leavesOnly || node.isLeaf;

    return (
      <li key={node.code}>
        <div
          className="flex items-center gap-1.5 rounded py-1 hover:bg-gray-50"
          style={{ paddingLeft: `${node.depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleCollapse(node.code)}
              aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${node.name}`}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] text-gray-400 hover:bg-gray-200 hover:text-navy-700"
            >
              <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}

          <input
            id={`hb-${node.code}`}
            type={mode === 'single' ? 'radio' : 'checkbox'}
            name={mode === 'single' ? `hb-${label}` : undefined}
            checked={selected.has(node.code)}
            onChange={() => toggleNode(node)}
            disabled={!selectable}
            className="shrink-0 accent-gold-500 disabled:opacity-30"
          />
          <label
            htmlFor={`hb-${node.code}`}
            className={cn(
              'cursor-pointer truncate text-[12px]',
              node.isLeaf ? 'text-gray-700' : 'font-bold text-navy-900',
              !selectable && 'cursor-default text-gray-400',
            )}
            title={`${node.name} (${node.code})`}
          >
            {node.name}
          </label>
        </div>
        {hasChildren && !isCollapsed && <ul>{node.children.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white', className)}>
      <div className="border-b border-gray-100 p-3">
        <label
          htmlFor={`hb-search-${label}`}
          className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400"
        >
          {label}
        </label>
        <input
          id={`hb-search-${label}`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
        />
      </div>

      <div className="max-h-72 overflow-y-auto p-2">
        {tree.length === 0 ? (
          <p className="p-4 text-center text-[12px] text-gray-400">{emptyMessage}</p>
        ) : (
          <ul>{tree.map(renderNode)}</ul>
        )}
      </div>

      {mode === 'multi' && (
        <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
          <span className="text-[11px] text-gray-500">
            {selected.size === 0 ? 'No constraint — all members included' : `${selected.size} selected`}
          </span>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] font-bold text-navy-700 hover:text-navy-900"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
