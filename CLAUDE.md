# PoE Tree Planner

Browser-based Path of Exile passive skill tree + atlas tree planner. Fully static
frontend (Vite + React 19 + PixiJS v8 + Zustand + Tailwind); no backend.

## Commands

- `pnpm dev` — dev server
- `pnpm build` — typecheck + production build
- `pnpm test` — vitest (logic + codec round-trip tests)
- `pnpm typecheck` — `tsc -b`
- `pnpm preprocess` — regenerate `public/data/` + `public/assets/` from `data/raw/`

## Hard rules

- **`src/logic/` stays Pixi-free.** Pathfinding, allocation, stats, encode/decode are
  pure TS so they stay unit-testable. Pixi code lives only in `src/tree/`.
- **Run the round-trip tests on every encode/decode change** (`tests/gggcode.test.ts`).
  The GGG v6 byte layout must stay compatible with the official site and PoB.
- **Point limits are never hardcoded.** Always read `TreeData.points`
  (plus `grantedPassivePoints` of allocated nodes) — never literal 123/8/138.
- The Pixi scene lives outside React's render cycle: Pixi events → Zustand store →
  `usePlanner.subscribe` → `TreeRenderer.applyState`. Never redraw the scene per frame;
  only update textures/tints/overlay Graphics of affected sprites on state change.
- Zustand selectors that build new objects must be wrapped in `useShallow`
  (see `TopBar`'s totals selector) or React loops forever.

## Data pipeline (league-aware)

`data/raw/` holds GGG's official export dirs: `skilltree-export-<ver>/` and
`atlastree-export-<ver>/` (gitignored — download from GGG's news posts and extract).
`scripts/preprocess.ts` scans for every version and writes
`public/data/<ver>/{passive,atlas}.json`, copies spritesheets to
`public/assets/<ver>/{passive,atlas}/`, and emits `public/data/leagues.json`
(`{versions, latest}`) which drives the league selector. New league = drop the new
export dirs in `data/raw/` and re-run `pnpm preprocess`.

## Raw data schema (GGG export `data.json`)

Top-level: `tree, classes, alternate_ascendancies, groups, nodes, extraImages,
jewelSlots, min_x/min_y/max_x/max_y, constants, sprites, imageZoomLevels, points`.

- `nodes` (~3390): `{skill, name, icon, stats[], group, orbit, orbitIndex, out[], in[]}`
  plus flags `isNotable/isKeystone/isMastery/isJewelSocket/isAscendancyStart/
  ascendancyName/isBloodline/isProxy/classStartIndex/isBlighted/grantedPassivePoints`.
  Masteries carry `masteryEffects: [{effect, stats[]}]` + `activeIcon/inactiveIcon`.
  The virtual root is under key `"root"`. Nodes without `group` (cluster jewel defs)
  and nodes/groups with `isProxy` are dropped in preprocessing.
- `groups` (~797): `{x, y, orbits[], nodes[], background?: {image, isHalfImage?,
  offsetX?, offsetY?}, isProxy?}` — `background.image` is a direct key into the
  `groupBackground` sprite coords.
- `constants`: `skillsPerOrbit: [1,6,16,16,40,72,72]`, `orbitRadii: [0,82,162,335,493,662,846]`.
- `sprites`: sprite key → zoom level → `{filename, w, h, coords}`. Filenames are CDN
  URLs; preprocessing remaps them to the local `assets/` files (match by basename).
- `points`: `{totalPoints: 123, ascendancyPoints: 8}` (atlas: 138/absent).
- Atlas export: same schema, no classes; atlas `isMastery` nodes without
  `masteryEffects` are decorations, not allocatable; `isWormhole` nodes exist.

## Coordinate math (done at build time in preprocess.ts)

```
angle = 2π * orbitIndex / skillsPerOrbit[orbit]   // clockwise, up = 0
x = group.x + orbitRadii[orbit] * sin(angle)
y = group.y - orbitRadii[orbit] * cos(angle)
```

**Exception:** the 16-node orbits (orbits 2 and 3) are NOT evenly spaced; the degree
sequence is `[0,30,45,60,90,120,135,150,180,210,225,240,270,300,315,330]`
(`ORBIT_16_ANGLES` in `scripts/preprocess.ts`).

Edges: same group + same orbit → orbit-centered arc (shorter direction; angles stored
in canvas convention φ = θ − π/2), otherwise a straight line. No visual edges to
masteries (adjacency only) and none between ascendancies and the main tree.

## Allocation rules (src/logic)

- Allocate: BFS shortest path from the allocated frontier (class start / ascendancy
  start are implicit and free; atlas uses `startNodes` reachable from the virtual root).
- Deallocate: remove node, then drop every allocated node no longer reachable from the
  start (connected-component refund, PoB behavior).
- Masteries are terminal: allocatable as endpoints, never traversed.
- Ascendancy nodes cost from the ascendancy pool and are gated on the selected
  ascendancy name (covers alternate ascendancies/bloodlines too — they just can't be
  selected yet, Phase 2).
- Allocation that would exceed a pool is rejected (`allocateNode` returns null).

## Git workflow

Feature branches (`feature/<name>`) off `main`, merged with `--no-ff` once tests +
typecheck pass. Push all branches to origin, not just main.
