import { createHash, randomInt, randomUUID } from 'node:crypto';

export const batchMilliseconds = 12000;
export const waitingLeaseMilliseconds = 20000;
export function newPairing(activityId) {
  return { activityId, id: randomUUID(), waiting: [], pairs: [], nextBatchAt: null };
}
export function validatePairing(value) {
  if (!value || typeof value.activityId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.activityId) ||
      typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id) ||
      !Array.isArray(value.waiting) || !Array.isArray(value.pairs) ||
      value.pairs.some(pair => !Array.isArray(pair) || pair.length !== 2) ||
      (value.nextBatchAt !== null && (!Number.isSafeInteger(value.nextBatchAt) || value.nextBatchAt < 0)))
    throw new Error('Invalid saved pairing');
  if (value.waiting.some(entry => !entry || !Number.isSafeInteger(entry.seenAt) || entry.seenAt < 0))
    throw new Error('Invalid saved waiting participant');
  if (value.prompts !== undefined) {
    if (!value.prompts || typeof value.prompts !== 'object' || Array.isArray(value.prompts)) throw new Error('Invalid saved prompts');
    for (const [number, prompt] of Object.entries(value.prompts)) {
      if (!/^[1-9][0-9]*$/.test(number) || Number(number) > value.pairs.length ||
          !prompt || !Number.isSafeInteger(prompt.revision) || prompt.revision < 1 ||
          !['shown', 'skipped'].includes(prompt.status) || !Array.isArray(prompt.seen) || prompt.seen.length > 64 ||
          prompt.seen.some(item => typeof item !== 'string' || !item.trim() || item.length > 300) ||
          (prompt.last !== undefined && (typeof prompt.last !== 'string' || prompt.last.length > 300)) ||
          (prompt.status === 'shown' && (typeof prompt.text !== 'string' || !prompt.text.trim() || prompt.text.length > 300)))
        throw new Error('Invalid saved pair prompt');
    }
  }
  const keys = [...value.waiting.map(entry => entry.key), ...value.pairs.flat()];
  if (keys.length > 1000 || keys.some(key => typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) ||
      new Set(keys).size !== keys.length || (value.waiting.length > 0 && value.nextBatchAt === null))
    throw new Error('Invalid saved pairing participants');
}
export function participantKey(token) {
  return createHash('sha256').update(token).digest('hex');
}
// Caller serialises mutations and persists the returned value before replying.
export function joinPairing(saved, key, now = Date.now(), choose = randomInt) {
  const next = structuredClone(saved);
  next.waiting = next.waiting.filter(entry => now - entry.seenAt <= waitingLeaseMilliseconds);
  if (!next.waiting.length) next.nextBatchAt = null;
  const waiting = next.waiting.find(entry => entry.key === key);
  if (waiting && now - waiting.seenAt >= 4000) waiting.seenAt = now;
  if (!next.pairs.some(pair => pair.includes(key)) && !waiting) {
    if (next.pairs.length * 2 + next.waiting.length >= 1000) return null;
    next.waiting.push({ key, seenAt: now });
    next.nextBatchAt ??= now + batchMilliseconds;
  }
  if (next.waiting.length >= 2 && now >= next.nextBatchAt) {
    for (let i = next.waiting.length - 1; i > 0; i--) {
      const j = choose(i + 1);
      [next.waiting[i], next.waiting[j]] = [next.waiting[j], next.waiting[i]];
    }
    while (next.waiting.length >= 2) next.pairs.push(next.waiting.splice(0, 2).map(entry => entry.key));
    next.nextBatchAt = next.waiting.length ? now + batchMilliseconds : null;
  }
  return next;
}
export function pairingResult(pairing, key, catalogue = []) {
  const index = pairing.pairs.findIndex(pair => pair.includes(key));
  return { roundId: pairing.id, status: index < 0 ? 'waiting' : 'paired',
    ...(index >= 0 ? { number: index + 1, promptCount: catalogue.length,
      prompt: publicPrompt(pairing.prompts?.[index + 1]) } : {}) };
}

function publicPrompt(prompt) {
  return prompt ? { revision: prompt.revision, status: prompt.status,
    ...(prompt.status === 'shown' ? { text: prompt.text } : {}) } : { revision: 0, status: 'none' };
}

// The expected revision makes retrying a lost response safe, and coalesces
// simultaneous draws by the two partners into one shared change.
export function changePairPrompt(saved, number, catalogue, action, expectedRevision, choose = randomInt) {
  const previous = saved.prompts?.[number];
  if ((previous?.revision ?? 0) !== expectedRevision) return saved;
  let prompt;
  if (action === 'skip-prompt') {
    prompt = { ...previous, revision: expectedRevision + 1, status: 'skipped', seen: previous?.seen ?? [] };
    delete prompt.text;
  } else {
    if (!catalogue.length) return saved;
    let seen = (previous?.seen ?? []).filter(item => catalogue.includes(item));
    let candidates = catalogue.filter(item => !seen.includes(item));
    if (!candidates.length) {
      seen = [];
      candidates = catalogue.filter(item => catalogue.length === 1 || item !== previous?.last);
    }
    const text = candidates[choose(candidates.length)];
    prompt = { revision: expectedRevision + 1, status: 'shown', text, last: text, seen: [...seen, text] };
  }
  return { ...saved, prompts: { ...saved.prompts, [number]: prompt } };
}
