import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TreeData } from '../src/logic/types';

const dataDir = path.resolve(import.meta.dirname, '..', 'public', 'data');

function latestVersion(): string {
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'leagues.json'), 'utf8'));
  return manifest.latest;
}

let passiveCache: TreeData | null = null;
let atlasCache: TreeData | null = null;

export function loadPassive(): TreeData {
  passiveCache ??= JSON.parse(fs.readFileSync(path.join(dataDir, latestVersion(), 'passive.json'), 'utf8'));
  return passiveCache!;
}

export function loadAtlas(): TreeData {
  atlasCache ??= JSON.parse(fs.readFileSync(path.join(dataDir, latestVersion(), 'atlas.json'), 'utf8'));
  return atlasCache!;
}
