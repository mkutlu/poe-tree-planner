import { getNode } from '../logic/graph';
import { usePlanner } from '../state/store';

export function MasteryDialog() {
  const nodeId = usePlanner((s) => s.masteryDialogNodeId);
  const data = usePlanner((s) => s.passiveData);
  const chosen = usePlanner((s) => (nodeId !== null ? s.passive.masteryChoices.get(nodeId) : undefined));
  const chooseMastery = usePlanner((s) => s.chooseMastery);
  const close = usePlanner((s) => s.closeMasteryDialog);
  const deallocate = usePlanner((s) => s.deallocateFromDialog);

  if (nodeId === null || !data) return null;
  const node = getNode(data, nodeId);
  if (!node?.masteryEffects) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={close}>
      <div
        className="max-h-[80vh] w-[520px] overflow-y-auto rounded-lg border border-zinc-600 bg-zinc-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-amber-300">{node.name}</h2>
          <button className="text-zinc-400 hover:text-white" onClick={close}>
            ✕
          </button>
        </div>
        <div className="space-y-2">
          {node.masteryEffects.map((e) => (
            <button
              key={e.id}
              onClick={() => chooseMastery(e.id)}
              className={`block w-full rounded border p-2 text-left text-sm hover:border-amber-400 ${
                e.id === chosen ? 'border-amber-400 bg-amber-400/10' : 'border-zinc-700 bg-zinc-800'
              }`}
            >
              {e.stats.map((line, i) => (
                <div key={i} className="text-sky-300">
                  {line}
                </div>
              ))}
              {e.reminder?.map((line, i) => (
                <div key={i} className="text-xs text-zinc-400">
                  {line}
                </div>
              ))}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={deallocate}
            className="rounded border border-red-800 px-3 py-1 text-sm text-red-400 hover:bg-red-900/30"
          >
            Refund node
          </button>
        </div>
      </div>
    </div>
  );
}
