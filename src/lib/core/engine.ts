/** Normalised arena units, not CSS pixels. Baseline parameters are Puck choices. */
export const ENGINE_VERSION = 'baseline-v1';
export const STEP_MS = 50;
export const PUCK_RADIUS = 22;
export const MAGNET_RADIUS = 9;
export const TARGET_RADIUS = 65;
export const BASELINE = Object.freeze({
  countdownMs: 3000,
  durationMs: 60000,
  dwellMs: 1500,
  acceleration: 850,
  damping: 3,
  maxSpeed: 220,
  reach: 170,
});
export type Point = { x: number; y: number };
export type Option = Point & { id: string; label: string };
export type Input = Point & { participantId: string; engaged: boolean; sequence: number };
export type Phase = 'countdown' | 'active' | 'selected' | 'timed-out' | 'cancelled' | 'interrupted';
export type Config = { [K in keyof typeof BASELINE]: number } & { participantCount: number };
export type State = {
  tick: number;
  phase: Phase;
  position: Point;
  velocity: Point;
  force: Point;
  elapsedMs: number;
  countdownMs: number;
  targetId: string | null;
  dwellMs: number;
  selectedId: string | null;
};
export type Frame = { state: State; inputs: Input[] };
export type Recording = {
  id: string;
  roomId: string;
  question: string;
  options: Option[];
  engineVersion: string;
  config: Config;
  participants: { id: string; name: string }[];
  startedAt: string;
  frames: Frame[];
  result: State;
};
export function layout(labels: string[]): Option[] {
  return labels.map((label, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
    return {
      id: `option-${i}`,
      label,
      x: 500 + Math.cos(angle) * 370,
      y: 500 + Math.sin(angle) * 370,
    };
  });
}
export function initialState(config: Config): State {
  return {
    tick: 0,
    phase: 'countdown',
    position: { x: 500, y: 500 },
    velocity: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    elapsedMs: 0,
    countdownMs: config.countdownMs,
    targetId: null,
    dwellMs: 0,
    selectedId: null,
  };
}
export function terminal(phase: Phase) {
  return phase !== 'countdown' && phase !== 'active';
}
export function forceFor(position: Point, input: Input, config: Config): Point {
  if (!input.engaged) return { x: 0, y: 0 };
  const dx = input.x - position.x,
    dy = input.y - position.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) return { x: 0, y: 0 };
  const gap = Math.max(0, distance - PUCK_RADIUS - MAGNET_RADIUS);
  const strength =
    (config.acceleration * Math.max(0, 1 - gap / config.reach)) /
    Math.max(1, config.participantCount);
  return { x: (dx / distance) * strength, y: (dy / distance) * strength };
}
/** Pure fixed-step transition. Input ordering is canonicalised by the server. */
export function step(previous: State, inputs: Input[], options: Option[], config: Config): State {
  if (terminal(previous.phase)) return previous;
  const state: State = {
    ...previous,
    tick: previous.tick + 1,
    position: { ...previous.position },
    velocity: { ...previous.velocity },
    force: { x: 0, y: 0 },
  };
  if (state.phase === 'countdown') {
    state.countdownMs = Math.max(0, state.countdownMs - STEP_MS);
    if (state.countdownMs === 0) state.phase = 'active';
    return state;
  }
  state.elapsedMs += STEP_MS;
  for (const input of inputs) {
    const f = forceFor(state.position, input, config);
    state.force.x += f.x;
    state.force.y += f.y;
  }
  const dt = STEP_MS / 1000;
  state.velocity.x = (state.velocity.x + state.force.x * dt) * Math.exp(-config.damping * dt);
  state.velocity.y = (state.velocity.y + state.force.y * dt) * Math.exp(-config.damping * dt);
  const speed = Math.hypot(state.velocity.x, state.velocity.y);
  if (speed > config.maxSpeed) {
    state.velocity.x *= config.maxSpeed / speed;
    state.velocity.y *= config.maxSpeed / speed;
  }
  for (const axis of ['x', 'y'] as const) {
    state.position[axis] += state.velocity[axis] * dt;
    if (state.position[axis] < PUCK_RADIUS || state.position[axis] > 1000 - PUCK_RADIUS) {
      state.position[axis] = Math.max(
        PUCK_RADIUS,
        Math.min(1000 - PUCK_RADIUS, state.position[axis]),
      );
      state.velocity[axis] = 0;
    }
  }
  const target = options.find(
    (o) =>
      Math.hypot(o.x - state.position.x, o.y - state.position.y) <= TARGET_RADIUS - PUCK_RADIUS,
  );
  state.dwellMs = target ? (state.targetId === target.id ? state.dwellMs + STEP_MS : STEP_MS) : 0;
  state.targetId = target?.id ?? null;
  // An unengaged group cannot select an answer by leaving the puck parked there.
  if (!inputs.some((input) => input.engaged)) {
    state.dwellMs = 0;
  }
  if (state.dwellMs >= config.dwellMs) {
    state.phase = 'selected';
    state.selectedId = state.targetId;
  } else if (state.elapsedMs >= config.durationMs) state.phase = 'timed-out';
  return state;
}
