import { describe, expect, it } from 'vitest';
import { joinRequest } from '../src/lib/core/protocol.ts';
import { abbreviateLabel } from '../src/lib/rendering/labels.ts';

describe('display labels', () => {
  it('truncates by grapheme without splitting combining marks or emoji', () => {
    const grapheme = '👩‍🔬';
    expect(abbreviateLabel(grapheme.repeat(28))).toBe(grapheme.repeat(28));
    expect(abbreviateLabel(`${grapheme.repeat(27)}e\u0301x`)).toBe(`${grapheme.repeat(27)}…`);
  });
  it('accepts names up to 80 characters', () => {
    expect(joinRequest.safeParse({ name: 'A'.repeat(80) }).success).toBe(true);
    expect(joinRequest.safeParse({ name: 'A'.repeat(81) }).success).toBe(false);
  });
});
