/**
 * Build-time preprocessing of GGG's official tree exports — league-aware.
 *
 * Scans data/raw/ for skilltree-export-<ver> / atlastree-export-<ver> pairs
 * and writes, per league version:
 *   public/data/<ver>/passive.json, public/data/<ver>/atlas.json
 *   public/assets/<ver>/passive/*, public/assets/<ver>/atlas/*
 * plus a manifest public/data/leagues.json { versions: [...], latest }.
 *
 * When a new league drops: drop the new export dirs into data/raw/ and re-run.
 * Older leagues stay available in the league selector.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ArcInfo,
  ClassInfo,
  SpriteSheets,
  TreeData,
  TreeEdge,
  TreeGroup,
  TreeKind,
  TreeNode,
} from '../src/logic/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');

/**
 * The 16-node orbits (orbits 2 and 3) are NOT evenly spaced. Angle sequence in
 * degrees, clockwise from straight up (skilltree README, 3.17 note).
 */
const ORBIT_16_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];

interface RawNode {
  skill?: number;
  name?: string;
  icon?: string;
  activeIcon?: string;
  inactiveIcon?: string;
  stats?: string[];
  reminderText?: string[];
  flavourText?: string[];
  group?: number;
  orbit?: number;
  orbitIndex?: number;
  out?: string[];
  in?: string[];
  isNotable?: boolean;
  isKeystone?: boolean;
  isMastery?: boolean;
  isJewelSocket?: boolean;
  isAscendancyStart?: boolean;
  ascendancyName?: string;
  isBloodline?: boolean;
  isWormhole?: boolean;
  isBlighted?: boolean;
  isProxy?: boolean;
  classStartIndex?: number;
  grantedPassivePoints?: number;
  masteryEffects?: { effect: number; stats: string[]; reminderText?: string[] }[];
}

interface RawGroup {
  x: number;
  y: number;
  orbits: number[];
  nodes: string[];
  background?: { image: string; isHalfImage?: boolean; offsetX?: number; offsetY?: number };
  isProxy?: boolean;
}

interface RawData {
  tree: string;
  classes?: { name: string; ascendancies: { id?: string; name?: string }[] }[];
  groups: Record<string, RawGroup>;
  nodes: Record<string, RawNode>;
  jewelSlots?: number[];
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
  constants: { skillsPerOrbit: number[]; orbitRadii: number[] };
  sprites: Record<string, Record<string, { filename: string; w: number; h: number; coords: Record<string, { x: number; y: number; w: number; h: number }> }>>;
  imageZoomLevels: number[];
  points: { totalPoints: number; ascendancyPoints?: number };
}

/** Angle in radians, clockwise from straight up. */
function nodeAngle(orbit: number, orbitIndex: number, skillsPerOrbit: number[]): number {
  const count = skillsPerOrbit[orbit];
  if (count === 16) return (ORBIT_16_ANGLES[orbitIndex] * Math.PI) / 180;
  return (2 * Math.PI * orbitIndex) / count;
}

function processTree(kind: TreeKind, version: string, exportDir: string, dataFile: string): TreeData {
  const raw: RawData = JSON.parse(fs.readFileSync(path.join(RAW, exportDir, dataFile), 'utf8'));
  const { skillsPerOrbit, orbitRadii } = raw.constants;

  const proxyGroups = new Set<string>();
  for (const [gid, g] of Object.entries(raw.groups)) {
    if (g.isProxy) proxyGroups.add(gid);
  }

  // A node participates in the tree if it has a position and is not part of a
  // cluster-jewel proxy area. The "root" entry is a virtual node.
  const isPositioned = (id: string): boolean => {
    if (id === 'root') return false;
    const n = raw.nodes[id];
    return !!n && n.group !== undefined && !n.isProxy && !proxyGroups.has(String(n.group));
  };

  const nodes: Record<string, TreeNode> = {};
  for (const [id, n] of Object.entries(raw.nodes)) {
    if (!isPositioned(id)) continue;
    const g = raw.groups[String(n.group)];
    const orbit = n.orbit ?? 0;
    const theta = nodeAngle(orbit, n.orbitIndex ?? 0, skillsPerOrbit);
    const r = orbitRadii[orbit];
    const kindOf: TreeNode['kind'] = n.isKeystone
      ? 'keystone'
      : n.isMastery
        ? 'mastery'
        : n.isJewelSocket
          ? 'jewel'
          : n.isNotable
            ? 'notable'
            : 'normal';
    const node: TreeNode = {
      id: Number(id),
      name: n.name ?? '',
      icon: n.icon ?? '',
      stats: n.stats ?? [],
      kind: kindOf,
      x: g.x + r * Math.sin(theta),
      y: g.y - r * Math.cos(theta),
      groupId: Number(n.group),
      orbit,
      orbitIndex: n.orbitIndex ?? 0,
      neighbors: [],
    };
    if (n.activeIcon) node.activeIcon = n.activeIcon;
    if (n.inactiveIcon) node.inactiveIcon = n.inactiveIcon;
    if (n.reminderText?.length) node.reminder = n.reminderText;
    if (n.flavourText?.length) node.flavour = n.flavourText;
    if (n.ascendancyName) node.ascendancy = n.ascendancyName;
    if (n.isAscendancyStart) node.isAscendancyStart = true;
    if (n.classStartIndex !== undefined) node.classStartIndex = n.classStartIndex;
    if (n.isBloodline) node.isBloodline = true;
    if (n.isWormhole) node.isWormhole = true;
    if (n.isBlighted) node.isBlighted = true;
    if (n.grantedPassivePoints) node.grantedPassivePoints = n.grantedPassivePoints;
    if (n.masteryEffects) {
      node.masteryEffects = n.masteryEffects.map((e) => ({
        id: e.effect,
        stats: e.stats,
        ...(e.reminderText?.length ? { reminder: e.reminderText } : {}),
      }));
    }
    nodes[id] = node;
  }

  // Bidirectional adjacency from the union of out/in. Edges (visual) exclude
  // masteries (the game draws no lines to them) but adjacency keeps them so
  // allocation can reach them.
  const edges: TreeEdge[] = [];
  const seen = new Set<string>();
  for (const [id, n] of Object.entries(raw.nodes)) {
    if (!isPositioned(id)) continue;
    for (const otherId of [...(n.out ?? []), ...(n.in ?? [])]) {
      if (!isPositioned(otherId) || otherId === id) continue;
      const a = nodes[id];
      const b = nodes[otherId];
      // Never connect an ascendancy to the main tree (defensive; data has none).
      if ((a.ascendancy ?? null) !== (b.ascendancy ?? null)) continue;
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      a.neighbors.push(b.id);
      b.neighbors.push(a.id);
      if (a.kind === 'mastery' || b.kind === 'mastery') continue; // adjacency only, no visual edge
      const edge: TreeEdge = { a: a.id, b: b.id };
      if (a.ascendancy) edge.asc = true;
      if (a.groupId === b.groupId && a.orbit === b.orbit && a.orbit > 0) {
        const g = raw.groups[String(a.groupId)];
        const r = orbitRadii[a.orbit];
        // Convert "clockwise from up" tree angles to canvas angles (0 = +x,
        // increasing clockwise on screen): phi = theta - PI/2.
        const phiA = nodeAngle(a.orbit, a.orbitIndex, skillsPerOrbit) - Math.PI / 2;
        const phiB = nodeAngle(b.orbit, b.orbitIndex, skillsPerOrbit) - Math.PI / 2;
        const TWO_PI = 2 * Math.PI;
        let delta = (phiB - phiA) % TWO_PI;
        if (delta < 0) delta += TWO_PI;
        const arc: ArcInfo =
          delta <= Math.PI
            ? { cx: g.x, cy: g.y, r, a1: phiA, a2: phiA + delta }
            : { cx: g.x, cy: g.y, r, a1: phiB, a2: phiB + (TWO_PI - delta) };
        edge.arc = arc;
      }
      edges.push(edge);
    }
  }

  // Groups kept only for background rendering.
  const groups: TreeGroup[] = [];
  for (const [gid, g] of Object.entries(raw.groups)) {
    if (!g.background || proxyGroups.has(gid)) continue;
    groups.push({ id: Number(gid), x: g.x, y: g.y, background: g.background });
  }

  // Classes with start node ids; ascendancy start nodes resolved by name.
  const classes: ClassInfo[] = [];
  if (raw.classes) {
    const startByClassIndex = new Map<number, number>();
    const ascStartByName = new Map<string, number>();
    for (const node of Object.values(nodes)) {
      if (node.classStartIndex !== undefined) startByClassIndex.set(node.classStartIndex, node.id);
      if (node.isAscendancyStart && node.ascendancy) ascStartByName.set(node.ascendancy, node.id);
    }
    raw.classes.forEach((c, i) => {
      const startNodeId = startByClassIndex.get(i);
      if (startNodeId === undefined) throw new Error(`no start node for class ${c.name}`);
      classes.push({
        id: i,
        name: c.name,
        startNodeId,
        ascendancies: c.ascendancies.map((a, j) => {
          const name = a.name ?? a.id ?? '';
          const asc = ascStartByName.get(name);
          if (asc === undefined) throw new Error(`no ascendancy start for ${name}`);
          return { id: j, name, startNodeId: asc };
        }),
      });
    });
  }

  // Atlas: allocation entry points are the virtual root's positioned neighbors.
  const startNodes: number[] = [];
  if (!raw.classes) {
    for (const id of raw.nodes['root']?.out ?? []) {
      if (isPositioned(id)) startNodes.push(Number(id));
    }
  }

  // Remap sprite filenames (CDN URLs) to the local files shipped in assets/.
  const assetsDir = path.join(RAW, exportDir, 'assets');
  const localAssets = new Set(fs.readdirSync(assetsDir));
  const sprites: SpriteSheets = {};
  for (const [key, byZoom] of Object.entries(raw.sprites)) {
    sprites[key] = {};
    for (const [zoom, sheet] of Object.entries(byZoom)) {
      const base = sheet.filename.split('?')[0].split('/').pop()!;
      if (!localAssets.has(base)) throw new Error(`missing local asset for ${sheet.filename} (${base})`);
      sprites[key][zoom] = { filename: base, w: sheet.w, h: sheet.h, coords: sheet.coords };
    }
  }

  return {
    version,
    kind,
    bounds: { minX: raw.min_x, minY: raw.min_y, maxX: raw.max_x, maxY: raw.max_y },
    points: { total: raw.points.totalPoints, ascendancy: raw.points.ascendancyPoints ?? 0 },
    classes,
    startNodes,
    nodes,
    edges,
    groups,
    sprites,
    zoomLevels: raw.imageZoomLevels,
    jewelSlots: raw.jewelSlots ?? [],
  };
}

function copyAssets(version: string, exportDir: string, kind: TreeKind): void {
  const src = path.join(RAW, exportDir, 'assets');
  const dst = path.join(ROOT, 'public', 'assets', version, kind);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function main(): void {
  const versions: string[] = [];
  for (const entry of fs.readdirSync(RAW)) {
    const m = entry.match(/^skilltree-export-(\d+\.\d+\.\d+)$/);
    if (m) versions.push(m[1]);
  }
  if (!versions.length) throw new Error('no skilltree-export-* directories found in data/raw/');
  versions.sort(compareVersions);

  for (const version of versions) {
    const outDir = path.join(ROOT, 'public', 'data', version);
    fs.mkdirSync(outDir, { recursive: true });
    const jobs: [TreeKind, string][] = [['passive', `skilltree-export-${version}`]];
    const atlasDir = `atlastree-export-${version}`;
    if (fs.existsSync(path.join(RAW, atlasDir))) jobs.push(['atlas', atlasDir]);
    for (const [kind, dir] of jobs) {
      const tree = processTree(kind, version, dir, 'data.json');
      const outFile = path.join(outDir, `${kind}.json`);
      fs.writeFileSync(outFile, JSON.stringify(tree));
      copyAssets(version, dir, kind);
      const mb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
      console.log(
        `${version} ${kind}: ${Object.keys(tree.nodes).length} nodes, ${tree.edges.length} edges, ` +
          `${tree.groups.length} bg groups, ${tree.classes.length} classes -> ${outFile} (${mb} MB)`,
      );
    }
  }

  const manifest = { versions, latest: versions[versions.length - 1] };
  fs.writeFileSync(path.join(ROOT, 'public', 'data', 'leagues.json'), JSON.stringify(manifest));
  console.log(`leagues.json: ${JSON.stringify(manifest)}`);
}

main();
