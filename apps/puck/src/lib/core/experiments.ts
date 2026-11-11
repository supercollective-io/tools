import { type Config, forceFor, type Input, type Option, type Point } from './engine.ts';

export type Mode = 'baseline' | 'corrected' | 'personalised' | 'personalised-corrected';
export const MODES: Record<Mode, string> = {
  baseline: 'Baseline',
  corrected: 'Positional correction',
  personalised: 'Personalised layouts',
  'personalised-corrected': 'Personalised layouts + correction',
};
export const personalised = (mode: Mode) => mode.startsWith('personalised');
export const corrected = (mode: Mode) => mode === 'corrected' || mode === 'personalised-corrected';
export const CORRECTION_RATIO = 0.16;
export const MAPPING_VERSION = 'angular-mixture-v1';
const centre = { x: 500, y: 500 };
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (a: Point): Point => {
  const length = Math.hypot(a.x, a.y);
  return length > 1e-9 ? { x: a.x / length, y: a.y / length } : { x: 0, y: 0 };
};

/** Seeded permutation. For 4+ options, reject rotations/reflections: change neighbours. */
export function personalLayout(options: Option[], seed: string): Option[] {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const random = () => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return (hash >>> 0) / 4294967296;
  };
  const slots = options.map((_, i) => i);
  const symmetric = () =>
    [1, -1].some((direction) =>
      slots.every(
        (slot, i) => slot === (slots[0] + direction * i + options.length * 2) % options.length,
      ),
    );
  for (let attempt = 0; attempt < 32; attempt++) {
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    if (options.length < 4 || !symmetric()) break;
  }
  if (options.length >= 4 && symmetric()) [slots[0], slots[1]] = [slots[1], slots[0]];
  return options.map((option, i) => ({
    ...option,
    x: options[slots[i]].x,
    y: options[slots[i]].y,
  }));
}

/** Centre/edge triangle coordinates; continuous, but a reordered projection can fold. */
export function projectPoint(point: Point, canonical: Option[], local: Option[]): Point {
  const d = sub(point, centre);
  if (Math.hypot(d.x, d.y) < 1e-9) return { ...centre };
  for (let i = 0; i < canonical.length; i++) {
    const a = sub(canonical[i], centre),
      b = sub(canonical[(i + 1) % canonical.length], centre);
    const determinant = cross(a, b);
    if (Math.abs(determinant) < 1e-9) continue;
    let wa = cross(d, b) / determinant,
      wb = cross(a, d) / determinant;
    if (wa < -1e-8 || wb < -1e-8) continue;
    wa = Math.max(0, wa);
    wb = Math.max(0, wb);
    const scale = Math.max(1, wa + wb);
    wa /= scale;
    wb /= scale;
    const la = local.find((o) => o.id === canonical[i].id) ?? canonical[i];
    const lb =
      local.find((o) => o.id === canonical[(i + 1) % canonical.length].id) ??
      canonical[(i + 1) % canonical.length];
    return {
      x: 500 + wa * (la.x - 500) + wb * (lb.x - 500),
      y: 500 + wa * (la.y - 500) + wb * (lb.y - 500),
    };
  }
  return { ...point };
}

/** Resolve a direction into the two adjacent target rays, using non-negative coefficients. */
export function optionMixture(
  position: Point,
  magnet: Point,
  options: Option[],
): Record<string, number> {
  const direction = unit(sub(magnet, position));
  if (!direction.x && !direction.y) return {};
  const rays = options
    .map((o) => {
      let vector = sub(o, position);
      if (Math.hypot(vector.x, vector.y) < 1e-6) vector = sub(o, centre);
      const ray = unit(vector);
      return { id: o.id, ray, angle: Math.atan2(ray.y, ray.x) };
    })
    .sort((a, b) => a.angle - b.angle || a.id.localeCompare(b.id));
  for (const a of rays) {
    if (a.ray.x * direction.x + a.ray.y * direction.y > 1 - 1e-10) return { [a.id]: 1 };
  }
  for (let i = 0; i < rays.length; i++) {
    const a = rays[i],
      b = rays[(i + 1) % rays.length];
    const determinant = cross(a.ray, b.ray);
    if (determinant < 1e-9) continue;
    const wa = cross(direction, b.ray) / determinant,
      wb = cross(a.ray, direction) / determinant;
    if (wa >= -1e-9 && wb >= -1e-9) {
      const sum = Math.max(0, wa) + Math.max(0, wb);
      return { [a.id]: Math.max(0, wa) / sum, [b.id]: Math.max(0, wb) / sum };
    }
  }
  // At the boundary, outward directions may lie outside the target-ray cone.
  // They express no transferable option mixture rather than inventing a preference.
  return {};
}

export function mapInput(
  input: Input,
  position: Point,
  options: Option[],
  local: Option[],
  config: Config,
): Input {
  const localPosition = projectPoint(position, options, local);
  const localForce = forceFor(localPosition, input, config);
  const strength = Math.hypot(localForce.x, localForce.y);
  const weights = optionMixture(localPosition, input, local);
  const force = { x: 0, y: 0 };
  for (const option of options) {
    let direction = sub(option, position);
    if (Math.hypot(direction.x, direction.y) < 1e-6) direction = sub(option, centre);
    const ray = unit(direction);
    force.x += (weights[option.id] ?? 0) * strength * ray.x;
    force.y += (weights[option.id] ?? 0) * strength * ray.y;
  }
  // Canonical proxy magnet is for replay only; the recorded force is authoritative.
  const magnitude = Math.hypot(force.x, force.y),
    ray = unit(force);
  const distance =
    31 +
    config.reach * (1 - Math.min(1, (magnitude * config.participantCount) / config.acceleration));
  return {
    ...input,
    x: position.x + ray.x * distance,
    y: position.y + ray.y * distance,
    force,
    optionWeights: weights,
    availableStrength: strength,
  };
}

export function projectState(
  state: import('./engine.ts').State,
  canonical: Option[],
  local: Option[],
): import('./engine.ts').State {
  const position = projectPoint(state.position, canonical, local);
  const transformVector = (v: Point) => {
    const end = projectPoint(
      { x: state.position.x + v.x * 0.01, y: state.position.y + v.y * 0.01 },
      canonical,
      local,
    );
    return { x: (end.x - position.x) / 0.01, y: (end.y - position.y) / 0.01 };
  };
  return {
    ...state,
    position,
    velocity: transformVector(state.velocity),
    force: transformVector(state.force),
    ...(state.correction ? { correction: transformVector(state.correction) } : {}),
  };
}
