import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { OperatorAccess } from '../server/operator.ts';
import { SessionService } from '../server/service.ts';
import { Store } from '../server/store.ts';

it('keeps room creation idempotent across restart and rejects changed settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'puck-operator-'));
  let store = new Store(join(dir, 'puck.sqlite'));
  let service = new SessionService(store);
  try {
    const key = 'synthetic-room-request-001';
    const id = service.createManaged('Which route?', ['North', 'South'], 'baseline', key);
    expect(service.createManaged('Which route?', ['North', 'South'], 'baseline', key)).toBe(id);
    expect(() =>
      service.createManaged('Another route?', ['North', 'South'], 'baseline', key),
    ).toThrow('different settings');
    expect(store.roomIds()).toEqual([id]);
    service.shutdown();
    store.close();
    store = new Store(join(dir, 'puck.sqlite'));
    service = new SessionService(store);
    expect(service.createManaged('Which route?', ['North', 'South'], 'baseline', key)).toBe(id);
    const credential = service.grantHost(id);
    const host = service.authenticate(id, credential);
    expect(host).toMatchObject({ host: true, participating: false });
    expect(service.grantHost(id, credential)).toBe(credential);
    expect(service.view(id, host).membership.registered).toBe(0);
    expect(service.operatorStatus(id)).toEqual({ id, title: 'Which route?', status: 'waiting' });
    expect(service.operatorStatus(id)).not.toHaveProperty('participants');
    const joined = service.join(id, 'Synthetic participant');
    const before = service.authenticate(id, joined.token);
    expect(service.grantHost(id, joined.token)).toBe(joined.token);
    expect(service.authenticate(id, joined.token)?.id).toBe(before?.id);
    expect(service.view(id).membership.registered).toBe(1);
    service.revokeOperatorHost(id, joined.token);
    expect(service.authenticate(id, joined.token)).toMatchObject({
      host: false,
      participating: true,
    });
    service.revokeOperatorHost(id, credential);
    expect(service.authenticate(id, credential)?.host).toBe(false);
    const standalone = service.create('Standalone?', ['A', 'B']);
    service.revokeOperatorHost(standalone.roomId, standalone.token);
    expect(service.authenticate(standalone.roomId, standalone.token)?.host).toBe(true);
  } finally {
    service.shutdown();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('requires explicitly configured operator authority for both bearer and browser access', () => {
  const secret = 'synthetic-operator-token-at-least-32-characters';
  const auth = new OperatorAccess(secret);
  const request = (headers: IncomingMessage['headers']) => ({ headers }) as IncomingMessage;
  expect(() => new OperatorAccess('short')).toThrow();
  expect(() => new OperatorAccess().require(request({}))).toThrow('sign-in required');
  expect(() => auth.require(request({}))).toThrow('sign-in required');
  expect(() => auth.login('wrong')).toThrow('sign-in failed');
  expect(() => auth.require(request({ authorization: `Bearer ${secret}` }))).not.toThrow();
  const cookie = auth.login(secret);
  expect(cookie).not.toBe(secret);
  expect(() => auth.require(request({ cookie: `puck_operator=${cookie}` }))).not.toThrow();
  expect(() => auth.require(request({ cookie: `puck_other=${cookie}` }))).toThrow();
});
