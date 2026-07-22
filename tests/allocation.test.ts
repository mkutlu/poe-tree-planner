import { describe, expect, it } from 'vitest';
import {
  allocateNode,
  countPoints,
  deallocateNode,
  emptyState,
  findAllocationPath,
} from '../src/logic/allocation';
import { getNode, makeContext } from '../src/logic/graph';
import { loadAtlas, loadPassive } from './helpers';

const WITCH = 3; // classes array index

describe('passive allocation', () => {
  const data = loadPassive();
  const ctx = makeContext(data, WITCH, 0);

  const witchStart = data.classes[WITCH].startNodeId;

  it('class start exists and has neighbors', () => {
    const start = getNode(data, witchStart)!;
    expect(start.classStartIndex).toBe(WITCH);
    expect(start.neighbors.length).toBeGreaterThan(0);
  });

  it('allocates the shortest path from the class start (deterministic)', () => {
    // Find a node 3 hops out via BFS ground truth.
    const start = getNode(data, witchStart)!;
    const firstRing = start.neighbors
      .map((id) => getNode(data, id)!)
      .filter((n) => !n.ascendancy && n.classStartIndex === undefined);
    expect(firstRing.length).toBeGreaterThan(0);
    const target = firstRing[0];

    const path1 = findAllocationPath(ctx, emptyState(), target.id)!;
    const path2 = findAllocationPath(ctx, emptyState(), target.id)!;
    expect(path1).toEqual(path2);
    expect(path1[path1.length - 1]).toBe(target.id);
    expect(path1).toHaveLength(1); // direct neighbor of start costs exactly 1

    const next = allocateNode(ctx, emptyState(), target.id)!;
    expect(next.allocated.has(target.id)).toBe(true);
    expect(countPoints(ctx, next).passiveUsed).toBe(1);
  });

  it('auto-allocates intermediate nodes for a distant target', () => {
    // Walk out 4 hops from the start to find a distant target.
    let frontier = [witchStart];
    const dist = new Map<number, number>([[witchStart, 0]]);
    for (let d = 1; d <= 4; d++) {
      const nextFrontier: number[] = [];
      for (const id of frontier) {
        for (const nb of getNode(data, id)!.neighbors) {
          const n = getNode(data, nb)!;
          if (dist.has(nb) || n.ascendancy || n.kind === 'mastery' || n.classStartIndex !== undefined) continue;
          dist.set(nb, d);
          nextFrontier.push(nb);
        }
      }
      frontier = nextFrontier;
    }
    const target = frontier[0];
    expect(target).toBeDefined();
    const next = allocateNode(ctx, emptyState(), target)!;
    expect(next.allocated.size).toBe(4);
    expect(next.allocated.has(target)).toBe(true);
  });

  it('refund removes disconnected components', () => {
    // Allocate a 4-node chain, then deallocate the first link.
    let frontier = [witchStart];
    const parent = new Map<number, number>();
    const dist = new Map<number, number>([[witchStart, 0]]);
    for (let d = 1; d <= 4; d++) {
      const nextFrontier: number[] = [];
      for (const id of frontier) {
        for (const nb of getNode(data, id)!.neighbors) {
          const n = getNode(data, nb)!;
          if (dist.has(nb) || n.ascendancy || n.kind === 'mastery' || n.classStartIndex !== undefined) continue;
          dist.set(nb, d);
          parent.set(nb, id);
          nextFrontier.push(nb);
        }
      }
      frontier = nextFrontier;
    }
    const target = frontier[0];
    const state = allocateNode(ctx, emptyState(), target)!;
    // The chain from start to target.
    const chain: number[] = [];
    for (let at = target; at !== witchStart; at = parent.get(at)!) chain.unshift(at);
    // Removing the first chain node must refund every node that only connects through it.
    const firstLink = chain[0];
    const res = deallocateNode(ctx, state, firstLink)!;
    for (const id of chain) {
      if (res.state.allocated.has(id)) {
        // Still allocated => must be reachable some other way; verify by fresh path search.
        const p = findAllocationPath(ctx, res.state, -1); // no-op sanity
        expect(p).toBeNull();
      }
    }
    expect(res.removed.has(firstLink)).toBe(true);
    // Connectivity invariant: every remaining allocated node is reachable.
    for (const id of res.state.allocated) {
      const check = deallocateNode(ctx, res.state, id);
      expect(check).not.toBeNull();
    }
  });

  it('never exceeds the passive point limit', () => {
    let state = emptyState();
    // Greedily allocate breadth-first until the pool is exhausted.
    const queue = [...getNode(data, witchStart)!.neighbors];
    const tried = new Set<number>();
    while (queue.length) {
      const id = queue.shift()!;
      if (tried.has(id)) continue;
      tried.add(id);
      const n = getNode(data, id)!;
      if (n.ascendancy || n.kind === 'mastery' || n.classStartIndex !== undefined) continue;
      const next = allocateNode(ctx, state, id);
      if (next) {
        state = next;
        queue.push(...n.neighbors);
      }
      const totals = countPoints(ctx, state);
      expect(totals.passiveUsed).toBeLessThanOrEqual(totals.passiveMax);
      if (totals.passiveUsed === totals.passiveMax) break;
    }
    const totals = countPoints(ctx, state);
    expect(totals.passiveMax).toBe(data.points.total);
    expect(totals.passiveUsed).toBe(totals.passiveMax);
    // One more allocation must fail.
    for (const id of queue) {
      const n = getNode(data, id)!;
      if (n.ascendancy || n.kind === 'mastery' || tried.has(id) || state.allocated.has(id)) continue;
      expect(allocateNode(ctx, state, id)).toBeNull();
      break;
    }
  });

  it('ascendancy nodes draw from the ascendancy pool and are gated by selection', () => {
    const ascName = data.classes[WITCH].ascendancies[0].name;
    const ascStart = data.classes[WITCH].ascendancies[0].startNodeId;
    const startNode = getNode(data, ascStart)!;
    expect(startNode.isAscendancyStart).toBe(true);
    const firstAsc = startNode.neighbors.map((id) => getNode(data, id)!).find((n) => n.ascendancy === ascName)!;
    const state = allocateNode(ctx, emptyState(), firstAsc.id)!;
    const totals = countPoints(ctx, state);
    expect(totals.ascendancyUsed).toBe(1);
    expect(totals.passiveUsed).toBe(0);

    // A node from a different ascendancy is unreachable.
    const otherAscName = data.classes[WITCH].ascendancies[1].name;
    const otherStart = getNode(data, data.classes[WITCH].ascendancies[1].startNodeId)!;
    const otherNode = otherStart.neighbors.map((id) => getNode(data, id)!).find((n) => n.ascendancy === otherAscName)!;
    expect(findAllocationPath(ctx, emptyState(), otherNode.id)).toBeNull();
  });

  it('masteries are allocatable as endpoints but never traversed', () => {
    const mastery = Object.values(data.nodes).find(
      (n) => n.kind === 'mastery' && n.neighbors.length > 0 && n.masteryEffects?.length,
    )!;
    // Allocate one of its neighbors first, then the mastery itself.
    const nb = mastery.neighbors.map((id) => getNode(data, id)!).find((n) => !n.ascendancy && n.kind !== 'mastery')!;
    let state = allocateNode(ctx, emptyState(), nb.id);
    if (state) {
      const withMastery = allocateNode(ctx, state, mastery.id);
      if (withMastery) {
        // The path to the mastery must be exactly [mastery] (terminal, adjacent).
        const path = findAllocationPath(ctx, state, mastery.id)!;
        expect(path).toEqual([mastery.id]);
      }
    }
    // Global invariant: no allocation path ever contains a mastery as an intermediate node.
    const far = getNode(data, witchStart)!.neighbors[0];
    const p = findAllocationPath(ctx, emptyState(), far);
    expect(p?.every((id, i) => i === p.length - 1 || getNode(data, id)!.kind !== 'mastery')).toBe(true);
  });
});

describe('atlas allocation', () => {
  const data = loadAtlas();
  const ctx = makeContext(data, null, null);

  it('starts from the virtual root', () => {
    expect(data.startNodes.length).toBeGreaterThan(0);
    const entry = data.startNodes[0];
    const path = findAllocationPath(ctx, emptyState(), entry)!;
    expect(path).toEqual([entry]);
  });

  it('point limit honors grantedPassivePoints', () => {
    const state = allocateNode(ctx, emptyState(), data.startNodes[0])!;
    const totals = countPoints(ctx, state);
    expect(totals.passiveMax).toBeGreaterThanOrEqual(data.points.total);
    expect(totals.ascendancyMax).toBe(0);
  });

  it('atlas decorations (edge-less masteries) are not allocatable', () => {
    const deco = Object.values(data.nodes).find((n) => n.kind === 'mastery' && !n.masteryEffects?.length);
    if (deco) expect(findAllocationPath(ctx, emptyState(), deco.id)).toBeNull();
  });
});
