import type { TreeData } from '../logic/types';
import { getNode } from '../logic/graph';
import { usePlanner } from '../state/store';

export function Tooltip({ data, mouse }: { data: TreeData; mouse: { x: number; y: number } }) {
  const hoverId = usePlanner((s) => s.hoverNodeId);
  const hoverAdd = usePlanner((s) => s.hoverAdd);
  const hoverRemove = usePlanner((s) => s.hoverRemove);
  const masteryChoice = usePlanner((s) => (hoverId !== null ? s.passive.masteryChoices.get(hoverId) : undefined));
  if (hoverId === null) return null;
  const node = getNode(data, hoverId);
  if (!node) return null;

  const chosenEffect = node.masteryEffects?.find((e) => e.id === masteryChoice);
  const stats = node.kind === 'mastery' ? (chosenEffect?.stats ?? []) : node.stats;

  // Keep the tooltip on-screen: flip to the left of the cursor near the right edge.
  const flip = mouse.x > window.innerWidth - 380;
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(mouse.y + 14, window.innerHeight - 200),
    ...(flip ? { right: window.innerWidth - mouse.x + 14 } : { left: mouse.x + 14 }),
  };

  return (
    <div
      style={style}
      className="pointer-events-none z-40 w-max max-w-sm rounded border border-zinc-600 bg-zinc-900/95 p-3 text-sm shadow-xl"
    >
      <div className="mb-1 font-semibold text-amber-300">{node.name}</div>
      {stats.map((line, i) => (
        <div key={i} className="text-sky-300">
          {line}
        </div>
      ))}
      {node.kind === 'mastery' && !chosenEffect && (
        <div className="italic text-zinc-400">Click to choose a mastery effect</div>
      )}
      {node.reminder?.map((line, i) => (
        <div key={i} className="text-zinc-400">
          {line}
        </div>
      ))}
      {node.flavour?.map((line, i) => (
        <div key={i} className="italic text-amber-100/70">
          {line}
        </div>
      ))}
      {hoverAdd.length > 0 && <div className="mt-1 text-emerald-400">Allocates {hoverAdd.length} point{hoverAdd.length > 1 ? 's' : ''}</div>}
      {hoverRemove.length > 0 && <div className="mt-1 text-red-400">Refunds {hoverRemove.length} point{hoverRemove.length > 1 ? 's' : ''}</div>}
    </div>
  );
}
