import { createHash, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { WebSocket } from 'ws';
import {
  BASELINE,
  ENGINE_VERSION,
  type Input,
  initialState,
  layout,
  type Recording,
  STEP_MS,
  type State,
  step,
  terminal,
} from '../src/lib/core/engine.ts';
import { inputMessage, type RoomView } from '../src/lib/core/protocol.ts';
import type { Participant, Store, StoredRoom } from './store.ts';
export const MAX_PARTICIPANTS = 32;
const id = () => randomBytes(12).toString('base64url');
export const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export class ClientError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type Connection = {
  socket: WebSocket;
  input: Input;
  updatedAt: number;
  count: number;
  windowAt: number;
};
type LiveRoom = {
  data: StoredRoom;
  participants: Participant[];
  connections: Map<string, Connection>;
  recording: Recording | null;
  state: State | null;
  history: RoomView['history'];
};
export class SessionService {
  rooms = new Map<string, LiveRoom>();
  private timer: ReturnType<typeof setInterval>;
  private last = performance.now();
  private accumulator = 0;
  constructor(public store: Store) {
    this.timer = setInterval(() => this.advance(), 25);
  }
  private get(roomId: string): LiveRoom {
    const cached = this.rooms.get(roomId);
    if (cached) return cached;
    const data = this.store.room(roomId);
    if (!data) throw new ClientError('This room does not exist.', 404);
    if (this.rooms.size >= 100) {
      const idle = [...this.rooms].find(
        ([, r]) => !r.connections.size && (!r.state || terminal(r.state.phase)),
      );
      if (!idle) throw new ClientError('The server is full. Try again later.', 503);
      this.rooms.delete(idle[0]);
    }
    const room: LiveRoom = {
      data,
      participants: this.store.participants(roomId),
      connections: new Map(),
      recording: null,
      state: null,
      history: this.store.history(roomId),
    };
    this.rooms.set(roomId, room);
    return room;
  }
  create(name: string, question: string, labels: string[]) {
    const room: StoredRoom = {
      id: id(),
      question,
      options: layout(labels),
      createdAt: new Date().toISOString(),
    };
    const token = randomBytes(32).toString('base64url');
    const participant: Participant = {
      id: id(),
      roomId: room.id,
      name,
      tokenHash: hash(token),
      host: true,
    };
    this.store.create(room, participant);
    this.get(room.id);
    return { roomId: room.id, token };
  }
  authenticate(roomId: string, token?: string) {
    const room = this.get(roomId);
    return token ? room.participants.find((p) => p.tokenHash === hash(token)) : undefined;
  }
  join(roomId: string, name: string, token?: string) {
    const existing = this.authenticate(roomId, token);
    if (existing && token) return { token };
    const room = this.get(roomId);
    if (room.state && !terminal(room.state.phase))
      throw new ClientError('A round is running. Join after it finishes.', 409);
    if (room.participants.length >= MAX_PARTICIPANTS)
      throw new ClientError('This room has reached its 32-participant limit.', 409);
    const nextToken = randomBytes(32).toString('base64url');
    const p: Participant = { id: id(), roomId, name, tokenHash: hash(nextToken), host: false };
    this.store.addParticipant(p);
    room.participants.push(p);
    this.broadcast(room);
    return { token: nextToken };
  }
  view(roomId: string, participant?: Participant): RoomView {
    const room = this.get(roomId);
    return {
      id: roomId,
      question: room.data.question,
      options: room.data.options,
      me: participant
        ? { id: participant.id, name: participant.name, host: participant.host }
        : null,
      participants: participant
        ? room.participants.map((p) => ({
            id: p.id,
            name: p.name,
            connected: room.connections.has(p.id),
          }))
        : [],
      round: room.recording && room.state ? { id: room.recording.id, state: room.state } : null,
      history: participant ? room.history : [],
    };
  }
  start(roomId: string, participant: Participant) {
    if (!participant.host) throw new ClientError('Only the host can start a round.', 403);
    const room = this.get(roomId);
    if (room.state && !terminal(room.state.phase))
      throw new ClientError('A round is already running.', 409);
    if (room.connections.size < 2)
      throw new ClientError('Connect at least two participants before starting.', 409);
    if ([...this.rooms.values()].filter((r) => r.state && !terminal(r.state.phase)).length >= 4)
      throw new ClientError('Four rounds are already running. Try again shortly.', 503);
    const config = { ...BASELINE, participantCount: room.connections.size };
    room.state = initialState(config);
    room.recording = {
      id: id(),
      roomId,
      question: room.data.question,
      options: room.data.options,
      engineVersion: ENGINE_VERSION,
      config,
      participants: room.participants
        .filter((p) => room.connections.has(p.id))
        .map((p) => ({ id: p.id, name: p.name })),
      startedAt: new Date().toISOString(),
      frames: [],
      result: room.state,
    };
    this.store.start(room.recording.id, roomId, room.recording.startedAt);
    this.broadcast(room);
  }
  cancel(roomId: string, participant: Participant) {
    if (!participant.host) throw new ClientError('Only the host can cancel a round.', 403);
    const room = this.get(roomId);
    if (!room.state || terminal(room.state.phase))
      throw new ClientError('There is no active round.', 409);
    this.finish(room, 'cancelled');
    this.broadcast(room);
  }
  connect(roomId: string, p: Participant, socket: WebSocket) {
    const room = this.get(roomId);
    room.connections.get(p.id)?.socket.close(4001, 'Another tab now controls your magnet.');
    const connection: Connection = {
      socket,
      input: { participantId: p.id, x: 500, y: 500, engaged: false, sequence: -1 },
      updatedAt: performance.now(),
      count: 0,
      windowAt: performance.now(),
    };
    room.connections.set(p.id, connection);
    socket.on('message', (data, binary) => {
      if (room.connections.get(p.id) !== connection) return;
      const now = performance.now();
      if (now - connection.windowAt >= 1000) {
        connection.count = 0;
        connection.windowAt = now;
      }
      if (++connection.count > 40 || binary) {
        socket.close(1008, 'Invalid input rate or format.');
        return;
      }
      let parsed: ReturnType<typeof inputMessage.safeParse>;
      try {
        parsed = inputMessage.safeParse(JSON.parse(data.toString()));
      } catch {
        socket.close(1008, 'Invalid JSON.');
        return;
      }
      if (!parsed.success) {
        socket.close(1008, 'Invalid input.');
        return;
      }
      const message = parsed.data;
      if (message.sequence <= connection.input.sequence) return;
      connection.input = {
        participantId: p.id,
        x: message.x,
        y: message.y,
        engaged: message.engaged,
        sequence: message.sequence,
      };
      connection.updatedAt = now;
    });
    socket.on('error', () => socket.close());
    socket.on('close', () => {
      if (room.connections.get(p.id) === connection) room.connections.delete(p.id);
      if (!room.connections.size && room.state && !terminal(room.state.phase))
        this.finish(room, 'interrupted');
      this.broadcast(room);
    });
    this.broadcast(room);
  }
  private finish(room: LiveRoom, phase?: 'cancelled' | 'interrupted') {
    if (!room.state || !room.recording) return;
    if (phase) room.state = { ...room.state, phase, velocity: { x: 0, y: 0 } };
    room.recording.result = room.state;
    this.store.finish(room.recording);
    room.history = this.store.history(room.data.id);
    console.info(
      JSON.stringify({
        event: 'round_finished',
        roomId: room.data.id,
        roundId: room.recording.id,
        phase: room.state.phase,
        ticks: room.state.tick,
      }),
    );
    // A completed recording is in SQLite; do not retain its frames in process memory.
    room.recording = { ...room.recording, frames: [] };
  }
  private advance() {
    const now = performance.now();
    const elapsed = now - this.last;
    this.last = now;
    if (elapsed > 1000) {
      console.warn(JSON.stringify({ event: 'simulation_overrun', elapsedMs: elapsed }));
      for (const room of this.rooms.values())
        if (room.state && !terminal(room.state.phase)) {
          this.finish(room, 'interrupted');
          this.broadcast(room);
        }
      this.accumulator = 0;
      return;
    }
    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps++ < 5) {
      this.accumulator -= STEP_MS;
      for (const room of this.rooms.values()) {
        const recording = room.recording;
        if (!recording || !room.state || terminal(room.state.phase)) continue;
        const inputs = recording.participants
          .map((p) => {
            const connection = room.connections.get(p.id);
            return connection
              ? {
                  ...connection.input,
                  engaged: connection.input.engaged && now - connection.updatedAt < 750,
                }
              : { participantId: p.id, x: 500, y: 500, engaged: false, sequence: -1 };
          })
          .sort((a, b) => a.participantId.localeCompare(b.participantId));
        room.state = step(room.state, inputs, recording.options, recording.config);
        recording.frames.push({ state: room.state, inputs });
        if (terminal(room.state.phase)) this.finish(room);
        this.broadcast(room);
      }
    }
  }
  private broadcast(room: LiveRoom) {
    for (const p of room.participants) {
      const socket = room.connections.get(p.id)?.socket;
      if (socket?.readyState !== 1) continue;
      if (socket.bufferedAmount > 256 * 1024) {
        socket.close(1013, 'Connection is too slow. Reconnect to continue.');
        continue;
      }
      socket.send(JSON.stringify({ type: 'state', room: this.view(room.data.id, p) }));
    }
  }
  shutdown() {
    clearInterval(this.timer);
    for (const room of this.rooms.values()) {
      if (room.state && !terminal(room.state.phase)) this.finish(room, 'interrupted');
      for (const connection of room.connections.values())
        connection.socket.close(1001, 'Server restarting.');
    }
  }
}
