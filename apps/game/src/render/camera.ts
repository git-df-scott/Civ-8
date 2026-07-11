/**
 * Camera — ALL pointer math for the map lives here (doc 04 §6): drag pan
 * with inertial follow-through, wheel zoom anchored at the cursor, world
 * clamping, and the culling viewport. Pure scalar state: `update()` and
 * `apply()` allocate nothing (the render loop calls them every frame).
 */

import type { Container } from 'pixi.js';

export interface CameraOptions {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly minScale?: number;
  readonly maxScale?: number;
}

/** Exponential inertia decay factor per 16.7ms frame. */
const DECAY_PER_FRAME = 0.93;
/** Inertia cutoff, screen px/ms. */
const MIN_SPEED = 0.01;

export class Camera {
  /** World coordinates at the screen center. */
  x: number;
  y: number;
  scale = 1;

  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly minScale: number;
  private readonly maxScale: number;

  private screenWidth = 1;
  private screenHeight = 1;

  private dragging = false;
  private pointerId = -1;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lastMoveTime = 0;
  /** Inertial velocity, screen px/ms (smoothed while dragging). */
  private velocityX = 0;
  private velocityY = 0;

  // Culling viewport in world coordinates, refreshed by update().
  viewLeft = 0;
  viewTop = 0;
  viewRight = 0;
  viewBottom = 0;

  constructor(options: CameraOptions) {
    this.worldWidth = options.worldWidth;
    this.worldHeight = options.worldHeight;
    this.minScale = options.minScale ?? 0.1;
    this.maxScale = options.maxScale ?? 3;
    this.x = options.worldWidth / 2;
    this.y = options.worldHeight / 2;
  }

  /** Registers pointer + wheel handlers on the canvas. */
  attach(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.lastMoveTime = event.timeStamp;
      this.velocityX = 0;
      this.velocityY = 0;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging || event.pointerId !== this.pointerId) {
        return;
      }
      const dx = event.clientX - this.lastPointerX;
      const dy = event.clientY - this.lastPointerY;
      const dt = Math.max(1, event.timeStamp - this.lastMoveTime);
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.lastMoveTime = event.timeStamp;
      this.panBy(dx, dy);
      // Smoothed release velocity: EMA over the last few move samples.
      this.velocityX = 0.75 * this.velocityX + (0.25 * dx) / dt;
      this.velocityY = 0.75 * this.velocityY + (0.25 * dy) / dt;
    });
    const endDrag = (event: PointerEvent): void => {
      if (event.pointerId === this.pointerId) {
        this.dragging = false;
        this.pointerId = -1;
      }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.zoomAt(event.offsetX, event.offsetY, Math.exp(-event.deltaY * 0.0012));
      },
      { passive: false },
    );
  }

  /** Pans by a screen-space delta (drag follows the pointer 1:1). */
  panBy(screenDx: number, screenDy: number): void {
    this.x -= screenDx / this.scale;
    this.y -= screenDy / this.scale;
  }

  /** Zooms by `factor`, keeping the world point under (screenX, screenY) fixed. */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const next = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const worldX = this.x + (screenX - this.screenWidth / 2) / this.scale;
    const worldY = this.y + (screenY - this.screenHeight / 2) / this.scale;
    this.scale = next;
    this.x = worldX - (screenX - this.screenWidth / 2) / this.scale;
    this.y = worldY - (screenY - this.screenHeight / 2) / this.scale;
  }

  centerOn(worldX: number, worldY: number): void {
    this.x = worldX;
    this.y = worldY;
  }

  setScale(scale: number): void {
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, scale));
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** Advances inertia, clamps to the world, refreshes the culling viewport. */
  update(deltaMs: number, screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    if (!this.dragging && (this.velocityX !== 0 || this.velocityY !== 0)) {
      this.x -= (this.velocityX * deltaMs) / this.scale;
      this.y -= (this.velocityY * deltaMs) / this.scale;
      const decay = Math.pow(DECAY_PER_FRAME, deltaMs / 16.7);
      this.velocityX *= decay;
      this.velocityY *= decay;
      if (
        this.velocityX * this.velocityX + this.velocityY * this.velocityY <
        MIN_SPEED * MIN_SPEED
      ) {
        this.velocityX = 0;
        this.velocityY = 0;
      }
    }
    // Clamp the center so the view cannot leave the world entirely (when the
    // whole map fits on screen, pin to the world center on that axis).
    const halfW = screenWidth / 2 / this.scale;
    const halfH = screenHeight / 2 / this.scale;
    this.x =
      halfW * 2 >= this.worldWidth
        ? this.worldWidth / 2
        : Math.min(this.worldWidth - halfW, Math.max(halfW, this.x));
    this.y =
      halfH * 2 >= this.worldHeight
        ? this.worldHeight / 2
        : Math.min(this.worldHeight - halfH, Math.max(halfH, this.y));
    this.viewLeft = this.x - halfW;
    this.viewTop = this.y - halfH;
    this.viewRight = this.x + halfW;
    this.viewBottom = this.y + halfH;
  }

  /** Writes position/scale onto the world container. Allocation-free. */
  apply(world: Container): void {
    world.scale.set(this.scale);
    world.position.set(
      this.screenWidth / 2 - this.x * this.scale,
      this.screenHeight / 2 - this.y * this.scale,
    );
  }
}
