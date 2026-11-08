import { z } from 'zod';
import type { Option, State } from './engine.ts';
export const inputMessage = z
  .object({
    type: z.literal('input'),
    sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    x: z.number().finite().min(0).max(1000),
    y: z.number().finite().min(0).max(1000),
    engaged: z.boolean(),
  })
  .strict();
export const createRequest = z
  .object({
    question: z.string().trim().min(1).max(240),
    options: z.array(z.string().trim().min(1).max(48)).min(2).max(6),
  })
  .refine((v) => new Set(v.options.map((s) => s.toLowerCase())).size === v.options.length, {
    message: 'Use distinct answer options.',
  });
export const joinRequest = z.object({ name: z.string().trim().min(1).max(32) });
export type RoomView = {
  id: string;
  question: string;
  options: Option[];
  me: { id: string; name: string; host: boolean; participating: boolean } | null;
  participants: { id: string; name: string; connected: boolean }[];
  round: { id: string; state: State } | null;
  history: { id: string; status: string; startedAt: string; selectedLabel: string | null }[];
};
export type ServerMessage = { type: 'state'; room: RoomView } | { type: 'error'; message: string };
