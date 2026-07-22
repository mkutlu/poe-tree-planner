# PoE Tree Planner

A browser-based **Path of Exile passive skill tree + atlas tree planner** (league 3.29+).
Static frontend: Vite + React 19 + PixiJS v8 (WebGL) + Zustand + Tailwind.

## Features (MVP)

- Passive tree and atlas tree in separate tabs, smooth pan/zoom over the full ~2900-node tree
- Class + ascendancy selection, point counters read from the data (never hardcoded)
- Click-to-allocate with automatic shortest path (BFS); refunds remove disconnected nodes
- Hover path preview (green = will allocate, red = will refund) and rich tooltips
- Mastery effect selection popup
- Node search with highlight (name, stat text, mastery effects)
- Aggregated stat panel (numeric stat lines merged and summed)
- Build state in the URL hash (shareable) + localStorage autosave, per league
- Import/export of the official GGG tree URL code (v6), interchangeable with pathofexile.com
- Multi-league support: every export dropped into `data/raw/` becomes selectable

## Setup

The GGG tree exports are not committed. Download the official
`skilltree-export-<ver>` and `atlastree-export-<ver>` packages (published by GGG for
community tools) and extract them so that e.g.
`data/raw/skilltree-export-3.29.0/data.json` exists. Then:

```sh
pnpm install
pnpm preprocess   # builds public/data/ + public/assets/ from data/raw/
pnpm dev
```

Tests and typecheck: `pnpm test`, `pnpm typecheck`.

## Legal

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
Tree data and artwork belong to Grinding Gear Games and are used under their
community tool guidelines.
