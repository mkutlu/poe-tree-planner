import type { AllocState } from './allocation';
import type { TreeData } from './types';
import { getNode } from './graph';

export interface AggregatedStat {
  /** Stat line with summed numbers substituted back in, e.g. "+45 to maximum Life". */
  text: string;
  /** Template with numbers replaced by #, used as the merge key. */
  template: string;
  /** How many stat lines were merged into this entry. */
  count: number;
}

const NUM_RE = /-?\d+(?:\.\d+)?/g;

/** Round away float noise from summing (e.g. 0.30000000000000004). */
function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Group the stat lines of all allocated nodes (and chosen mastery effects) by
 * their numeric template and sum the numbers position-wise.
 */
export function aggregateStats(data: TreeData, state: AllocState): AggregatedStat[] {
  const byKey = new Map<string, { template: string; sums: number[]; count: number }>();

  const addLine = (line: string) => {
    const nums = [...line.matchAll(NUM_RE)].map((m) => Number(m[0]));
    const template = line.replace(NUM_RE, '#');
    const key = `${nums.length}|${template}`;
    const entry = byKey.get(key);
    if (entry) {
      nums.forEach((n, i) => (entry.sums[i] += n));
      entry.count++;
    } else {
      byKey.set(key, { template, sums: nums, count: 1 });
    }
  };

  for (const id of state.allocated) {
    const node = getNode(data, id);
    if (!node) continue;
    if (node.kind === 'mastery') {
      const effectId = state.masteryChoices.get(id);
      const effect = node.masteryEffects?.find((e) => e.id === effectId);
      for (const line of effect?.stats ?? []) addLine(line);
    } else {
      for (const line of node.stats) addLine(line);
    }
  }

  const out: AggregatedStat[] = [];
  for (const { template, sums, count } of byKey.values()) {
    let i = 0;
    const text = template.replace(/#/g, () => fmt(sums[i++] ?? 0));
    out.push({ text, template, count });
  }
  out.sort((a, b) => a.text.localeCompare(b.text));
  return out;
}
