import { Assets, Rectangle, Texture, type TextureSource } from 'pixi.js';
import type { SpriteSheets } from '../logic/types';

/**
 * Lazily slices textures out of the GGG spritesheets.
 *
 * One zoom level is used per sheet (the largest available up to PREFERRED so
 * icons stay crisp without pulling the biggest atlases). World-space sizing is
 * handled via `worldScale`: sheet pixels divided by the sheet's zoom factor
 * give original tree units.
 */
export class SheetAtlas {
  private textures = new Map<string, Texture>();
  private sources = new Map<string, TextureSource>();
  private chosenZoom = new Map<string, string>();

  private constructor(private sprites: SpriteSheets) {}

  static readonly PREFERRED_ZOOM = 0.3835;

  static async load(sprites: SpriteSheets, assetsBase: string): Promise<SheetAtlas> {
    const atlas = new SheetAtlas(sprites);
    const files = new Set<string>();
    for (const [key, byZoom] of Object.entries(sprites)) {
      const zooms = Object.keys(byZoom)
        .map(Number)
        .sort((a, b) => a - b);
      const upTo = zooms.filter((z) => z <= SheetAtlas.PREFERRED_ZOOM + 1e-6);
      const chosen = upTo.length ? upTo[upTo.length - 1] : zooms[0];
      const zoomKey = Object.keys(byZoom).find((k) => Number(k) === chosen)!;
      atlas.chosenZoom.set(key, zoomKey);
      files.add(byZoom[zoomKey].filename);
    }
    await Promise.all(
      [...files].map(async (f) => {
        const tex: Texture = await Assets.load(assetsBase + f);
        atlas.sources.set(f, tex.source);
      }),
    );
    return atlas;
  }

  /** Zoom factor of the sheet backing this sprite key (for world scaling). */
  zoomOf(sheetKey: string): number {
    return Number(this.chosenZoom.get(sheetKey) ?? 1);
  }

  /** Multiply a sprite by this to get original tree world units. */
  worldScale(sheetKey: string): number {
    return 1 / this.zoomOf(sheetKey);
  }

  has(sheetKey: string, coordKey: string): boolean {
    const zoomKey = this.chosenZoom.get(sheetKey);
    if (!zoomKey) return false;
    return !!this.sprites[sheetKey][zoomKey].coords[coordKey];
  }

  get(sheetKey: string, coordKey: string): Texture | null {
    const cacheKey = `${sheetKey}/${coordKey}`;
    const cached = this.textures.get(cacheKey);
    if (cached) return cached;
    const zoomKey = this.chosenZoom.get(sheetKey);
    if (!zoomKey) return null;
    const sheet = this.sprites[sheetKey][zoomKey];
    const c = sheet.coords[coordKey];
    const source = this.sources.get(sheet.filename);
    if (!c || !source) return null;
    const tex = new Texture({ source, frame: new Rectangle(c.x, c.y, c.w, c.h) });
    this.textures.set(cacheKey, tex);
    return tex;
  }

  destroy(): void {
    for (const t of this.textures.values()) t.destroy(false);
    this.textures.clear();
    // Texture sources stay in the Assets cache for reuse across tab switches.
  }
}
