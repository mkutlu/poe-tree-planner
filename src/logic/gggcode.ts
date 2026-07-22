/**
 * GGG official tree URL code (the "AAAABg..." payload), version 6.
 *
 * Byte layout (all big-endian):
 *   version u32 | class u8 | ascendancy u8
 *   | nodeCount u8   | nodeIds u16 x n          (regular tree nodes)
 *   | clusterCount u8 | clusterIds u16 x n      (stored as id - 65536)
 *   | masteryCount u8 | (effectId u16, nodeId u16) x n
 *
 * Layout cross-checked against Path of Building's PassiveSpec.lua. Keep the
 * round-trip tests green on any change here.
 */

export interface GggBuildCode {
  version: number;
  classId: number;
  ascendancyId: number;
  nodes: number[];
  /** Cluster jewel nodes (ids >= 65536). */
  clusterNodes: number[];
  /** nodeId -> effectId */
  masteries: Map<number, number>;
}

const CLUSTER_OFFSET = 65536;

export function encodeGggCode(build: Omit<GggBuildCode, 'version' | 'clusterNodes'> & { clusterNodes?: number[] }): string {
  const nodes = [...build.nodes].sort((a, b) => a - b);
  const clusters = [...(build.clusterNodes ?? [])].sort((a, b) => a - b);
  const masteries = [...build.masteries.entries()].sort((a, b) => a[0] - b[0]);
  if (nodes.length > 255 || clusters.length > 255 || masteries.length > 255) {
    throw new Error('too many nodes for GGG code format');
  }
  const bytes: number[] = [];
  const u8 = (v: number) => bytes.push(v & 0xff);
  const u16 = (v: number) => {
    bytes.push((v >> 8) & 0xff, v & 0xff);
  };
  const u32 = (v: number) => {
    bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  };
  u32(6);
  u8(build.classId);
  u8(build.ascendancyId);
  u8(nodes.length);
  for (const n of nodes) u16(n);
  u8(clusters.length);
  for (const n of clusters) u16(n - CLUSTER_OFFSET);
  u8(masteries.length);
  for (const [nodeId, effectId] of masteries) {
    u16(effectId);
    u16(nodeId);
  }
  return toBase64Url(new Uint8Array(bytes));
}

export function decodeGggCode(code: string): GggBuildCode {
  const bytes = fromBase64Url(code.trim());
  let pos = 0;
  const u8 = () => {
    if (pos >= bytes.length) throw new Error('truncated GGG code');
    return bytes[pos++];
  };
  const u16 = () => (u8() << 8) | u8();
  const u32 = () => ((u8() << 24) | (u16() << 8) | u8()) >>> 0;

  const version = u32();
  if (version !== 6) throw new Error(`unsupported tree code version ${version} (only 6 supported)`);
  const classId = u8();
  const ascendancyId = u8();
  const nodes: number[] = [];
  const nodeCount = u8();
  for (let i = 0; i < nodeCount; i++) nodes.push(u16());
  const clusterNodes: number[] = [];
  const clusterCount = u8();
  for (let i = 0; i < clusterCount; i++) clusterNodes.push(u16() + CLUSTER_OFFSET);
  const masteries = new Map<number, number>();
  const masteryCount = u8();
  for (let i = 0; i < masteryCount; i++) {
    const effectId = u16();
    const nodeId = u16();
    masteries.set(nodeId, effectId);
  }
  return { version, classId, ascendancyId, nodes, clusterNodes, masteries };
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Extract the code payload from a full pathofexile.com tree URL (or return the input unchanged). */
export function extractCodeFromUrl(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/(?:passive-skill-tree|fullscreen-passive-skill-tree|atlas-skill-tree|fullscreen-atlas-skill-tree)\/(?:\d+\.\d+\.\d+\/)?([A-Za-z0-9\-_=]+)/);
  return m ? m[1] : trimmed;
}
