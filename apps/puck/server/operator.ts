import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { ClientError } from './service.ts';

function same(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

/** Optional instance operator access, independent of any API client. */
export class OperatorAccess {
  private cookie: string;
  constructor(private secret?: string) {
    if (secret !== undefined && (secret.length < 32 || secret.startsWith('replace-')))
      throw new Error('PUCK_OPERATOR_TOKEN must be a private token of at least 32 characters.');
    this.cookie = secret
      ? createHmac('sha256', secret).update('puck-operator-v1').digest('hex')
      : '';
  }
  login(value: unknown) {
    if (!this.secret || typeof value !== 'string' || !same(value, this.secret))
      throw new ClientError('Operator sign-in failed.', 401);
    return this.cookie;
  }
  require(req: IncomingMessage) {
    const cookie =
      (req.headers.cookie ?? '')
        .split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith('puck_operator='))
        ?.slice('puck_operator='.length) ?? '';
    if (
      !this.secret ||
      !(same(req.headers.authorization ?? '', `Bearer ${this.secret}`) || same(cookie, this.cookie))
    )
      throw new ClientError('Operator sign-in required.', 401);
  }
}
