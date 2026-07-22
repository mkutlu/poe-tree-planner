/**
 * Build state <-> URL hash (+ localStorage) serialization.
 *
 * Hash format: #p=<gggcode>&a=<gggcode>&t=<passive|atlas>
 * The passive payload is the exact GGG v6 URL code (shareable with the
 * official site); the atlas payload reuses the same binary layout with
 * class/ascendancy bytes set to 0.
 */
import { decodeGggCode, encodeGggCode } from './gggcode';

export interface PassiveSnapshot {
  classId: number;
  /** 0-based ascendancy index or null for none. */
  ascendancyId: number | null;
  allocated: number[];
  /** [nodeId, effectId][] */
  masteries: [number, number][];
}

export interface AtlasSnapshot {
  allocated: number[];
}

export interface BuildSnapshot {
  tab: 'passive' | 'atlas';
  passive: PassiveSnapshot;
  atlas: AtlasSnapshot;
}

export function encodePassiveSnapshot(s: PassiveSnapshot): string {
  return encodeGggCode({
    classId: s.classId,
    // GGG byte: 0 = no ascendancy, 1..N = index + 1.
    ascendancyId: s.ascendancyId === null ? 0 : s.ascendancyId + 1,
    nodes: s.allocated.filter((n) => n < 65536),
    clusterNodes: s.allocated.filter((n) => n >= 65536),
    masteries: new Map(s.masteries),
  });
}

export function decodePassiveSnapshot(code: string): PassiveSnapshot {
  const d = decodeGggCode(code);
  return {
    classId: d.classId,
    ascendancyId: d.ascendancyId === 0 ? null : d.ascendancyId - 1,
    allocated: [...d.nodes, ...d.clusterNodes],
    masteries: [...d.masteries.entries()],
  };
}

export function encodeAtlasSnapshot(s: AtlasSnapshot): string {
  return encodeGggCode({ classId: 0, ascendancyId: 0, nodes: s.allocated, masteries: new Map() });
}

export function decodeAtlasSnapshot(code: string): AtlasSnapshot {
  return { allocated: decodeGggCode(code).nodes };
}

export function serializeBuild(b: BuildSnapshot): string {
  const parts: string[] = [];
  if (b.passive.allocated.length || b.passive.classId !== 0 || b.passive.ascendancyId !== null) {
    parts.push(`p=${encodePassiveSnapshot(b.passive)}`);
  }
  if (b.atlas.allocated.length) parts.push(`a=${encodeAtlasSnapshot(b.atlas)}`);
  if (b.tab !== 'passive') parts.push(`t=${b.tab}`);
  return parts.join('&');
}

export function deserializeBuild(hash: string): Partial<BuildSnapshot> {
  const out: Partial<BuildSnapshot> = {};
  const clean = hash.replace(/^#/, '');
  if (!clean) return out;
  for (const part of clean.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    try {
      if (key === 'p') out.passive = decodePassiveSnapshot(value);
      else if (key === 'a') out.atlas = decodeAtlasSnapshot(value);
      else if (key === 't' && (value === 'passive' || value === 'atlas')) out.tab = value;
    } catch {
      // Ignore malformed sections; the rest of the hash still loads.
    }
  }
  return out;
}
