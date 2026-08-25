/**
 * Dimension hierarchies — rollup, filtering and scope resolution.
 *
 * The dimensional model was the largest gap in the first revision of the
 * build plan: v1 sliced every figure by affiliate and a product *string*,
 * so it could not answer "show me Corporate Banking's repricing gap",
 * reconcile to a general ledger, or compute depositor concentration.
 *
 * OFSAA seeds six key processing dimensions plus Country and Customer, and
 * every fact carries them as columns.
 */

import type { DimensionMember, DimensionType, Position } from './types';

/** Index a dimension's members for repeated lookup. */
export function indexMembers(members: DimensionMember[]): Map<string, DimensionMember> {
  return new Map(members.map((m) => [m.code, m]));
}

/**
 * Every descendant of a node, inclusive.
 *
 * Selecting a rollup node in a hierarchy browser must include everything
 * beneath it — picking "Retail Banking" has to capture every branch under
 * it, not just positions tagged with the rollup code itself.
 */
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

/** Path from the root down to a member — used for breadcrumbs and rollup labels. */
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
 * An empty selection means no constraint, not an empty result — the
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

/** Codes referenced by positions that do not exist in the dimension — these block a commit. */
export function unmappedCodes(positions: Position[], dimension: DimensionType, members: DimensionMember[]): string[] {
  const key = positionKeyFor(dimension);
  if (!key) return [];
  const known = new Set(members.map((m) => m.code));
  const missing = new Set<string>();
  for (const p of positions) {
    const value = p[key];
    if (typeof value === 'string' && value && !known.has(value)) missing.add(value);
  }
  return Array.from(missing).sort();
}

/**
 * Dimension members a "map from this file" action would create for a set of
 * unmapped codes — without touching the store, so what gets created is
 * testable independent of how it gets persisted.
 *
 * A newly onboarded affiliate's local GL codes do not exist as dimension
 * members until someone creates them, but the file that references them
 * already carries what is needed to do so: a GL code's product class is a
 * real name, taken from the upload rather than invented.
 *
 * `CommonCoa` is deliberately unsupported. That taxonomy is Group-governed
 * and small, so a code it doesn't recognise is more likely a typo in the
 * source data than a genuinely new classification — auto-creating it would
 * hide the mistake rather than surface it.
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
      id: `GlAccount:${rootCode}`,
      dimension: 'GlAccount',
      code: rootCode,
      name: `${affiliateName} — Local Chart`,
      parentCode: null,
      isLeaf: false,
    });
  }

  for (const code of codes) {
    const sample = positions.find((p) => p[key] === code);
    members.push({
      id: `${dimension}:${code}`,
      dimension,
      code,
      name: dimension === 'GlAccount' ? (sample?.productClass ?? code) : code,
      parentCode: dimension === 'GlAccount' ? rootCode : null,
      isLeaf: true,
    });
  }
  return members;
}
