import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPolymindInvitation } from '../invitations.mjs';

const origin = 'https://polymind.supercollective.io';
const sessionId = 'session_01-abc';
const invitation = `${origin}/?session=${sessionId}`;

test('accepts Polymind canonical participant invitations and can bind the session ID', () => {
  assert.equal(isPolymindInvitation(invitation, origin), true);
  assert.equal(isPolymindInvitation(invitation, origin, sessionId), true);
  assert.equal(isPolymindInvitation(invitation, origin, 'another-session'), false);
});

test('rejects malformed, missing, duplicated or additional invitation query fields', () => {
  const rejected = [
    `${origin}/`,
    `${origin}/?session=`,
    `${origin}/?session=${'x'.repeat(101)}`,
    `${origin}/?session=has%2Fslash`,
    `${origin}/?session=${sessionId}&session=${sessionId}`,
    `${origin}/?session=${sessionId}&key=public`,
    `${origin}/?key=${sessionId}`,
    `${origin}/?%73ession=${sessionId}`,
    `${origin}/?Session=${sessionId}`,
  ];
  for (const value of rejected) assert.equal(isPolymindInvitation(value, origin), false, value);
});

test('rejects operator destinations, credentials, fragments and noncanonical origins', () => {
  const rejected = [
    `https://user:password@polymind.supercollective.io/?session=${sessionId}`,
    `${origin}/operator?session=${sessionId}`,
    `${origin}/projection?session=${sessionId}`,
    `${origin}/?session=${sessionId}#private`,
    `http://polymind.supercollective.io/?session=${sessionId}`,
    `https://polymind.supercollective.io:443/?session=${sessionId}`,
    `https://other.example/?session=${sessionId}`,
    `${origin}/?session=${sessionId}&operatorToken=private`,
  ];
  for (const value of rejected) assert.equal(isPolymindInvitation(value, origin), false, value);
  assert.equal(isPolymindInvitation(invitation, 'https://other.example'), false);
});
