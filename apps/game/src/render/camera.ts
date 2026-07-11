/**
 * camera.ts — ALL pointer math lives here (doc 04 §6): drag-to-pan with
 * inertial scrolling, wheel zoom anchored at the cursor, world-rect
 * clamping, and the world-container transform.
 *
 * Zero per-frame allocations: state is scalar fields; update()/applyTo()
 * never create objects.
 */

import type { Container } from 'pixi.js';

/** Inertia decay time constant (ms): velocity halves every ~104ms. */
const FRICTION_TAU = 150;
/** Velocity below this (world px/ms) snaps to zero. */
const STOP_SPEED = 0.005;
/** Wheel zoom sensitivity. */
const ZOOM_PER_WHEEL = 0.0015;

export class Camera {
  /** World coordinate at the top-left of the viewport. */
  x = 0;
  y = 0;
  scale = 1;
  minScale = 0.1;
  maxScale = 3;

  private viewW = 1;
  private viewH = 1;
  private worldW = 1;
  private worldH = 1;

  private dragging = false;
  private pointerId = -1;
  private lastPointerX = 0;
  private lastPointerY = 0;
  /** Smoothed drag velocity in world px/ms (inertia on release). */
  private vx = 0;
  private vy = 0;
  private lastMoveAt = 0;

  /** Wire pointer + wheel handlers. Call once. */
  attach(element: HTMLElement): void {
    element.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.vx = 0;
      this.vy = 0;
      this.lastMoveAt = event.timeStamp;
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener('pointermove', (event) => {
      if (!this.dragging || event.pointerId !== this.pointerId) {
        return;
      }
      const dx = event.clientX - this.lastPointerX;
      const dy = event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.x -= dx / this.scale;
      this.y -= dy / this.scale;
      const dt = Math.max(1, event.timeStamp - this.lastMoveAt);
      this.lastMoveAt = event.timeStamp;
      // Exponential smoothing of instantaneous velocity (70/30).
      this.vx = 0.7 * (-dx / this.scale / dt) + 0.3 * this.vx;
      this.vy = 0.7 * (-dy / this.scale / dt) + 0.3 * this.vy;
      this.clamp();
    });
    const release = (event: PointerEvent): void => {
      if (event.pointerId === this.pointerId) {
        this.dragging = false;
        this.pointerId = -1;
        // vx/vy stay: update() carries the motion on as inertia.
      }
    };
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * ZOOM_PER_WHEEL));
      },
      { passive: false },
    );
  }

  /** Zoom by `factor` keeping the world point under (screenX, screenY) fixed. */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const next = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    if (next === this.scale) {
      return;
    }
    this.x = this.x + screenX / this.scale - screenX / next;
    this.y = this.y + screenY / this.scale - screenY / next;
    this.scale = next;
    this.clamp();
  }

  /** Viewport (CSS px) and world bounds (world px); sets the fit zoom floor. */
  setBounds(viewW: number, viewH: number, worldW: number, worldH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
    // Never zoom out far past "whole map on screen".
    this.minScale = Math.min(viewW / worldW, viewH / worldH) * 0.9;
    this.clamp();
  }

  /** Advance inertia; call once per frame BEFORE applyTo. */
  update(dtMs: number): void {
    if (this.dragging || (this.vx === 0 && this.vy === 0)) {
      return;
    }
    this.x += this.vx * dtMs;
    this.y += this.vy * dtMs;
    const decay = Math.exp(-dtMs / FRICTION_TAU);
    this.vx *= decay;
    this.vy *= decay;
    if (Math.abs(this.vx) < STOP_SPEED && Math.abs(this.vy) < STOP_SPEED) {
      this.vx = 0;
      this.vy = 0;
    }
    this.clamp();
  }

  /** Keep the viewport inside the world (centers when zoomed out past it). */
  private clamp(): void {
    const spanX = this.viewW / this.scale;
    const spanY = this.viewH / this.scale;
    this.x =
      spanX >= this.worldW
        ? (this.worldW - spanX) / 2
        : Math.min(Math.max(this.x, 0), this.worldW - spanX);
    this.y =
      spanY >= this.worldH
        ? (this.worldH - spanY) / 2
        : Math.min(Math.max(this.y, 0), this.worldH - spanY);
  }

  /** Write the camera transform onto the world container. */
  applyTo(world: Container): void {
    world.scale.set(this.scale);
    world.position.set(-this.x * this.scale, -this.y * this.scale);
  }

  // View rect in world coordinates (for culling) — scalars, no allocation.
  get viewLeft(): number {
    return this.x;
  }
  get viewTop(): number {
    return this.y;
  }
  get viewRight(): number {
    return this.x + this.viewW / this.scale;
  }
  get viewBottom(): number {
    return this.y + this.viewH / this.scale;
  }
}
