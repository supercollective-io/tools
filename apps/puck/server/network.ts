import { networkInterfaces } from 'node:os';

export function privateIPv4(address: string) {
  const parts = address.split('.').map(Number);
  return (
    parts.length === 4 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168))
  );
}

export function localNetworkOrigins(port: number) {
  return Object.entries(networkInterfaces())
    .sort(
      ([a], [b]) =>
        Number(!/^(en|eth|wlan|wi-fi)/i.test(a)) - Number(!/^(en|eth|wlan|wi-fi)/i.test(b)),
    )
    .flatMap(([, entries]) =>
      (entries ?? [])
        .filter((entry) => entry.family === 'IPv4' && !entry.internal && privateIPv4(entry.address))
        .map((entry) => `http://${entry.address}:${port}`),
    );
}
