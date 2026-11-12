import { describe, expect, it } from 'vitest';
import { approachPoint } from '../src/lib/rendering/motion.ts';

describe('presentation smoothing', () => {
  it('has the same response over elapsed time at 60 and 120 Hz', () => {
    const target = { x: 700, y: 300 };
    function run(hz: number) {
      let shown = { x: 500, y: 500 };
      for (let i = 0; i < hz / 10; i++) shown = approachPoint(shown, target, 1000 / hz);
      return shown;
    }
    expect(run(60).x).toBeCloseTo(run(120).x, 10);
    expect(run(60).y).toBeCloseTo(run(120).y, 10);
  });
  it('settles exactly so the animation loop can stop', () => {
    const target = { x: 700, y: 300 };
    let shown = { x: 500, y: 500 };
    for (let i = 0; i < 60; i++) shown = approachPoint(shown, target, 1000 / 60);
    expect(shown).toBe(target);
  });
  it('does not overshoot or reverse on a clock anomaly', () => {
    const shown = { x: 500, y: 500 };
    const target = { x: 700, y: 300 };
    expect(approachPoint(shown, target, -10)).toEqual(shown);
    expect(approachPoint(shown, target, 10000)).toBe(target);
  });
});
