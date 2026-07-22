import type { TreeData, TreeNode } from './types';

/** Resolved allocation context for one tree + class/ascendancy selection. */
export interface AllocContext {
  data: TreeData;
  /** Implicitly allocated, zero-cost class start node (passive only). */
  classStartId: number | null;
  /** Implicitly allocated, zero-cost ascendancy start node (passive only). */
  ascStartId: number | null;
  /** Selected ascendancy name; ascendancy nodes of other trees are blocked. */
  ascendancyName: string | null;
}

export function makeContext(data: TreeData, classId: number | null, ascendancyId: number | null): AllocContext {
  if (data.kind === 'atlas' || classId === null || !data.classes.length) {
    return { data, classStartId: null, ascStartId: null, ascendancyName: null };
  }
  const cls = data.classes[classId];
  const asc = ascendancyId !== null ? (cls.ascendancies[ascendancyId] ?? null) : null;
  return {
    data,
    classStartId: cls.startNodeId,
    ascStartId: asc ? asc.startNodeId : null,
    ascendancyName: asc ? asc.name : null,
  };
}

export function getNode(data: TreeData, id: number): TreeNode | undefined {
  return data.nodes[String(id)];
}

/** Can this node ever be part of an allocation for the current context? */
export function isAllocatable(node: TreeNode, ctx: AllocContext): boolean {
  if (node.classStartIndex !== undefined) return false; // class starts are implicit
  if (node.isAscendancyStart) return false; // ascendancy starts are implicit
  if (node.ascendancy) {
    // Covers regular ascendancies, alternate ascendancies and bloodlines:
    // only nodes of the currently selected ascendancy are reachable.
    return node.ascendancy === ctx.ascendancyName;
  }
  if (node.kind === 'mastery' && !node.masteryEffects?.length) return false; // decorative (atlas)
  return true;
}

/** May a path pass *through* this node (masteries are terminal-only)? */
export function isTraversable(node: TreeNode, ctx: AllocContext): boolean {
  return isAllocatable(node, ctx) && node.kind !== 'mastery';
}

/** Implicit (auto-allocated, zero-cost) node ids for the context. */
export function implicitIds(ctx: AllocContext): Set<number> {
  const s = new Set<number>();
  if (ctx.classStartId !== null) s.add(ctx.classStartId);
  if (ctx.ascStartId !== null) s.add(ctx.ascStartId);
  return s;
}
