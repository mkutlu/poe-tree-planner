/** Preprocessed tree data — output of scripts/preprocess.ts, loaded from public/data/. */

export type TreeKind = 'passive' | 'atlas';

export type NodeKind = 'normal' | 'notable' | 'keystone' | 'mastery' | 'jewel';

export interface SpriteCoords {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteSheet {
  /** Local asset filename, e.g. "skills-3.jpg" (under public/assets/<tree>/). */
  filename: string;
  w: number;
  h: number;
  coords: Record<string, SpriteCoords>;
}

/** sprite key -> zoom level (string) -> sheet */
export type SpriteSheets = Record<string, Record<string, SpriteSheet>>;

export interface MasteryEffect {
  id: number;
  stats: string[];
  reminder?: string[];
}

export interface TreeNode {
  id: number;
  name: string;
  /** Icon path — key into sprite sheet coords (normalActive etc.). */
  icon: string;
  /** Mastery-only icon variants. */
  activeIcon?: string;
  inactiveIcon?: string;
  stats: string[];
  reminder?: string[];
  flavour?: string[];
  kind: NodeKind;
  /** Precomputed world coordinates. */
  x: number;
  y: number;
  groupId: number;
  orbit: number;
  orbitIndex: number;
  /** Ascendancy (or alternate-ascendancy / bloodline owner) name, if any. */
  ascendancy?: string;
  isAscendancyStart?: boolean;
  /** Class whose start point this is (index into TreeData.classes). */
  classStartIndex?: number;
  isBloodline?: boolean;
  isWormhole?: boolean;
  isBlighted?: boolean;
  /** Extra skill points granted when allocated (atlas has these). */
  grantedPassivePoints?: number;
  masteryEffects?: MasteryEffect[];
  /** Bidirectional adjacency (ids), positioned nodes only, virtual root excluded. */
  neighbors: number[];
}

export interface ArcInfo {
  cx: number;
  cy: number;
  r: number;
  /** Start/end angles in radians (renderer convention: 0 = +x axis, CCW positive). Sweep from a1 to a2 the short way. */
  a1: number;
  a2: number;
}

export interface TreeEdge {
  a: number;
  b: number;
  /** Present when the edge is an orbit-centered arc; otherwise draw a straight line. */
  arc?: ArcInfo;
  /** True when both endpoints belong to an ascendancy (rendered/routed separately). */
  asc?: boolean;
}

export interface TreeGroup {
  id: number;
  x: number;
  y: number;
  background?: { image: string; isHalfImage?: boolean };
}

export interface AscendancyInfo {
  id: number;
  name: string;
  startNodeId: number;
}

export interface ClassInfo {
  id: number;
  name: string;
  startNodeId: number;
  ascendancies: AscendancyInfo[];
}

export interface TreeData {
  version: string;
  kind: TreeKind;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  points: { total: number; ascendancy: number };
  /** Empty for the atlas tree. */
  classes: ClassInfo[];
  /** Atlas: nodes adjacent to the virtual root (allocation entry points). Empty for passive. */
  startNodes: number[];
  nodes: Record<string, TreeNode>;
  edges: TreeEdge[];
  groups: TreeGroup[];
  sprites: SpriteSheets;
  zoomLevels: number[];
  jewelSlots: number[];
}
