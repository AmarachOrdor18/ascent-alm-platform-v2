import type { DimensionMember, DimensionType, Position } from './types';
import type { CodeMappingRule } from './ruleTypes';

/** Index a dimension's members for repeated lookup. */
export function indexMembers(members: DimensionMember[]): Map<string, DimensionMember> {
  return new Map(members.map((m) => [m.code, m]));
}

/**
 * Resolve a code to its canonical member - either its own code, or a source-system id registered
 * against another member's `sourceRefs` (the same real-world counterparty appearing under a
 * different id in Calypso, say, than in Flexcube). This is the single place that identity
 * resolution happens; `unmappedCodes` uses it so a cross-referenced id is recognised rather than
 * reported as missing.
 */
export function resolveByCode(members: DimensionMember[], code: string): DimensionMember | undefined {
  const direct = members.find((m) => m.code === code);
  if (direct) return direct;
  return members.find((m) => m.sourceRefs?.some((r) => r.sourceId === code));
}

/** Every descendant of a node, inclusive - selecting a rollup node must include everything beneath it. */
export function descendantCodes(members: DimensionMember[], rootCode: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const m of members) {
    if (m.parentCode === null) continue;
    const siblings = childrenOf.get(m.parentCode) ?? [];
    siblings.push(m.code);
    childrenOf.set(m.parentCode, siblings);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [rootCode];
  while (stack.length > 0) {
    const code = stack.pop()!;
    // Guard against a malformed hierarchy containing a cycle, which would
    // otherwise loop forever.
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    stack.push(...(childrenOf.get(code) ?? []));
  }
  return out;
}

/** Path from the root down to a member - used for breadcrumbs and rollup labels. */
export function ancestorPath(members: DimensionMember[], code: string): DimensionMember[] {
  const byCode = indexMembers(members);
  const path: DimensionMember[] = [];
  const seen = new Set<string>();
  let current = byCode.get(code);
  while (current && !seen.has(current.code)) {
    seen.add(current.code);
    path.unshift(current);
    current = current.parentCode ? byCode.get(current.parentCode) : undefined;
  }
  return path;
}

export interface HierarchyNode extends DimensionMember {
  children: HierarchyNode[];
  depth: number;
}

/** Build a tree for the hierarchy browser. Orphans are surfaced as roots, not dropped. */
export function buildHierarchy(members: DimensionMember[]): HierarchyNode[] {
  const byCode = new Map<string, HierarchyNode>(members.map((m) => [m.code, { ...m, children: [], depth: 0 }]));
  const roots: HierarchyNode[] = [];

  for (const node of byCode.values()) {
    const parent = node.parentCode ? byCode.get(node.parentCode) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const assignDepth = (node: HierarchyNode, depth: number) => {
    node.depth = depth;
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach((c) => assignDepth(c, depth + 1));
  };
  roots.sort((a, b) => a.name.localeCompare(b.name));
  roots.forEach((r) => assignDepth(r, 0));

  return roots;
}

/** Which field on a position carries a given dimension. */
export function positionKeyFor(dimension: DimensionType): keyof Position | null {
  switch (dimension) {
    case 'LegalEntity':
      return 'legalEntityCode';
    case 'OrgUnit':
      return 'orgUnitCode';
    case 'Product':
      return 'productCode';
    case 'GlAccount':
      return 'glAccountCode';
    case 'CommonCoa':
      return 'commonCoaCode';
    case 'Counterparty':
      return 'counterpartyId';
    default:
      return null;
  }
}

/**
 * Filter positions to a selection of dimension nodes, expanding rollups.
 *
 * An empty selection means no constraint, not an empty result - the
 * distinction matters because "all products" and "no products" are very
 * different scopes.
 */
export function filterByDimension(
  positions: Position[],
  dimension: DimensionType,
  selectedCodes: string[],
  members: DimensionMember[],
): Position[] {
  if (selectedCodes.length === 0) return positions;
  const key = positionKeyFor(dimension);
  if (!key) return positions;

  const expanded = new Set(selectedCodes.flatMap((code) => descendantCodes(members, code)));
  return positions.filter((p) => {
    const value = p[key];
    return typeof value === 'string' && expanded.has(value);
  });
}

export interface RollupTotal {
  code: string;
  name: string;
  depth: number;
  amount: number;
  /** Total including every descendant. */
  rollupAmount: number;
}

/**
 * Aggregate positions up a hierarchy.
 *
 * Reports both the amount booked directly at a node and the rollup
 * including descendants, because the difference between them is exactly the
 * question "is anything booked at a rollup level that should be at a leaf?"
 */
export function rollup(positions: Position[], dimension: DimensionType, members: DimensionMember[]): RollupTotal[] {
  const key = positionKeyFor(dimension);
  if (!key) return [];

  const direct = new Map<string, number>();
  for (const p of positions) {
    const value = p[key];
    if (typeof value !== 'string') continue;
    direct.set(value, (direct.get(value) ?? 0) + p.amount);
  }

  const nodes = buildHierarchy(members);
  const out: RollupTotal[] = [];

  const walk = (node: HierarchyNode): number => {
    const own = direct.get(node.code) ?? 0;
    const childTotal = node.children.reduce((s, c) => s + walk(c), 0);
    const rollupAmount = own + childTotal;
    out.push({ code: node.code, name: node.name, depth: node.depth, amount: own, rollupAmount });
    return rollupAmount;
  };
  nodes.forEach(walk);

  return out.sort((a, b) => a.depth - b.depth || b.rollupAmount - a.rollupAmount);
}

/**
 * Codes referenced by positions that do not exist in the dimension - these block a commit. A code
 * that resolves via another member's registered source-system cross-reference (resolveByCode) is
 * not unmapped - it's this affiliate's own counterparty, just arriving under a different system's id.
 */
export function unmappedCodes(positions: Position[], dimension: DimensionType, members: DimensionMember[]): string[] {
  const key = positionKeyFor(dimension);
  if (!key) return [];
  const missing = new Set<string>();
  for (const p of positions) {
    const value = p[key];
    if (typeof value === 'string' && value && !resolveByCode(members, value)) missing.add(value);
  }
  return Array.from(missing).sort();
}

/**
 * Dimension members a "map from this file" action would create for a set of unmapped codes, without touching
 * the store. `CommonCoa` is deliberately unsupported: that taxonomy is Group-governed and small, so an
 * unrecognised code is more likely a typo than a genuinely new classification.
 */
export function deriveMembersFromFile(
  dimension: DimensionType,
  codes: string[],
  positions: Position[],
  affiliateCode: string,
  affiliateName: string,
): DimensionMember[] {
  const key = positionKeyFor(dimension);
  if (!key || dimension === 'CommonCoa' || codes.length === 0) return [];

  const members: DimensionMember[] = [];
  const rootCode = `GL-${affiliateCode}`;

  if (dimension === 'GlAccount') {
    members.push({
      id: `GlAccount:${affiliateCode}:${rootCode}`,
      dimension: 'GlAccount',
      affiliateCode,
      code: rootCode,
      name: `${affiliateName} - Local Chart`,
      parentCode: null,
      isLeaf: false,
    });
  }

  for (const code of codes) {
    const sample = positions.find((p) => p[key] === code);
    members.push({
      id: `${dimension}:${affiliateCode}:${code}`,
      dimension,
      affiliateCode,
      code,
      name: dimension === 'GlAccount' ? (sample?.productClass ?? code) : code,
      parentCode: dimension === 'GlAccount' ? rootCode : null,
      isLeaf: true,
    });
  }
  return members;
}

/**
 * Rewrite positions' OrgUnit/GlAccount/CommonCoa codes per a configured crosswalk, before
 * `unmappedCodes` runs — a code with a matching entry is translated into the real target code and
 * never shows up as unmapped at all; a position with no matching entry passes through unchanged and
 * still falls through to today's "create from file" fallback. Pure - no store access.
 */
export function applyCodeMappings(positions: Position[], rules: CodeMappingRule[]): Position[] {
  if (rules.length === 0) return positions;

  const lookupsByKey = new Map<keyof Position, Map<string, string>>();
  for (const rule of rules) {
    const key = positionKeyFor(rule.dimension);
    if (!key) continue;
    const lookup = lookupsByKey.get(key) ?? new Map<string, string>();
    for (const entry of rule.mappings) lookup.set(entry.sourceValue, entry.targetCode);
    lookupsByKey.set(key, lookup);
  }
  if (lookupsByKey.size === 0) return positions;

  return positions.map((p) => {
    const changed: Partial<Position> = {};
    let matched = false;
    for (const [key, lookup] of lookupsByKey) {
      const value = p[key];
      if (typeof value === 'string' && lookup.has(value)) {
        (changed as Record<string, string>)[key] = lookup.get(value)!;
        matched = true;
      }
    }
    return matched ? { ...p, ...changed } : p;
  });
}
