import { useState } from 'react';
import { usePlanner } from '../state/store';

export function ImportExportDialog({ onClose }: { onClose: () => void }) {
  const tab = usePlanner((s) => s.tab);
  const exportCode = usePlanner((s) => s.exportCode);
  const importCode = usePlanner((s) => s.importCode);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const code = exportCode();
  const officialUrl =
    tab === 'passive' ? `https://www.pathofexile.com/fullscreen-passive-skill-tree/${code}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[560px] rounded-lg border border-zinc-600 bg-zinc-900 p-4 text-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-amber-300">Import / Export — {tab} tree</h2>
          <button className="text-zinc-400 hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mb-1 text-zinc-300">Export code {tab === 'passive' && '(official GGG URL format)'}</div>
        <div className="mb-2 flex gap-2">
          <input readOnly value={code} className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs" />
          <button
            onClick={() => {
              navigator.clipboard.writeText(officialUrl ?? code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded border border-zinc-700 px-3 py-1 hover:border-amber-400"
          >
            {copied ? 'Copied!' : officialUrl ? 'Copy URL' : 'Copy'}
          </button>
        </div>
        {officialUrl && (
          <a href={officialUrl} target="_blank" rel="noreferrer" className="mb-3 block truncate text-xs text-sky-400 hover:underline">
            {officialUrl}
          </a>
        )}

        <div className="mb-1 mt-4 text-zinc-300">Import a code or official tree URL</div>
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          rows={3}
          placeholder="AAAABg… or https://www.pathofexile.com/passive-skill-tree/…"
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs placeholder:text-zinc-600"
        />
        {error && <div className="mt-1 text-red-400">{error}</div>}
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => {
              const err = importCode(input);
              if (err) setError(err);
              else onClose();
            }}
            disabled={!input.trim()}
            className="rounded border border-amber-600 px-4 py-1 text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
