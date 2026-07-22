import { Application, Container, Graphics, Sprite, Circle, TilingSprite } from 'pixi.js';
import type { TreeData, TreeNode } from '../logic/types';
import { SheetAtlas } from './textures';
import { Viewport } from './viewport';

export interface RenderCallbacks {
  onNodeClick: (id: number) => void;
  onNodeHover: (id: number | null) => void;
}

/** Everything the renderer needs to know about current UI/build state. */
export interface VisualState {
  allocated: Set<number>;
  hoverAdd: Set<number>;
  hoverRemove: Set<number>;
  searchMatches: Set<number>;
  classId: number | null;
  classStartId: number | null;
  ascStartId: number | null;
  ascendancyName: string | null;
}

const COLORS = {
  background: 0x070b10,
  edge: 0x585440,
  edgeActive: 0xcfa94d,
  edgeAdd: 0x4caf50,
  edgeRemove: 0xc0392b,
  searchRing: 0xffd54f,
  nodeAdd: 0x4caf50,
  nodeRemove: 0xe05545,
};

const EDGE_WIDTH = 14;

const HIT_RADIUS: Record<TreeNode['kind'], number> = {
  normal: 45,
  notable: 58,
  keystone: 75,
  mastery: 55,
  jewel: 55,
};

interface NodeView {
  node: TreeNode;
  container: Container;
  icon: Sprite;
  frame: Sprite | null;
  visualKey: string;
}

export class TreeRenderer {
  private app!: Application;
  private viewport!: Viewport;
  private atlas!: SheetAtlas;
  private data!: TreeData;
  private cb!: RenderCallbacks;

  private views = new Map<number, NodeView>();
  private activeEdges!: Graphics;
  private previewEdges!: Graphics;
  private searchOverlay!: Graphics;
  private startViews: { classIndex: number; sprite: Sprite }[] = [];
  private destroyed = false;

  static async create(
    host: HTMLElement,
    data: TreeData,
    assetsBase: string,
    cb: RenderCallbacks,
  ): Promise<TreeRenderer> {
    const r = new TreeRenderer();
    r.data = data;
    r.cb = cb;
    r.app = new Application();
    await r.app.init({
      resizeTo: host,
      background: COLORS.background,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    r.atlas = await SheetAtlas.load(data.sprites, assetsBase);
    host.appendChild(r.app.canvas);
    r.viewport = new Viewport(r.app.canvas);
    r.app.stage.addChild(r.viewport.world);
    r.buildScene();
    r.viewport.fit(data.bounds, host.clientWidth || 800, host.clientHeight || 600);
    return r;
  }

  private buildScene(): void {
    const world = this.viewport.world;
    const { data, atlas } = this;
    const b = data.bounds;

    // Backdrop: tiled parchment texture (passive) or the atlas painting.
    if (data.kind === 'atlas') {
      const tex = atlas.get('atlasBackground', 'AtlasPassiveBackground');
      if (tex) {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.scale.set(atlas.worldScale('atlasBackground'));
        s.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
        world.addChild(s);
      }
    } else {
      const tex = atlas.get('background', 'Background2');
      if (tex) {
        const scale = atlas.worldScale('background');
        const tile = new TilingSprite({
          texture: tex,
          width: (b.maxX - b.minX) * 1.2,
          height: (b.maxY - b.minY) * 1.2,
        });
        tile.tileScale.set(scale);
        tile.position.set(b.minX * 1.1, b.minY * 1.1);
        world.addChild(tile);
      }
    }

    // Group backgrounds.
    const groupLayer = new Container();
    const gbScale = atlas.worldScale('groupBackground');
    for (const g of data.groups) {
      const bg = g.background;
      if (!bg) continue;
      const tex = atlas.get('groupBackground', bg.image);
      if (!tex) continue;
      const x = g.x + ((bg as { offsetX?: number }).offsetX ?? 0);
      const y = g.y + ((bg as { offsetY?: number }).offsetY ?? 0);
      if (bg.isHalfImage) {
        const top = new Sprite(tex);
        top.anchor.set(0.5, 1);
        top.scale.set(gbScale);
        top.position.set(x, y);
        const bottom = new Sprite(tex);
        bottom.anchor.set(0.5, 1);
        bottom.scale.set(gbScale, -gbScale);
        bottom.position.set(x, y);
        groupLayer.addChild(top, bottom);
      } else {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.scale.set(gbScale);
        s.position.set(x, y);
        groupLayer.addChild(s);
      }
    }
    world.addChild(groupLayer);

    // Ascendancy plates behind their node clusters.
    const plateLayer = new Container();
    const seenAsc = new Set<string>();
    for (const node of Object.values(data.nodes)) {
      if (!node.isAscendancyStart || !node.ascendancy || seenAsc.has(node.ascendancy)) continue;
      seenAsc.add(node.ascendancy);
      const tex = atlas.get('ascendancy', `Classes${node.ascendancy}`);
      if (!tex) continue;
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.scale.set(atlas.worldScale('ascendancy'));
      s.position.set(node.x, node.y);
      plateLayer.addChild(s);
    }
    world.addChild(plateLayer);

    // Class start decorations (texture chosen in applyState).
    if (data.kind === 'passive') {
      for (const cls of data.classes) {
        const start = data.nodes[String(cls.startNodeId)];
        if (!start) continue;
        const sprite = new Sprite();
        sprite.anchor.set(0.5);
        sprite.position.set(start.x, start.y);
        this.startViews.push({ classIndex: cls.id, sprite });
        world.addChild(sprite);
      }
    } else if (data.startNodes.length) {
      const tex = this.atlas.get('startNode', 'AtlasPassiveSkillScreenStart');
      const entry = data.nodes[String(data.startNodes[0])];
      if (tex && entry) {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.scale.set(atlas.worldScale('startNode'));
        // The atlas start art sits at the tree origin behind the entry node.
        s.position.set(entry.x, entry.y);
        world.addChild(s);
      }
    }

    // Static (inactive) edges, one batched Graphics.
    const base = new Graphics();
    for (const e of data.edges) this.strokeEdge(base, e);
    base.stroke({ width: EDGE_WIDTH, color: COLORS.edge });
    world.addChild(base);

    this.activeEdges = new Graphics();
    this.previewEdges = new Graphics();
    world.addChild(this.activeEdges, this.previewEdges);

    // Nodes.
    const nodeLayer = new Container();
    for (const node of Object.values(data.nodes)) {
      if (node.classStartIndex !== undefined) continue; // rendered as start decoration
      const container = new Container();
      container.position.set(node.x, node.y);
      const icon = new Sprite();
      icon.anchor.set(0.5);
      const frame = node.kind === 'mastery' ? null : new Sprite();
      if (frame) frame.anchor.set(0.5);
      container.addChild(icon);
      if (frame) container.addChild(frame);
      const interactive = !(node.kind === 'mastery' && !node.masteryEffects?.length);
      container.eventMode = interactive ? 'static' : 'none';
      if (interactive) container.cursor = 'pointer';
      container.hitArea = new Circle(0, 0, HIT_RADIUS[node.kind]);
      container.on('pointerover', () => this.cb.onNodeHover(node.id));
      container.on('pointerout', () => this.cb.onNodeHover(null));
      container.on('pointertap', () => {
        if (!this.viewport.didDrag) this.cb.onNodeClick(node.id);
      });
      nodeLayer.addChild(container);
      this.views.set(node.id, { node, container, icon, frame, visualKey: '' });
    }
    world.addChild(nodeLayer);

    this.searchOverlay = new Graphics();
    world.addChild(this.searchOverlay);
  }

  private strokeEdge(g: Graphics, edge: TreeData['edges'][number]): void {
    if (edge.arc) {
      const { cx, cy, r, a1, a2 } = edge.arc;
      g.moveTo(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
      g.arc(cx, cy, r, a1, a2);
    } else {
      const a = this.data.nodes[String(edge.a)];
      const b = this.data.nodes[String(edge.b)];
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
  }

  /** Recompute every state-dependent visual. Called on store changes, not per frame. */
  applyState(state: VisualState): void {
    if (this.destroyed) return;
    const { data } = this;
    const implicit = new Set<number>();
    if (state.classStartId !== null) implicit.add(state.classStartId);
    if (state.ascStartId !== null) implicit.add(state.ascStartId);

    const isOn = (id: number) => state.allocated.has(id) || implicit.has(id);

    // Node visuals.
    for (const view of this.views.values()) {
      const node = view.node;
      const allocated = isOn(node.id);
      const canAllocate =
        !allocated &&
        (node.ascendancy ? node.ascendancy === state.ascendancyName : true) &&
        (node.neighbors.some((nb) => isOn(nb)) ||
          (data.kind === 'atlas' && state.allocated.size === 0 && data.startNodes.includes(node.id)));
      const highlightAdd = state.hoverAdd.has(node.id);
      const highlightRemove = state.hoverRemove.has(node.id);
      const key = `${allocated}|${canAllocate}|${highlightAdd}|${highlightRemove}`;
      if (key === view.visualKey) continue;
      view.visualKey = key;
      this.styleNode(view, allocated, canAllocate);
      view.icon.tint = 0xffffff;
      if (view.frame) view.frame.tint = 0xffffff;
      const target = view.frame ?? view.icon;
      if (highlightAdd) target.tint = COLORS.nodeAdd;
      else if (highlightRemove) target.tint = COLORS.nodeRemove;
    }

    // Class start art.
    for (const sv of this.startViews) {
      const cls = data.classes[sv.classIndex];
      const selected = state.classId === sv.classIndex;
      const coord = selected ? `center${cls.name.toLowerCase()}` : 'PSStartNodeBackgroundInactive';
      const tex = this.atlas.get('startNode', coord) ?? this.atlas.get('startNode', 'PSStartNodeBackgroundInactive');
      if (tex && sv.sprite.texture !== tex) {
        sv.sprite.texture = tex;
        sv.sprite.scale.set(this.atlas.worldScale('startNode'));
      }
    }

    // Active + preview edges.
    this.activeEdges.clear();
    this.previewEdges.clear();
    const addSet = state.hoverAdd;
    const removeSet = state.hoverRemove;
    let strokeActive = false;
    for (const e of data.edges) {
      if (isOn(e.a) && isOn(e.b)) {
        this.strokeEdge(this.activeEdges, e);
        strokeActive = true;
      }
    }
    if (strokeActive) this.activeEdges.stroke({ width: EDGE_WIDTH, color: COLORS.edgeActive });

    if (addSet.size) {
      const inPathOrOn = (id: number) => isOn(id) || addSet.has(id);
      let any = false;
      for (const e of data.edges) {
        if ((addSet.has(e.a) || addSet.has(e.b)) && inPathOrOn(e.a) && inPathOrOn(e.b)) {
          this.strokeEdge(this.previewEdges, e);
          any = true;
        }
      }
      if (any) this.previewEdges.stroke({ width: EDGE_WIDTH, color: COLORS.edgeAdd });
    } else if (removeSet.size) {
      let any = false;
      for (const e of data.edges) {
        if ((removeSet.has(e.a) || removeSet.has(e.b)) && isOn(e.a) && isOn(e.b)) {
          this.strokeEdge(this.previewEdges, e);
          any = true;
        }
      }
      if (any) this.previewEdges.stroke({ width: EDGE_WIDTH, color: COLORS.edgeRemove });
    }

    // Search rings.
    this.searchOverlay.clear();
    if (state.searchMatches.size) {
      for (const id of state.searchMatches) {
        const n = data.nodes[String(id)];
        if (!n) continue;
        this.searchOverlay.circle(n.x, n.y, HIT_RADIUS[n.kind] + 14);
      }
      this.searchOverlay.stroke({ width: 10, color: COLORS.searchRing });
    }

  }

  /** Pick icon + frame textures for a node's allocation state. */
  private styleNode(view: NodeView, allocated: boolean, canAllocate: boolean): void {
    const { atlas } = this;
    const node = view.node;

    if (node.kind === 'mastery') {
      let sheet: string;
      let coord: string;
      if (allocated && node.activeIcon && atlas.has('masteryActiveSelected', node.activeIcon)) {
        sheet = 'masteryActiveSelected';
        coord = node.activeIcon;
      } else if (canAllocate && atlas.has('masteryConnected', node.icon)) {
        sheet = 'masteryConnected';
        coord = node.icon;
      } else if (node.inactiveIcon && atlas.has('masteryInactive', node.inactiveIcon)) {
        sheet = 'masteryInactive';
        coord = node.inactiveIcon;
      } else {
        sheet = 'mastery';
        coord = node.icon;
      }
      const tex = atlas.get(sheet, coord);
      if (tex) {
        view.icon.texture = tex;
        view.icon.scale.set(atlas.worldScale(sheet));
      }
      return;
    }

    if (node.kind === 'jewel' || node.isWormhole) {
      // Frame-only (socket) or wormhole special art.
      if (node.isWormhole) {
        const iconSheet = allocated ? 'wormholeActive' : 'wormholeInactive';
        const tex = atlas.get(iconSheet, 'Wormhole');
        if (tex) {
          view.icon.texture = tex;
          view.icon.scale.set(atlas.worldScale(iconSheet));
        }
        this.setFrame(view, 'frame', allocated ? 'WormholeFrameAllocated' : canAllocate ? 'WormholeFrameCanAllocate' : 'WormholeFrameUnallocated');
      } else {
        // Jewel sockets are frame-only; the icon sprite stays empty.
        this.setFrame(view, 'frame', allocated ? 'JewelFrameAllocated' : canAllocate ? 'JewelFrameCanAllocate' : 'JewelFrameUnallocated');
      }
      return;
    }

    // Icon.
    const iconSheet =
      node.kind === 'keystone'
        ? allocated
          ? 'keystoneActive'
          : 'keystoneInactive'
        : node.kind === 'notable'
          ? allocated
            ? 'notableActive'
            : 'notableInactive'
          : allocated
            ? 'normalActive'
            : 'normalInactive';
    const tex = atlas.get(iconSheet, node.icon);
    if (tex) {
      view.icon.texture = tex;
      view.icon.scale.set(atlas.worldScale(iconSheet));
    }

    // Frame.
    if (node.ascendancy && !node.isAscendancyStart) {
      const size = node.kind === 'notable' ? 'Large' : 'Small';
      const st = allocated ? 'Allocated' : canAllocate ? 'CanAllocate' : 'Normal';
      this.setFrame(view, 'ascendancy', `AscendancyFrame${size}${st}`);
    } else if (node.isAscendancyStart) {
      this.setFrame(view, 'ascendancy', 'AscendancyMiddle');
    } else if (node.kind === 'keystone') {
      this.setFrame(view, 'frame', allocated ? 'KeystoneFrameAllocated' : canAllocate ? 'KeystoneFrameCanAllocate' : 'KeystoneFrameUnallocated');
    } else if (node.kind === 'notable') {
      const prefix = node.isBlighted ? 'BlightedNotableFrame' : 'NotableFrame';
      this.setFrame(view, 'frame', allocated ? `${prefix}Allocated` : canAllocate ? `${prefix}CanAllocate` : `${prefix}Unallocated`);
    } else {
      this.setFrame(view, 'frame', allocated ? 'PSSkillFrameActive' : canAllocate ? 'PSSkillFrameHighlighted' : 'PSSkillFrame');
    }
  }

  private setFrame(view: NodeView, sheet: string, coord: string): void {
    if (!view.frame) return;
    const tex = this.atlas.get(sheet, coord);
    if (tex) {
      view.frame.texture = tex;
      view.frame.scale.set(this.atlas.worldScale(sheet));
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.viewport.destroy();
    this.atlas.destroy();
    this.app.destroy(true, { children: true, texture: false });
    this.views.clear();
  }
}
