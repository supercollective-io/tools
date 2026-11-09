import { expect, it } from 'vitest';
import { BASELINE, initialState, layout, type Recording } from '../src/lib/core/engine.ts';
import { contributionsAt } from '../src/lib/core/replay.ts';

it('keeps opposing 30/70 contributions separate, on a common force scale', () => {
  const config = { ...BASELINE, participantCount: 2, mode: 'personalised' as const };
  const state = { ...initialState(config), phase: 'active' as const, elapsedMs: 50 };
  const input = {
    participantId: 'a',
    x: 500,
    y: 500,
    engaged: true,
    sequence: 1,
    availableStrength: 400,
    optionWeights: { 'option-0': 0.3, 'option-2': 0.7 },
  };
  const recording: Recording = {
    id: 'r',
    roomId: 'room',
    question: 'Which?',
    options: layout(['A', 'B', 'C', 'D']),
    engineVersion: 'puck-v2',
    config,
    participants: [{ id: 'a', name: 'Alice' }],
    startedAt: 'now',
    result: state,
    frames: [{ state, inputs: [input] }],
  };
  const arrows = contributionsAt(recording, 0);
  expect(arrows.map((a) => a.force)).toEqual([120, 280]);
  expect(arrows[0].length / arrows[1].length).toBeCloseTo(3 / 7);
  expect(arrows[0].direction.y).toBeCloseTo(-1);
  expect(arrows[1].direction.y).toBeCloseTo(1);
  expect(arrows[0].colour).toBe(arrows[1].colour);
  recording.frames[0].inputs[0].engaged = false;
  expect(contributionsAt(recording, 0)).toEqual([]);
  recording.frames[0].inputs[0].engaged = true;
  recording.frames[0].state.elapsedMs = 0;
  expect(contributionsAt(recording, 0)).toEqual([]);
});
