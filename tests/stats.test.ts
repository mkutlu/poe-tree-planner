import { describe, expect, it } from 'vitest';
import { aggregateStats } from '../src/logic/stats';
import type { TreeData, TreeNode } from '../src/logic/types';

function fakeTree(nodes: Partial<TreeNode>[]): TreeData {
  const rec: Record<string, TreeNode> = {};
  nodes.forEach((n, i) => {
    const id = n.id ?? i + 1;
    rec[String(id)] = {
      id,
      name: n.name ?? `node${id}`,
      icon: '',
      stats: n.stats ?? [],
      kind: n.kind ?? 'normal',
      x: 0,
      y: 0,
      groupId: 0,
      orbit: 0,
      orbitIndex: 0,
      neighbors: [],
      ...n,
    } as TreeNode;
  });
  return {
    version: 'test',
    kind: 'passive',
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    points: { total: 123, ascendancy: 8 },
    classes: [],
    startNodes: [],
    nodes: rec,
    edges: [],
    groups: [],
    sprites: {},
    zoomLevels: [],
    jewelSlots: [],
  };
}

describe('stat aggregation', () => {
  it('sums numeric lines with the same template', () => {
    const data = fakeTree([
      { id: 1, stats: ['+10 to maximum Life', '5% increased Attack Speed'] },
      { id: 2, stats: ['+8 to maximum Life'] },
      { id: 3, stats: ['5% increased Attack Speed'] },
    ]);
    const out = aggregateStats(data, { allocated: new Set([1, 2, 3]), masteryChoices: new Map() });
    const life = out.find((s) => s.template === '+# to maximum Life')!;
    expect(life.text).toBe('+18 to maximum Life');
    expect(life.count).toBe(2);
    const as = out.find((s) => s.template === '#% increased Attack Speed')!;
    expect(as.text).toBe('10% increased Attack Speed');
  });

  it('handles decimals and negative numbers', () => {
    const data = fakeTree([
      { id: 1, stats: ['0.4% of Physical Attack Damage Leeched as Life'] },
      { id: 2, stats: ['0.2% of Physical Attack Damage Leeched as Life'] },
      { id: 3, stats: ['-10% to all Elemental Resistances'] },
    ]);
    const out = aggregateStats(data, { allocated: new Set([1, 2, 3]), masteryChoices: new Map() });
    expect(out.some((s) => s.text === '0.6% of Physical Attack Damage Leeched as Life')).toBe(true);
    expect(out.some((s) => s.text === '-10% to all Elemental Resistances')).toBe(true);
  });

  it('counts non-numeric lines without inventing numbers', () => {
    const data = fakeTree([
      { id: 1, stats: ['Your hits always ignite'] },
      { id: 2, stats: ['Your hits always ignite'] },
    ]);
    const out = aggregateStats(data, { allocated: new Set([1, 2]), masteryChoices: new Map() });
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].text).toBe('Your hits always ignite');
  });

  it('uses the chosen mastery effect stats only', () => {
    const data = fakeTree([
      {
        id: 1,
        kind: 'mastery',
        masteryEffects: [
          { id: 11, stats: ['+50 to maximum Life'] },
          { id: 12, stats: ['+50 to maximum Mana'] },
        ],
      },
    ]);
    const none = aggregateStats(data, { allocated: new Set([1]), masteryChoices: new Map() });
    expect(none).toHaveLength(0);
    const chosen = aggregateStats(data, { allocated: new Set([1]), masteryChoices: new Map([[1, 12]]) });
    expect(chosen.map((s) => s.text)).toEqual(['+50 to maximum Mana']);
  });
});
