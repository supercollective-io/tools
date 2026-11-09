import type { Point, Recording } from './engine.ts';

export type Contribution = {
  participantId: string;
  name: string;
  colour: string;
  optionId: string;
  label: string;
  proportion: number;
  force: number;
  length: number;
  direction: Point;
  lane: number;
};

/** Expand recorded option mixtures before cancellation, without inferring preferences anew. */
export function contributionsAt(recording: Recording, index: number): Contribution[] {
  const frame = recording.frames[index];
  if (!frame || frame.state.elapsedMs === 0 || frame.state.phase === 'countdown') return [];
  const origin = recording.frames[index - 1]?.state.position ?? { x: 500, y: 500 };
  const maximum = recording.config.acceleration / Math.max(1, recording.config.participantCount);
  const active = frame.inputs.filter(
    (input) => input.engaged && (input.availableStrength ?? 0) > 0,
  );
  return active.flatMap((input, lane) => {
    const personIndex = recording.participants.findIndex((p) => p.id === input.participantId);
    return recording.options.flatMap((option) => {
      const proportion = input.optionWeights?.[option.id] ?? 0;
      const force = proportion * (input.availableStrength ?? 0);
      if (force <= 0) return [];
      let dx = option.x - origin.x,
        dy = option.y - origin.y;
      if (Math.hypot(dx, dy) < 1e-6) {
        dx = option.x - 500;
        dy = option.y - 500;
      }
      const distance = Math.hypot(dx, dy);
      return [
        {
          participantId: input.participantId,
          name: recording.participants[personIndex]?.name ?? 'Participant',
          colour: `hsl(${(Math.max(0, personIndex) * 137.508 + 210) % 360} 65% 35%)`,
          optionId: option.id,
          label: option.label,
          proportion,
          force,
          length: (220 * force) / maximum,
          direction: { x: dx / distance, y: dy / distance },
          lane: (lane - (active.length - 1) / 2) * 8,
        },
      ];
    });
  });
}
