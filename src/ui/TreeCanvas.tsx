import { useEffect, useMemo, useRef, useState } from 'react';
import type { TreeData, TreeKind } from '../logic/types';
import { TreeRenderer, type VisualState } from '../tree/renderer';
import { currentBuild, usePlanner } from '../state/store';
import { Tooltip } from './Tooltip';

function buildSearchIndex(data: TreeData): Map<number, string> {
  const idx = new Map<number, string>();
  for (const n of Object.values(data.nodes)) {
    const effectText = n.masteryEffects?.flatMap((e) => e.stats).join(' ') ?? '';
    idx.set(n.id, `${n.name} ${n.stats.join(' ')} ${effectText}`.toLowerCase());
  }
  return idx;
}

export function TreeCanvas({ kind, data }: { kind: TreeKind; data: TreeData }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TreeRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const version = usePlanner((s) => s.version);

  const searchIndex = useMemo(() => buildSearchIndex(data), [data]);

  // Mount/unmount the Pixi scene.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !version) return;
    let cancelled = false;
    let renderer: TreeRenderer | null = null;
    setReady(false);
    TreeRenderer.create(host, data, `assets/${version}/${kind}/`, {
      onNodeClick: (id) => usePlanner.getState().clickNode(id),
      onNodeHover: (id) => usePlanner.getState().setHover(id),
    }).then((r) => {
      if (cancelled) {
        r.destroy();
        return;
      }
      renderer = r;
      rendererRef.current = r;
      setReady(true);
    });
    return () => {
      cancelled = true;
      renderer?.destroy();
      rendererRef.current = null;
    };
  }, [data, kind, version]);

  // Push store changes into the Pixi scene (outside React's render cycle).
  useEffect(() => {
    if (!ready) return;
    const apply = () => {
      const s = usePlanner.getState();
      if (s.tab !== kind) return;
      const r = rendererRef.current;
      if (!r) return;
      const build = currentBuild(s);
      const cls = kind === 'passive' ? data.classes[build.classId] : undefined;
      const asc = cls && build.ascendancyId !== null ? cls.ascendancies[build.ascendancyId] : undefined;
      const q = s.search.trim().toLowerCase();
      const matches = new Set<number>();
      if (q.length >= 2) {
        for (const [id, text] of searchIndex) {
          if (text.includes(q)) matches.add(id);
        }
      }
      const visual: VisualState = {
        allocated: build.allocated,
        hoverAdd: new Set(s.hoverAdd),
        hoverRemove: new Set(s.hoverRemove),
        searchMatches: matches,
        classId: kind === 'passive' ? build.classId : null,
        classStartId: cls?.startNodeId ?? null,
        ascStartId: asc?.startNodeId ?? null,
        ascendancyName: asc?.name ?? null,
      };
      r.applyState(visual);
    };
    apply();
    const unsub = usePlanner.subscribe(
      (s) => [currentBuild(s).allocated, s.hoverAdd, s.hoverRemove, s.search, s.passive.classId, s.passive.ascendancyId, s.tab],
      apply,
      { equalityFn: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]) },
    );
    return unsub;
  }, [ready, data, kind, searchIndex]);

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden"
      onPointerMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
    >
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-zinc-400">Loading tree…</div>
      )}
      <Tooltip data={data} mouse={mouse} />
    </div>
  );
}
