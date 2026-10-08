/** Every stage view shares this perspective camera; scenes place pieces in CSS px through it. */
export const CAMERA = { position: [0, 0, 20] as [number, number, number], fov: 30 };

/** World units visible top to bottom at z = 0. */
const WORLD_HEIGHT = 2 * CAMERA.position[2] * Math.tan(((CAMERA.fov / 2) * Math.PI) / 180);

/** World units per CSS px for a view `viewHeight` px tall. */
export function worldPerPx(viewHeight: number): number {
  return WORLD_HEIGHT / Math.max(viewHeight, 1);
}

/** Frame-rate independent smoothing factor: the share of the gap to close this frame. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Decaying overshoot from 0 to 1 over about half a second; 0 before `t` = 0. */
export function springIn(t: number): number {
  if (t <= 0) return 0;
  return 1 - Math.exp(-6 * t) * Math.cos(9 * t);
}

export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

export const easeOutCubic = (x: number) => 1 - (1 - Math.min(Math.max(x, 0), 1)) ** 3;

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
