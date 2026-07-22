import { useMemo } from 'react';
import { aggregateStats } from '../logic/stats';
import { currentBuild, currentData, usePlanner } from '../state/store';

export function StatPanel() {
  const data = usePlanner(currentData);
  const build = usePlanner(currentBuild);

  const stats = useMemo(() => {
    if (!data) return [];
    return aggregateStats(data, { allocated: build.allocated, masteryChoices: build.masteryChoices });
  }, [data, build.allocated, build.masteryChoices]);

  if (!data) return null;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 p-3 text-sm font-semibold text-zinc-300">
        Aggregated stats ({build.allocated.size} nodes)
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {stats.length === 0 && <div className="text-sm text-zinc-500">Allocate nodes to see their combined stats.</div>}
        <ul className="space-y-1">
          {stats.map((s) => (
            <li key={s.template} className="text-sm text-sky-300">
              {s.text}
              {s.count > 1 && <span className="ml-1 text-xs text-zinc-500">×{s.count}</span>}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
