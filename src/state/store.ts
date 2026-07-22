import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  allocateNode,
  countPoints,
  deallocateNode,
  findAllocationPath,
  previewDeallocation,
  type AllocState,
  type PointTotals,
} from '../logic/allocation';
import { getNode, makeContext, type AllocContext } from '../logic/graph';
import { extractCodeFromUrl } from '../logic/gggcode';
import type { TreeData, TreeKind } from '../logic/types';
import {
  decodeAtlasSnapshot,
  decodePassiveSnapshot,
  deserializeBuild,
  encodeAtlasSnapshot,
  encodePassiveSnapshot,
  serializeBuild,
  type BuildSnapshot,
} from '../logic/urlstate';

export interface TreeBuild {
  classId: number;
  ascendancyId: number | null;
  allocated: Set<number>;
  masteryChoices: Map<number, number>;
}

const STORAGE_PREFIX = 'poe-tree-planner:';

function emptyBuild(): TreeBuild {
  return { classId: 0, ascendancyId: null, allocated: new Set(), masteryChoices: new Map() };
}

function asAllocState(b: TreeBuild): AllocState {
  return { allocated: b.allocated, masteryChoices: b.masteryChoices };
}

export interface PlannerStore {
  versions: string[];
  version: string | null;
  loading: boolean;
  error: string | null;
  passiveData: TreeData | null;
  atlasData: TreeData | null;
  tab: TreeKind;
  passive: TreeBuild;
  atlas: TreeBuild;
  hoverNodeId: number | null;
  /** Node ids that clicking the hovered node would allocate. */
  hoverAdd: number[];
  /** Node ids that clicking the hovered node would refund. */
  hoverRemove: number[];
  search: string;
  masteryDialogNodeId: number | null;

  bootstrap: () => Promise<void>;
  loadLeague: (version: string) => Promise<void>;
  setTab: (tab: TreeKind) => void;
  setClass: (classId: number) => void;
  setAscendancy: (ascendancyId: number | null) => void;
  clickNode: (id: number) => void;
  chooseMastery: (effectId: number) => void;
  closeMasteryDialog: () => void;
  deallocateFromDialog: () => void;
  setHover: (id: number | null) => void;
  setSearch: (q: string) => void;
  resetTree: () => void;
  exportCode: () => string;
  importCode: (input: string) => string | null;
}

export function currentData(s: PlannerStore): TreeData | null {
  return s.tab === 'passive' ? s.passiveData : s.atlasData;
}

export function currentBuild(s: PlannerStore): TreeBuild {
  return s.tab === 'passive' ? s.passive : s.atlas;
}

export function currentCtx(s: PlannerStore): AllocContext | null {
  const data = currentData(s);
  if (!data) return null;
  const build = currentBuild(s);
  return makeContext(data, build.classId, build.ascendancyId);
}

export function currentTotals(s: PlannerStore): PointTotals | null {
  const ctx = currentCtx(s);
  return ctx ? countPoints(ctx, asAllocState(currentBuild(s))) : null;
}

function snapshotOf(s: PlannerStore): BuildSnapshot {
  return {
    tab: s.tab,
    passive: {
      classId: s.passive.classId,
      ascendancyId: s.passive.ascendancyId,
      allocated: [...s.passive.allocated],
      masteries: [...s.passive.masteryChoices.entries()],
    },
    atlas: { allocated: [...s.atlas.allocated] },
  };
}

function persist(s: PlannerStore): void {
  if (!s.version) return;
  const body = serializeBuild(snapshotOf(s));
  const hash = body ? `#v=${s.version}&${body}` : `#v=${s.version}`;
  history.replaceState(null, '', hash);
  try {
    localStorage.setItem(STORAGE_PREFIX + s.version, body);
    localStorage.setItem(STORAGE_PREFIX + 'last-version', s.version);
  } catch {
    /* storage may be unavailable */
  }
}

function applySnapshot(s: Pick<PlannerStore, 'passiveData' | 'atlasData'>, snap: Partial<BuildSnapshot>): Partial<PlannerStore> {
  const out: Partial<PlannerStore> = {};
  if (snap.tab) out.tab = snap.tab;
  if (snap.passive && s.passiveData) {
    const valid = snap.passive.allocated.filter((id) => getNode(s.passiveData!, id));
    out.passive = {
      classId: Math.min(Math.max(snap.passive.classId, 0), Math.max(s.passiveData.classes.length - 1, 0)),
      ascendancyId: snap.passive.ascendancyId,
      allocated: new Set(valid),
      masteryChoices: new Map(snap.passive.masteries.filter(([id]) => getNode(s.passiveData!, id))),
    };
  }
  if (snap.atlas && s.atlasData) {
    out.atlas = {
      classId: 0,
      ascendancyId: null,
      allocated: new Set(snap.atlas.allocated.filter((id) => getNode(s.atlasData!, id))),
      masteryChoices: new Map(),
    };
  }
  return out;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  return res.json();
}

export const usePlanner = create<PlannerStore>()(
  subscribeWithSelector((set, get) => ({
    versions: [],
    version: null,
    loading: true,
    error: null,
    passiveData: null,
    atlasData: null,
    tab: 'passive',
    passive: emptyBuild(),
    atlas: emptyBuild(),
    hoverNodeId: null,
    hoverAdd: [],
    hoverRemove: [],
    search: '',
    masteryDialogNodeId: null,

    bootstrap: async () => {
      try {
        const manifest = await fetchJson<{ versions: string[]; latest: string }>('data/leagues.json');
        const hashVersion = location.hash.match(/[#&]v=([\d.]+)/)?.[1];
        const stored = localStorage.getItem(STORAGE_PREFIX + 'last-version');
        const version =
          hashVersion && manifest.versions.includes(hashVersion)
            ? hashVersion
            : stored && manifest.versions.includes(stored)
              ? stored
              : manifest.latest;
        set({ versions: manifest.versions });
        await get().loadLeague(version);
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    },

    loadLeague: async (version: string) => {
      set({ loading: true, error: null });
      try {
        const [passiveData, atlasData] = await Promise.all([
          fetchJson<TreeData>(`data/${version}/passive.json`),
          fetchJson<TreeData>(`data/${version}/atlas.json`),
        ]);
        const base: Partial<PlannerStore> = {
          version,
          passiveData,
          atlasData,
          passive: emptyBuild(),
          atlas: emptyBuild(),
          hoverNodeId: null,
          hoverAdd: [],
          hoverRemove: [],
          masteryDialogNodeId: null,
          loading: false,
        };
        // Prefer the URL hash (shared link), else this league's saved build.
        const fromHash = deserializeBuild(location.hash.replace(/^#/, '').replace(/(^|&)v=[\d.]+/, ''));
        const saved = localStorage.getItem(STORAGE_PREFIX + version);
        const snap = Object.keys(fromHash).length ? fromHash : saved ? deserializeBuild(saved) : {};
        set({ ...base, ...applySnapshot({ passiveData, atlasData }, snap) });
        persist(get());
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    },

    setTab: (tab) => {
      set({ tab, hoverNodeId: null, hoverAdd: [], hoverRemove: [], masteryDialogNodeId: null });
      persist(get());
    },

    setClass: (classId) => {
      // Changing class resets the passive allocation (paths are class-relative).
      set({ passive: { ...emptyBuild(), classId } });
      persist(get());
    },

    setAscendancy: (ascendancyId) => {
      const s = get();
      const data = s.passiveData;
      if (!data) return;
      // Drop allocated nodes belonging to the previous ascendancy.
      const allocated = new Set([...s.passive.allocated].filter((id) => !getNode(data, id)?.ascendancy));
      const masteryChoices = new Map([...s.passive.masteryChoices].filter(([id]) => allocated.has(id)));
      set({ passive: { ...s.passive, ascendancyId, allocated, masteryChoices } });
      persist(get());
    },

    clickNode: (id) => {
      const s = get();
      const data = currentData(s);
      const ctx = currentCtx(s);
      if (!data || !ctx) return;
      const build = currentBuild(s);
      const node = getNode(data, id);
      if (!node) return;
      const key = s.tab === 'passive' ? 'passive' : 'atlas';

      if (build.allocated.has(id)) {
        if (node.kind === 'mastery') {
          set({ masteryDialogNodeId: id });
          return;
        }
        const res = deallocateNode(ctx, asAllocState(build), id);
        if (res) {
          set({
            [key]: { ...build, allocated: res.state.allocated, masteryChoices: res.state.masteryChoices },
            hoverNodeId: null,
            hoverAdd: [],
            hoverRemove: [],
          } as Partial<PlannerStore>);
          persist(get());
        }
        return;
      }

      const next = allocateNode(ctx, asAllocState(build), id);
      if (next) {
        set({
          [key]: { ...build, allocated: next.allocated, masteryChoices: next.masteryChoices },
          hoverAdd: [],
          hoverRemove: [],
          ...(node.kind === 'mastery' ? { masteryDialogNodeId: id } : {}),
        } as Partial<PlannerStore>);
        persist(get());
      }
    },

    chooseMastery: (effectId) => {
      const s = get();
      const nodeId = s.masteryDialogNodeId;
      if (nodeId === null || s.tab !== 'passive') return;
      const masteryChoices = new Map(s.passive.masteryChoices);
      masteryChoices.set(nodeId, effectId);
      set({ passive: { ...s.passive, masteryChoices }, masteryDialogNodeId: null });
      persist(get());
    },

    closeMasteryDialog: () => set({ masteryDialogNodeId: null }),

    deallocateFromDialog: () => {
      const s = get();
      const nodeId = s.masteryDialogNodeId;
      const ctx = currentCtx(s);
      if (nodeId === null || !ctx || s.tab !== 'passive') return;
      const res = deallocateNode(ctx, asAllocState(s.passive), nodeId);
      if (res) {
        set({
          passive: { ...s.passive, allocated: res.state.allocated, masteryChoices: res.state.masteryChoices },
          masteryDialogNodeId: null,
        });
        persist(get());
      } else {
        set({ masteryDialogNodeId: null });
      }
    },

    setHover: (id) => {
      const s = get();
      if (id === s.hoverNodeId) return;
      if (id === null) {
        set({ hoverNodeId: null, hoverAdd: [], hoverRemove: [] });
        return;
      }
      const ctx = currentCtx(s);
      if (!ctx) return;
      const build = currentBuild(s);
      if (build.allocated.has(id)) {
        set({ hoverNodeId: id, hoverAdd: [], hoverRemove: [...previewDeallocation(ctx, asAllocState(build), id)] });
      } else {
        const path = findAllocationPath(ctx, asAllocState(build), id);
        set({ hoverNodeId: id, hoverAdd: path ?? [], hoverRemove: [] });
      }
    },

    setSearch: (q) => set({ search: q }),

    resetTree: () => {
      const s = get();
      if (s.tab === 'passive') {
        set({ passive: { ...emptyBuild(), classId: s.passive.classId, ascendancyId: s.passive.ascendancyId } });
      } else {
        set({ atlas: emptyBuild() });
      }
      persist(get());
    },

    exportCode: () => {
      const s = get();
      if (s.tab === 'passive') {
        return encodePassiveSnapshot({
          classId: s.passive.classId,
          ascendancyId: s.passive.ascendancyId,
          allocated: [...s.passive.allocated],
          masteries: [...s.passive.masteryChoices.entries()],
        });
      }
      return encodeAtlasSnapshot({ allocated: [...s.atlas.allocated] });
    },

    importCode: (input) => {
      const s = get();
      const code = extractCodeFromUrl(input);
      try {
        if (s.tab === 'passive') {
          const snap = decodePassiveSnapshot(code);
          set(applySnapshot(s, { passive: snap }));
        } else {
          const snap = decodeAtlasSnapshot(code);
          set(applySnapshot(s, { atlas: snap }));
        }
        persist(get());
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
  })),
);
