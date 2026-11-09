import { describe, expect, it } from 'vitest';
import { BASELINE, type Input, initialState, layout, step } from '../src/lib/core/engine.ts';
import {
  CORRECTION_RATIO,
  mapInput,
  optionMixture,
  personalLayout,
  projectPoint,
} from '../src/lib/core/experiments.ts';
import { createRequest, inputMessage } from '../src/lib/core/protocol.ts';

const options = layout(['A', 'B', 'C', 'D']);
const config = { ...BASELINE, participantCount: 2 };
const centre = { x: 500, y: 500 };
const input: Input = { participantId: 'one', sequence: 1, engaged: true, x: 540, y: 500 };
const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 8);
  expect(a.y).toBeCloseTo(b.y, 8);
};
describe('personalised proportional mapping', () => {
  it('keeps a stable layout and changes adjacency rather than only rotating or mirroring', () => {
    for (let n = 4; n <= 6; n++) {
      const original = layout(Array.from({ length: n }, (_, i) => `${i}`));
      for (let i = 0; i < 50; i++) {
        const local = personalLayout(original, `room:person-${i}`);
        expect(local).toEqual(personalLayout(original, `room:person-${i}`));
        expect(new Set(local.map((o) => `${o.x}:${o.y}`)).size).toBe(n);
        const slots = local.map((o) => original.findIndex((s) => s.x === o.x && s.y === o.y));
        expect(
          [1, -1].some((d) => slots.every((v, k) => v === (slots[0] + d * k + 2 * n) % n)),
        ).toBe(false);
      }
    }
  });
  it('projects the centre and every named target to the matching local target', () => {
    const local = personalLayout(options, 'room:person');
    near(projectPoint(centre, options, local), centre);
    for (const option of options)
      near(projectPoint(option, options, local), local.find((o) => o.id === option.id) ?? centre);
    for (const point of [
      { x: 510, y: 600 },
      { x: 450, y: 420 },
    ])
      near(projectPoint(point, options, options), point);
  });
  it('transfers a 30/70 local pull into 30/70 collective option forces', () => {
    // A and B are adjacent locally, but opposite in the canonical layout.
    const local = options.map((o, i) => ({
      ...o,
      x: options[[0, 2, 1, 3][i]].x,
      y: options[[0, 2, 1, 3][i]].y,
    }));
    const a = local[0],
      b = local[2];
    const direction = {
      x: (0.3 * (a.x - 500)) / 370 + (0.7 * (b.x - 500)) / 370,
      y: (0.3 * (a.y - 500)) / 370 + (0.7 * (b.y - 500)) / 370,
    };
    const length = Math.hypot(direction.x, direction.y);
    const raw = {
      ...input,
      x: 500 + (direction.x / length) * 40,
      y: 500 + (direction.y / length) * 40,
    };
    const mapped = mapInput(raw, centre, options, local, config);
    expect(mapped.optionWeights?.[a.id]).toBeCloseTo(0.3);
    expect(mapped.optionWeights?.[b.id]).toBeCloseTo(0.7);
    near(mapped.force ?? centre, { x: 0, y: 0.4 * (mapped.availableStrength ?? 0) });
    expect(mapInput({ ...raw, engaged: false }, centre, options, local, config).force).toEqual({
      x: 0,
      y: 0,
    });
  });
  it('preserves closer-is-stronger and has finite mixtures at target boundaries', () => {
    const local = personalLayout(options, 'test');
    const nearPull = mapInput(input, centre, options, local, config);
    const farPull = mapInput({ ...input, x: 640 }, centre, options, local, config);
    expect(nearPull.availableStrength).toBeGreaterThan(farPull.availableStrength ?? 0);
    for (const point of [centre, ...local]) {
      const weights = optionMixture(point, { x: point.x + 40, y: point.y + 10 }, local);
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum === 0 || Math.abs(sum - 1) < 1e-8).toBe(true);
      expect(Object.values(weights).every((w) => Number.isFinite(w) && w >= 0)).toBe(true);
    }
  });
});
describe('disclosed correction', () => {
  it('opposes displacement, scales with applied strength, and never acts on an unattended puck', () => {
    const c = { ...config, correctionRatio: CORRECTION_RATIO };
    const state = { ...initialState(c), phase: 'active' as const, position: { x: 700, y: 500 } };
    const pulls = [{ ...input, x: 740 }];
    const baseline = step(state, pulls, options, config);
    const corrected = step(state, pulls, options, c);
    expect(corrected.correction?.x).toBeLessThan(0);
    expect(corrected.correction?.y).toBe(0);
    expect(corrected.force.x).toBeLessThan(baseline.force.x);
    expect(Math.abs(corrected.correction?.x ?? 0)).toBeLessThanOrEqual(
      CORRECTION_RATIO * baseline.force.x,
    );
    expect(step(state, [], options, c).correction).toEqual({ x: 0, y: 0 });
    expect(step({ ...state, position: centre }, [input], options, c).correction).toEqual({
      x: 0,
      y: 0,
    });
  });
  it('reproduces personalised corrected trajectories from the recorded mapped inputs', () => {
    const c = { ...config, correctionRatio: CORRECTION_RATIO };
    const local = personalLayout(options, 'deterministic');
    let state = { ...initialState(c), phase: 'active' as const };
    let replay = state;
    for (let i = 0; i < 100; i++) {
      const p = projectPoint(state.position, options, local);
      const mapped = mapInput(
        { ...input, sequence: i, x: p.x + 40, y: p.y },
        state.position,
        options,
        local,
        c,
      );
      state = step(state, [mapped], options, c) as typeof state;
      replay = step(replay, JSON.parse(JSON.stringify([mapped])), options, c) as typeof replay;
      expect(replay).toEqual(state);
    }
  });
});
it('defaults old create requests to baseline and rejects forged forces and invalid modes', () => {
  expect(createRequest.parse({ question: 'Which?', options: ['A', 'B'] }).mode).toBe('baseline');
  expect(
    createRequest.safeParse({ question: 'Which?', options: ['A', 'B'], mode: 'personalised' })
      .success,
  ).toBe(false);
  expect(
    createRequest.safeParse({ question: 'Which?', options: ['A', 'B'], mode: 'unknown' }).success,
  ).toBe(false);
  expect(
    inputMessage.safeParse({
      type: 'input',
      sequence: 1,
      x: 500,
      y: 500,
      engaged: true,
      force: { x: 100000, y: 0 },
    }).success,
  ).toBe(false);
});
