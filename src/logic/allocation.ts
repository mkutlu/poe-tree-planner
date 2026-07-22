import type { AllocContext } from './graph';
import { getNode, implicitIds, isAllocatable, isTraversable } from './graph';

export interface AllocState {
  allocated: Set<number>;
  masteryChoices: Map<number, number>;
}

export interface PointTotals {
  passiveUsed: number;
  passiveMax: number;
  ascendancyUsed: number;
  ascendancyMax: number;
}

export function emptyState(): AllocState {
  return { allocated: new Set(), masteryChoices: new Map() };
}

export function countPoints(ctx: AllocContext, state: AllocState): PointTotals {
  let passiveUsed = 0;
  let ascendancyUsed = 0;
  let granted = 0;
  for (const id of state.allocated) {
    const node = getNode(ctx.data, id);
    if (!node) continue;
    if (node.ascendancy) ascendancyUsed++;
    else {
      passiveUsed++;
      if (node.grantedPassivePoints) granted += node.grantedPassivePoints;
    }
  }
  return {
    passiveUsed,
    passiveMax: ctx.data.points.total + granted,
    ascendancyUsed,
    ascendancyMax: ctx.data.points.ascendancy,
  };
}

/**
 * Shortest path of *new* nodes needed to allocate `targetId`, BFS from every
 * currently allocated (or implicit start / atlas entry) node. Deterministic:
 * neighbor expansion in ascending id order. Returns null if unreachable.
 */
export function findAllocationPath(ctx: AllocContext, state: AllocState, targetId: number): number[] | null {
  const target = getNode(ctx.data, targetId);
  if (!target || state.allocated.has(targetId) || !isAllocatable(target, ctx)) return null;

  const implicit = implicitIds(ctx);
  const sources = new Set<number>([...state.allocated, ...implicit]);
  const parent = new Map<number, number>(); // child -> parent on the BFS tree
  const queue: number[] = [];
  const visited = new Set<number>();

  const seed = (id: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    queue.push(id);
  };

  // BFS outward from the allocated frontier.
  for (const id of [...sources].sort((a, b) => a - b)) seed(id);
  // Atlas: the virtual root makes every start node reachable at cost 1.
  if (ctx.data.kind === 'atlas') {
    for (const id of [...ctx.data.startNodes].sort((a, b) => a - b)) {
      if (!visited.has(id)) {
        const node = getNode(ctx.data, id);
        if (node && isAllocatable(node, ctx)) {
          visited.add(id);
          parent.set(id, -1);
          queue.push(id);
        }
      }
    }
  }

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === targetId) {
      const path: number[] = [];
      let at: number | undefined = cur;
      while (at !== undefined && at !== -1 && !sources.has(at)) {
        path.push(at);
        at = parent.get(at);
      }
      return path.reverse();
    }
    const curNode = getNode(ctx.data, cur)!;
    // Only expand through nodes we may travel through: sources always expand,
    // new path nodes must be traversable (masteries are endpoints only).
    if (!sources.has(cur) && !isTraversable(curNode, ctx)) continue;
    for (const nb of [...curNode.neighbors].sort((a, b) => a - b)) {
      if (visited.has(nb)) continue;
      const nbNode = getNode(ctx.data, nb);
      if (!nbNode) continue;
      if (nb !== targetId && !sources.has(nb) && !isTraversable(nbNode, ctx)) {
        if (!(nb === targetId)) continue;
      }
      visited.add(nb);
      parent.set(nb, cur);
      queue.push(nb);
    }
  }
  return null;
}

/**
 * Allocate `targetId` plus its connecting path. Fails (returns null) if the
 * node is unreachable or the relevant point pool would be exceeded.
 */
export function allocateNode(ctx: AllocContext, state: AllocState, targetId: number): AllocState | null {
  const path = findAllocationPath(ctx, state, targetId);
  if (!path) return null;
  const allocated = new Set(state.allocated);
  for (const id of path) allocated.add(id);
  const next: AllocState = { allocated, masteryChoices: new Map(state.masteryChoices) };
  const totals = countPoints(ctx, next);
  if (totals.passiveUsed > totals.passiveMax || totals.ascendancyUsed > totals.ascendancyMax) return null;
  return next;
}

/** All allocated ids reachable from the implicit starts (or atlas root) through the allocated set. */
function reachableAllocated(ctx: AllocContext, allocated: Set<number>): Set<number> {
  const reachable = new Set<number>();
  const queue: number[] = [];
  const push = (id: number) => {
    if (!reachable.has(id)) {
      reachable.add(id);
      queue.push(id);
    }
  };
  for (const id of implicitIds(ctx)) push(id);
  if (ctx.data.kind === 'atlas') {
    for (const id of ctx.data.startNodes) if (allocated.has(id)) push(id);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    const node = getNode(ctx.data, cur);
    if (!node) continue;
    // Masteries can be reached but never traversed.
    if (node.kind === 'mastery' && !implicitIds(ctx).has(cur)) continue;
    for (const nb of node.neighbors) {
      if (allocated.has(nb)) push(nb);
    }
  }
  return reachable;
}

/**
 * Deallocate `targetId`; any allocated nodes disconnected from the start as a
 * result are refunded too (PoB behavior). Returns the removed set alongside
 * the new state.
 */
export function deallocateNode(
  ctx: AllocContext,
  state: AllocState,
  targetId: number,
): { state: AllocState; removed: Set<number> } | null {
  if (!state.allocated.has(targetId)) return null;
  const allocated = new Set(state.allocated);
  allocated.delete(targetId);
  const reachable = reachableAllocated(ctx, allocated);
  const removed = new Set<number>([targetId]);
  for (const id of allocated) {
    if (!reachable.has(id)) removed.add(id);
  }
  for (const id of removed) allocated.delete(id);
  const masteryChoices = new Map(state.masteryChoices);
  for (const id of removed) masteryChoices.delete(id);
  return { state: { allocated, masteryChoices }, removed };
}

/** Set of nodes that clicking an allocated node would refund (for hover preview). */
export function previewDeallocation(ctx: AllocContext, state: AllocState, targetId: number): Set<number> {
  const res = deallocateNode(ctx, state, targetId);
  return res ? res.removed : new Set();
}
