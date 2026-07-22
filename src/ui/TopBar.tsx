import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { currentTotals, usePlanner } from '../state/store';
import { ImportExportDialog } from './ImportExport';

export function TopBar() {
  const tab = usePlanner((s) => s.tab);
  const setTab = usePlanner((s) => s.setTab);
  const versions = usePlanner((s) => s.versions);
  const version = usePlanner((s) => s.version);
  const loadLeague = usePlanner((s) => s.loadLeague);
  const data = usePlanner((s) => s.passiveData);
  const classId = usePlanner((s) => s.passive.classId);
  const ascendancyId = usePlanner((s) => s.passive.ascendancyId);
  const setClass = usePlanner((s) => s.setClass);
  const setAscendancy = usePlanner((s) => s.setAscendancy);
  const totals = usePlanner(useShallow(currentTotals));
  const search = usePlanner((s) => s.search);
  const setSearch = usePlanner((s) => s.setSearch);
  const resetTree = usePlanner((s) => s.resetTree);
  const [showImportExport, setShowImportExport] = useState(false);

  const cls = data?.classes[classId];

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-sm">
      <h1 className="mr-2 font-bold text-amber-300">PoE Tree Planner</h1>

      <nav className="flex overflow-hidden rounded border border-zinc-700">
        {(['passive', 'atlas'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 capitalize ${tab === t ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-400 hover:text-white'}`}
          >
            {t}
          </button>
        ))}
      </nav>

      <select
        value={version ?? ''}
        onChange={(e) => loadLeague(e.target.value)}
        title="League version"
        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
      >
        {versions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      {tab === 'passive' && data && (
        <>
          <select
            value={classId}
            onChange={(e) => setClass(Number(e.target.value))}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
          >
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={ascendancyId ?? -1}
            onChange={(e) => setAscendancy(e.target.value === '-1' ? null : Number(e.target.value))}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
          >
            <option value={-1}>No ascendancy</option>
            {cls?.ascendancies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </>
      )}

      {totals && (
        <span className="text-zinc-300">
          <b className={totals.passiveUsed >= totals.passiveMax ? 'text-red-400' : 'text-amber-300'}>
            {totals.passiveUsed}
          </b>
          /{totals.passiveMax}
          {totals.ascendancyMax > 0 && (
            <>
              {' · asc '}
              <b className={totals.ascendancyUsed >= totals.ascendancyMax ? 'text-red-400' : 'text-amber-300'}>
                {totals.ascendancyUsed}
              </b>
              /{totals.ascendancyMax}
            </>
          )}
        </span>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search nodes…"
        className="ml-auto w-56 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 placeholder:text-zinc-600"
      />

      <button
        onClick={() => setShowImportExport(true)}
        className="rounded border border-zinc-700 px-3 py-1 text-zinc-300 hover:border-amber-400 hover:text-amber-300"
      >
        Import / Export
      </button>
      <button
        onClick={() => {
          if (confirm('Reset the current tree?')) resetTree();
        }}
        className="rounded border border-zinc-700 px-3 py-1 text-zinc-400 hover:border-red-500 hover:text-red-400"
      >
        Reset
      </button>

      {showImportExport && <ImportExportDialog onClose={() => setShowImportExport(false)} />}
    </header>
  );
}
