import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { newPairing, joinPairing, pairingResult, participantKey, validatePairing, batchMilliseconds, changePairPrompt } from '../pairing.mjs';

test('100 arrivals form 50 disjoint pairs; retries retain assignments; late odd arrival waits', () => {
  const keys = Array.from({ length: 101 }, () => participantKey(randomUUID()));
  let state = newPairing('pairs');
  for (const key of keys.slice(0, 100)) state = joinPairing(state, key, 100);
  assert.equal(state.pairs.length, 0);
  state = joinPairing(state, keys[0], 100 + batchMilliseconds, () => 0);
  validatePairing(state);
  assert.equal(state.pairs.length, 50);
  assert.equal(new Set(state.pairs.flat()).size, 100);
  assert.notDeepEqual(state.pairs[0], keys.slice(0, 2), 'batch is shuffled, not paired by arrival order');
  for (const pair of state.pairs) assert.deepEqual(pairingResult(state, pair[0]), pairingResult(state, pair[1]));
  assert.deepEqual(joinPairing(state, keys[0], 50000), state);
  state = joinPairing(state, keys[100], 50000);
  assert.equal(pairingResult(state, keys[100]).status, 'waiting');
  assert.equal(state.pairs.length, 50);
  state = joinPairing(state, participantKey(randomUUID()), 50000 + batchMilliseconds);
  assert.equal(state.pairs.length, 51);
});

test('invalid or duplicate saved identities fail closed', () => {
  const state = newPairing('pairs');
  state.pairs = [[participantKey('one'), participantKey('one')]];
  assert.throws(() => validatePairing(state));
});

test('abandoned waiting identities expire before a late participant is matched', () => {
  const absent = participantKey('absent');
  const present = participantKey('present');
  let state = joinPairing(newPairing('pairs'), absent, 100);
  state = joinPairing(state, present, 30100);
  assert.equal(state.pairs.length, 0);
  assert.deepEqual(state.waiting.map(entry => entry.key), [present]);
  assert.equal(pairingResult(state, present).status, 'waiting');
});


test('shared suggestions cycle without repeats, coalesce retries and keep skip explicit', () => {
  let state = newPairing('pairs');
  state.pairs = [[participantKey('one'), participantKey('two')]];
  const catalogue = ['Synthetic invitation A.', 'Synthetic invitation B.', 'Synthetic invitation C.'];
  const draw = revision => changePairPrompt(state, 1, catalogue, 'next-prompt', revision, () => 0);
  state = draw(0);
  assert.equal(state.prompts[1].text, catalogue[0]);
  assert.deepEqual(draw(0), state, 'lost-response retry must not draw again');
  state = draw(1); assert.equal(state.prompts[1].text, catalogue[1]);
  state = changePairPrompt(state, 1, catalogue, 'skip-prompt', 2);
  assert.equal(pairingResult(state, state.pairs[0][0], catalogue).prompt.status, 'skipped');
  assert.equal(pairingResult(state, state.pairs[0][0], catalogue).prompt.text, undefined);
  state = draw(3); assert.equal(state.prompts[1].text, catalogue[2]);
  state = draw(4); assert.notEqual(state.prompts[1].text, catalogue[2]);
  assert.deepEqual(pairingResult(state, state.pairs[0][0], catalogue), pairingResult(state, state.pairs[0][1], catalogue));
  validatePairing(state);
  const edited = changePairPrompt(state, 1, ['Replacement synthetic invitation.'], 'next-prompt', 5);
  assert.equal(edited.prompts[1].text, 'Replacement synthetic invitation.');
  assert.deepEqual(changePairPrompt(edited, 1, [], 'next-prompt', 6), edited);
  validatePairing(edited);
});
