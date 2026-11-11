/** Synthetic local round through HTTP and the real WebSocket fan-out. */
import { performance } from 'node:perf_hooks';
import { WebSocket } from 'ws';
import type { RoomView, ServerMessage } from '../src/lib/core/protocol.ts';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const argument = args[0];
const participants = Number(args[1] ?? 50);
if (!argument) throw new Error('Usage: pnpm load:smoke -- http://localhost:3000 [participants]');
if (!Number.isInteger(participants) || participants < 2 || participants > 180)
  throw new Error('Participant count must be an integer from 2 to 180.');
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
async function openSocket(roomId: string, cookie: string, onRoom: (room: RoomView) => void) {
  const socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/ws/rooms/${roomId}`, {
    origin,
    headers: { cookie },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.once('open', resolve);
  });
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as ServerMessage;
    if (message.type === 'state') onRoom(message.room);
  });
  return socket;
}
const created = await post('/api/rooms', {
  question: `Synthetic ${participants}-participant load smoke`,
  options: ['A', 'B', 'C', 'D'],
});
if (!created.ok) throw new Error(`Create failed: ${await created.text()}`);
const { id } = (await created.json()) as { id: string };
const hostCookie = credential(created);
await post(`/api/rooms/${id}/join`, { name: 'Load host' }, hostCookie);
const cookies = [hostCookie];
for (let i = 1; i < participants; i++) {
  const response = await post(`/api/rooms/${id}/join`, { name: `Synthetic ${i}` });
  if (!response.ok) throw new Error(`Join ${i} failed: ${await response.text()}`);
  cookies.push(credential(response));
}
const roomInfo = await fetch(`${origin}/api/rooms/${id}`, { headers: { cookie: hostCookie } });
const { membership } = (await roomInfo.json()) as { membership: { capacity: number } };
if (participants === membership.capacity) {
  if ((await post(`/api/rooms/${id}/join`, { name: 'Over capacity' })).status !== 409)
    throw new Error('Configured room capacity did not reject the next participant.');
}
if ((await post(`/api/rooms/${id}/start`, {}, cookies[1])).status !== 403)
  throw new Error('Host-only control failed.');
const latest: (RoomView | undefined)[] = Array.from({ length: participants });
const sockets: WebSocket[] = [];
const gaps: number[] = [];
const previous = Array.from({ length: participants }, () => 0);
let timer: ReturnType<typeof setInterval> | undefined;
let reconnects = 0;
let staleStartedAt = 0;
let staleEndedAt = 0;
try {
  await Promise.all(
    cookies.map(async (cookie, index) => {
      sockets[index] = await openSocket(id, cookie, (room) => {
        latest[index] = room;
        if (room.round) {
          const now = performance.now();
          if (previous[index]) gaps.push(now - previous[index]);
          previous[index] = now;
        }
      });
    }),
  );
  let sequence = 0;
  timer = setInterval(() => {
    sequence++;
    const elapsed = latest[0]?.round?.state.elapsedMs ?? 0;
    for (let i = 0; i < participants; i++) {
      const view = latest[i];
      const state = view?.round?.state;
      const p = state?.position ?? { x: 500, y: 500 };
      const target = view?.options[0] ?? { x: 500, y: 130 };
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const distance = Math.hypot(dx, dy);
      const reach = Math.min(40, distance);
      // Pause one sender after the countdown to leave a recorded stale-input window.
      if (i === 2 && elapsed >= 200 && staleStartedAt === 0) staleStartedAt = performance.now();
      if (i === 2 && staleStartedAt && performance.now() - staleStartedAt < 1500) continue;
      if (i === 2 && staleStartedAt && staleEndedAt === 0) staleEndedAt = performance.now();
      sockets[i]?.send(
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
  // Replace one socket with the same room credential during the running round.
  const reconnectDeadline = performance.now() + 12000;
  while ((latest[1]?.round?.state.elapsedMs ?? 0) < 1000) {
    if (performance.now() > reconnectDeadline) throw new Error('Round did not start in time.');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  sockets[1]?.close();
  sockets[1] = await openSocket(id, cookies[1], (room) => {
    latest[1] = room;
    if (room.round) {
      const now = performance.now();
      if (previous[1]) gaps.push(now - previous[1]);
      previous[1] = now;
    }
  });
  reconnects++;
  const deadline = performance.now() + 30000;
  while (!latest.every((room) => room?.round?.state.phase === 'selected')) {
    if (performance.now() > deadline)
      throw new Error('Clients did not agree on a selected result within 30 seconds.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const results = latest.map((view) => JSON.stringify(view?.round?.state));
  if (new Set(results).size !== 1) throw new Error('Client states disagree.');
  const recordingResponse = await fetch(`${origin}/api/recordings/${latest[0]?.round?.id}`, {
    headers: { cookie: cookies[0] },
  });
  if (!recordingResponse.ok) throw new Error(`Replay fetch failed: ${recordingResponse.status}`);
  const recordingText = await recordingResponse.text();
  const recording = JSON.parse(recordingText) as {
    config: { participantCount: number };
    participants: { id: string }[];
    frames: { inputs: { participantId: string; engaged: boolean; sequence: number }[] }[];
  };
  if (
    recording.config.participantCount !== participants ||
    recording.participants.length !== participants
  )
    throw new Error('Frozen starting roster does not match the connected round roster.');
  const staleParticipantId = recording.participants[2]?.id;
  const staleEvidence = Boolean(
    staleParticipantId &&
      recording.frames.some((frame) =>
        frame.inputs.some(
          (input) =>
            input.participantId === staleParticipantId && !input.engaged && input.sequence >= 0,
        ),
      ),
  );
  if (participants > 2 && staleStartedAt && !staleEvidence)
    throw new Error('Replay did not record disengagement after the stale-input pause.');
  gaps.sort((a, b) => a - b);
  const initialMembership = latest[0]?.membership;
  console.info(
    JSON.stringify({
      participants,
      capacity: initialMembership?.capacity,
      registered: initialMembership?.registered,
      connectedAtRoundStart: recording.config.participantCount,
      activeAtCompletion: initialMembership?.active,
      reconnects,
      staleInputExpiredInRecording: staleEvidence,
      replayBytes: Buffer.byteLength(recordingText),
      frames: recording.frames.length,
      agreedResult: latest[0]?.round?.state.selectedId,
      ticks: latest[0]?.round?.state.tick,
      p95SnapshotGapMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0),
      roomId: id,
    }),
  );
} finally {
  if (timer) clearInterval(timer);
  for (const socket of sockets) socket?.close();
}
