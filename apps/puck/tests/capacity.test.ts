import { expect, it } from 'vitest';
import { configuredRoomCapacity } from '../server/service.ts';

it('defaults room capacity to 140 and accepts explicit overload capacity through 180', () => {
  expect(configuredRoomCapacity(undefined)).toBe(140);
  expect(configuredRoomCapacity('140')).toBe(140);
  expect(configuredRoomCapacity('180')).toBe(180);
});

it('rejects room capacities outside the supported range', () => {
  for (const value of ['1', '181', '140.5', 'many'])
    expect(() => configuredRoomCapacity(value)).toThrow('PUCK_ROOM_CAPACITY');
});
