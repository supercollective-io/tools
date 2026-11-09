import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Store } from '../server/store.ts';
import { BASELINE, initialState, layout, type Recording } from '../src/lib/core/engine.ts';

it('preserves a completed recording and marks unfinished rounds interrupted on restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'puck-store-'));
  const path = join(dir, 'test.sqlite');
  let store = new Store(path);
  try {
    const options = layout(['A', 'B']);
    store.create(
      { id: 'room', question: 'Which?', options, createdAt: 'now', mode: 'personalised-corrected' },
      {
        id: 'person',
        roomId: 'room',
        name: 'Host',
        tokenHash: 'hash',
        host: true,
        participating: true,
      },
    );
    store.start('finished', 'room', 'now');
    const config = { ...BASELINE, participantCount: 2 };
    const recording: Recording = {
      id: 'finished',
      roomId: 'room',
      question: 'Which?',
      options,
      config,
      engineVersion: 'baseline-v1',
      participants: [{ id: 'person', name: 'Host' }],
      startedAt: 'now',
      frames: [],
      result: { ...initialState(config), phase: 'cancelled' },
    };
    store.finish(recording);
    store.start('unfinished', 'room', 'now');
    store.close();
    store = new Store(path);
    expect(store.recording('finished')).toEqual(recording);
    expect(store.history('room').find((r) => r.id === 'unfinished')?.status).toBe('interrupted');
    expect(store.participants('room')[0]?.host).toBe(true);
    expect(store.room('room')?.mode).toBe('personalised-corrected');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
