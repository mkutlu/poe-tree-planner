import { Container } from 'pixi.js';

/**
 * Minimal pan/zoom camera: drags translate the world container, wheel zooms
 * around the cursor. Kept outside React and outside Pixi's event system so a
 * drag never fights node pointer events (a small movement threshold separates
 * clicks from drags).
 */
export class Viewport {
  readonly world = new Container();
  private minScale = 0.03;
  private maxScale = 0.8;
  private dragging = false;
  private moved = false;
  private lastX = 0;
  private lastY = 0;
  /** True while a pointer drag exceeded the click threshold (checked by click handlers). */
  get didDrag(): boolean {
    return this.moved;
  }

  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  fit(bounds: { minX: number; minY: number; maxX: number; maxY: number }, screenW: number, screenH: number): void {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const scale = Math.min(screenW / w, screenH / h) * 0.95;
    this.minScale = scale * 0.75;
    this.maxScale = Math.max(0.7, scale * 12);
    this.world.scale.set(scale);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    this.world.position.set(screenW / 2 - cx * scale, screenH / 2 - cy * scale);
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.moved = false;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (!this.moved && Math.abs(e.clientX - this.lastX) + Math.abs(e.clientY - this.lastY) < 4) return;
    this.moved = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.world.position.x += dx;
    this.world.position.y += dy;
  };

  private onUp = () => {
    this.dragging = false;
    // Keep `moved` until the click event (which fires after pointerup) reads it.
    setTimeout(() => (this.moved = false), 0);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const old = this.world.scale.x;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const next = Math.min(this.maxScale, Math.max(this.minScale, old * factor));
    if (next === old) return;
    // Zoom around the cursor: keep the world point under (px,py) fixed.
    const wx = (px - this.world.position.x) / old;
    const wy = (py - this.world.position.y) / old;
    this.world.scale.set(next);
    this.world.position.set(px - wx * next, py - wy * next);
  };

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
