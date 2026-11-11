import { describe, expect, it } from 'vitest';
import { privateIPv4 } from '../server/network.ts';

describe('local network addresses', () => {
  it('accepts only private IPv4 ranges', () => {
    for (const address of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.2'])
      expect(privateIPv4(address)).toBe(true);
    for (const address of [
      '127.0.0.1',
      '8.8.8.8',
      '172.15.0.1',
      '172.32.0.1',
      '192.168.1.999',
      '::1',
    ])
      expect(privateIPv4(address)).toBe(false);
  });
});
