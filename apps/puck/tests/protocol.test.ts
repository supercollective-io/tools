import { expect, it } from 'vitest';
import { createRequest, inputMessage } from '../src/lib/core/protocol.ts';

it('rejects out-of-bounds, non-finite, forged and duplicate-option inputs', () => {
  const valid = { type: 'input', x: 500, y: 500, sequence: 0, engaged: true };
  expect(inputMessage.safeParse(valid).success).toBe(true);
  for (const change of [
    { x: Infinity },
    { x: -1 },
    { sequence: -1 },
    { participantId: 'someone-else' },
  ])
    expect(inputMessage.safeParse({ ...valid, ...change }).success).toBe(false);
  expect(
    createRequest.safeParse({ name: 'Jo', question: 'Which?', options: ['same', 'SAME'] }).success,
  ).toBe(false);
});
