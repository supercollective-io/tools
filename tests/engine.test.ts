import { describe, expect, it } from 'vitest';
import {
  BASELINE,
  type Config,
  forceFor,
  type Input,
  initialState,
  layout,
  STEP_MS,
  type State,
  step,
} from '../src/lib/core/engine.ts';

const config: Config = { ...BASELINE, participantCount: 2 };
const input = (x: number, y: number, participantId = 'a'): Input => ({
  x,
  y,
  participantId,
  engaged: true,
  sequence: 0,
});
const active = () => ({ ...initialState(config), phase: 'active' as const, countdownMs: 0 });
describe('baseline physics', () => {
  it('gives closer magnets more force and disengaged magnets none', () => {
    const p = { x: 500, y: 500 };
    expect(forceFor(p, input(540, 500), config).x).toBeGreaterThan(
      forceFor(p, input(640, 500), config).x,
    );
    expect(forceFor(p, input(900, 500), config).x).toBe(0);
    expect(forceFor(p, { ...input(540, 500), engaged: false }, config)).toEqual({ x: 0, y: 0 });
  });
  it('cancels equal opposite forces without inventing a selection', () => {
    const result = step(
      active(),
      [input(540, 500), input(460, 500, 'b')],
      layout(['A', 'B']),
      config,
    );
    expect(result.position).toEqual({ x: 500, y: 500 });
    expect(result.selectedId).toBeNull();
  });
  it('ignores force during the countdown', () => {
    const state = step(initialState(config), [input(540, 500)], layout(['A', 'B']), config);
    expect(state.position).toEqual({ x: 500, y: 500 });
    expect(state.countdownMs).toBe(3000 - STEP_MS);
  });
  it('times out an unresolved round', () => {
    const c = { ...config, durationMs: STEP_MS };
    expect(step(active(), [], layout(['A', 'B']), c).phase).toBe('timed-out');
  });
  it('requires continuous dwell and resets it on leaving the target', () => {
    const options = layout(['A', 'B']);
    let state: State = { ...active(), position: { x: options[0].x, y: options[0].y } };
    const steady = input(state.position.x, state.position.y);
    for (let i = 0; i < config.dwellMs / STEP_MS - 1; i++)
      state = step(state, [steady], options, config);
    expect(state.phase).toBe('active');
    const outside = step({ ...state, position: { x: 500, y: 500 } }, [steady], options, config);
    expect(outside.dwellMs).toBe(0);
    expect(step(state, [steady], options, config).selectedId).toBe(options[0].id);
  });
  it('does not turn an unattended puck into a decision', () => {
    const options = layout(['A', 'B']);
    const state = {
      ...active(),
      position: { x: options[0].x, y: options[0].y },
      targetId: options[0].id,
      dwellMs: 1450,
    };
    expect(step(state, [], options, config).phase).toBe('active');
  });
  it('replays a complete round from accepted inputs', () => {
    const options = layout(['A', 'B']);
    const c = { ...config, durationMs: 5000 };
    let state = initialState(c);
    const frames = [];
    while (state.phase === 'countdown' || state.phase === 'active') {
      const inputs = [input(state.position.x + 40, state.position.y)];
      state = step(state, inputs, options, c);
      frames.push({ state, inputs });
    }
    let replay = initialState(c);
    for (const frame of frames) {
      replay = step(replay, frame.inputs, options, c);
      expect(replay).toEqual(frame.state);
    }
  });
  it('bounds the puck and velocity under continuous pull', () => {
    let state: State = active();
    const c = { ...config, durationMs: 60000 };
    for (let i = 0; i < 1000; i++) {
      state = step(state, [input(Math.min(1000, state.position.x + 40), state.position.y)], [], c);
      expect(state.position.x).toBeLessThanOrEqual(978);
      expect(Math.hypot(state.velocity.x, state.velocity.y)).toBeLessThanOrEqual(config.maxSpeed);
    }
  });
});
