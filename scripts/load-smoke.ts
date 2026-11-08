/** Synthetic local round; creates its own room and never joins an existing one. */
import { performance } from 'node:perf_hooks';
import { WebSocket } from 'ws';
import type { RoomView, ServerMessage } from '../src/lib/core/protocol.ts';

const argument = process.argv.slice(2).find((arg) => arg !== '--');
if (!argument) throw new Error('Usage: pnpm load:smoke -- http://localhost:3000');
const parsed = new URL(argument);
const origin = parsed.origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
  throw new Error('Run this smoke test against a local server.');
async function post(path: string, body: unknown, cookie = '') {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { origin, cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function credential(response: Response) {
  const value = response.headers.get('set-cookie')?.split(';')[0];
  if (!value) throw new Error('Missing participant credential.');
  return value;
}
const created = await post('/api/rooms', {
  question: 'Synthetic load smoke: choose A',
  options: ['A', 'B', 'C', 'D'],
});
if (!created.ok) throw new Error(`Create failed: ${await created.text()}`);
const { id } = (await created.json()) as { id: string };
const hostCookie = credential(created);
await post(`/api/rooms/${id}/join`, { name: 'Load host' }, hostCookie);
const cookies = [hostCookie];
for (let i = 1; i < 32; i++) {
  const response = await post(`/api/rooms/${id}/join`, { name: `Synthetic ${i}` });
  if (!response.ok) throw new Error(`Join failed: ${await response.text()}`);
  cookies.push(credential(response));
}
if ((await post(`/api/rooms/${id}/join`, { name: 'Over capacity' })).status !== 409)
  throw new Error('Capacity limit failed.');
if ((await post(`/api/rooms/${id}/start`, {}, cookies[1])).status !== 403)
  throw new Error('Host-only control failed.');
const sockets: WebSocket[] = [];
const views: (RoomView | undefined)[] = Array.from({ length: 32 });
const gaps: number[] = [],
  previous = Array.from({ length: 32 }, () => 0);
let timer: ReturnType<typeof setInterval> | undefined;
try {
  await Promise.all(
    cookies.map(async (cookie, index) => {
      const socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/ws/rooms/${id}`, {
        origin,
        headers: { cookie },
      });
      sockets[index] = socket;
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.on('message', (raw) => {
          const message = JSON.parse(raw.toString()) as ServerMessage;
          if (message.type !== 'state') return;
          views[index] = message.room;
          if (message.room.round) {
            const now = performance.now();
            if (previous[index]) gaps.push(now - previous[index]);
            previous[index] = now;
          }
          resolve();
        });
      });
      // Preserve participant index, independent of asynchronous connection completion.
      sockets[index] = socket;
    }),
  );
  // Every participant continuously follows the shared puck towards option A.
  let sequence = 0;
  timer = setInterval(() => {
    sequence++;
    for (let i = 0; i < 32; i++) {
      const view = views[i],
        state = view?.round?.state;
      const p = state?.position ?? { x: 500, y: 500 };
      const target = view?.options[0] ?? { x: 500, y: 130 };
      const dx = target.x - p.x,
        dy = target.y - p.y,
        distance = Math.hypot(dx, dy);
      const reach = Math.min(40, distance);
      sockets[i].send(
        JSON.stringify({
          type: 'input',
          sequence,
          x: p.x + (distance ? (dx / distance) * reach : 0),
          y: p.y + (distance ? (dy / distance) * reach : 0),
          engaged: true,
        }),
      );
    }
  }, 50);
  const started = await post(`/api/rooms/${id}/start`, {}, cookies[0]);
  if (!started.ok) throw new Error(`Start failed: ${await started.text()}`);
  const deadline = performance.now() + 20000;
  while (!views.every((v) => v?.round?.state.phase === 'selected')) {
    if (performance.now() > deadline)
      throw new Error('Clients did not agree on a selected result within 20 seconds.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const results = views.map((v) => JSON.stringify(v?.round?.state));
  if (new Set(results).size !== 1) throw new Error('Client states disagree.');
  gaps.sort((a, b) => a - b);
  console.info(
    JSON.stringify({
      participants: 32,
      agreedResult: views[0]?.round?.state.selectedId,
      ticks: views[0]?.round?.state.tick,
      p95SnapshotGapMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0),
      roomId: id,
    }),
  );
} finally {
  if (timer) clearInterval(timer);
  for (const socket of sockets) socket.close();
}
