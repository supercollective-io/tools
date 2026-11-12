import type { Point } from '../core/engine.ts';

/** Presentation only: retain the old 60 Hz response at any display refresh rate. */
export function approachPoint(shown: Point, target: Point, elapsedMs: number): Point {
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 39);
  const next = {
    x: shown.x + (target.x - shown.x) * alpha,
    y: shown.y + (target.y - shown.y) * alpha,
  };
  return Math.hypot(next.x - target.x, next.y - target.y) < 0.1 ? target : next;
}
