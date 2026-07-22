import { useEffect } from 'react';
import { usePlanner } from './state/store';
import { TreeCanvas } from './ui/TreeCanvas';
import { TopBar } from './ui/TopBar';
import { StatPanel } from './ui/StatPanel';
import { MasteryDialog } from './ui/MasteryDialog';

export default function App() {
  const bootstrap = usePlanner((s) => s.bootstrap);
  const loading = usePlanner((s) => s.loading);
  const error = usePlanner((s) => s.error);
  const tab = usePlanner((s) => s.tab);
  const passiveData = usePlanner((s) => s.passiveData);
  const atlasData = usePlanner((s) => s.atlasData);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const data = tab === 'passive' ? passiveData : atlasData;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <TopBar />
      <main className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {error && (
            <div className="flex h-full items-center justify-center text-red-400">
              Failed to load tree data: {error}
            </div>
          )}
          {!error && loading && <div className="flex h-full items-center justify-center text-zinc-400">Loading…</div>}
          {!error && !loading && data && <TreeCanvas key={`${data.version}-${tab}`} kind={tab} data={data} />}
        </div>
        <StatPanel />
      </main>
      <MasteryDialog />
      <footer className="border-t border-zinc-800 bg-zinc-950 px-4 py-1 text-center text-xs text-zinc-600">
        This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
      </footer>
    </div>
  );
}
