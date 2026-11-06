import { createHash } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { Generate, ModelConfig, PromptMessage } from "./models.ts";
import { baseConfigSchema, scoreSchema } from "./schema.ts";

const id = z.string().regex(/^[a-z][a-z0-9-]*$/u);
const text = z.string().trim().min(1).max(4000);
const count = z.number().int().min(1).max(64);
const optionSchema = z.strictObject({ id, count, instruction: text });
export const contributionDesignSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    title: text,
    seed: z.number().int().min(0).max(0xffffffff),
    participantCount: z.literal(64),
    pilotSize: z.literal(8),
    optimisationSteps: z.number().int().min(0).max(50_000),
    invitation: z.strictObject({
      main: text,
      optionalSupporting: z.array(text).length(2),
    }),
    dimensions: z
      .array(
        z.strictObject({
          id,
          label: text,
          options: z.array(optionSchema).min(2).max(16),
        }),
      )
      .min(1)
      .max(20),
    situations: z
      .array(
        z.strictObject({
          id,
          count,
          context: text,
          allowed: z.record(id, z.array(id).min(1)),
        }),
      )
      .min(1)
      .max(64),
  })
  .superRefine((design, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    if (!unique(design.dimensions.map((d) => d.id)))
      issue("Dimension IDs must be unique.");
    if (!unique(design.situations.map((s) => s.id)))
      issue("Situation IDs must be unique.");
    if (design.situations.reduce((sum, s) => sum + s.count, 0) !== 64)
      issue("Situation counts must total 64.");
    for (const dimension of design.dimensions) {
      if (!unique(dimension.options.map((o) => o.id)))
        issue("Option IDs must be unique within a dimension.");
      if (dimension.options.reduce((sum, o) => sum + o.count, 0) !== 64)
        issue(`Counts for ${dimension.id} must total 64.`);
    }
    for (const situation of design.situations) {
      for (const [key, values] of Object.entries(situation.allowed)) {
        const dimension = design.dimensions.find((d) => d.id === key);
        if (
          !dimension ||
          !unique(values) ||
          values.some((value) => !dimension.options.some((o) => o.id === value))
        )
          issue(`Invalid compatibility rule for ${situation.id}/${key}.`);
      }
    }
  });

export const contributionConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generator: baseConfigSchema.shape.composer.refine(
    (config) => !config.rawPrefill,
    "Contribution generation starts a fresh turn; raw prefill is not supported.",
  ),
});
export type ContributionDesign = z.infer<typeof contributionDesignSchema>;
export type Slot = {
  id: string;
  situationId: string;
  assignments: Record<string, string>;
};

// Algorithm changes require a version bump and regeneration of prepared bundles.
export const ASSIGNMENT_VERSION = "balanced-shuffle-v1";
export const AUTHORING_VERSION = "contribution-v4";
const authoringInstructions = `Write one fictional person's spoken answer to the invitation, in English. They are answering on the spot, without preparing what to say.
Use the assignments as background, not a checklist. “Open” means you choose. Their circumstances need not be their topic.
Let them discover what they mean while speaking. They may start generally and find a focus, move between concerns, revise a thought or leave it unresolved. Others may already know what they want to say. Preserve that variation rather than giving everyone a polished argument or decorative hesitations.
Aim for about one minute, using the assigned length as a loose guide. Return only their words.`;

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

function allowed(
  design: ContributionDesign,
  slot: Slot,
  key: string,
  value: string,
): boolean {
  const rule = design.situations.find((s) => s.id === slot.situationId)
    ?.allowed[key];
  return !rule || rule.includes(value);
}

// Match a shuffled bag of exactly counted options to compatible slots. Augmenting
// paths avoid greedy dead ends when several contexts need the same scarce option.
function assignDimension(
  design: ContributionDesign,
  slots: Slot[],
  key: string,
  rng: () => number,
): void {
  const dimension = design.dimensions.find((d) => d.id === key);
  if (!dimension) throw new Error("Unknown dimension.");
  const bag = shuffle(
    dimension.options.flatMap((o) => Array<string>(o.count).fill(o.id)),
    rng,
  );
  const owners = Array<number>(bag.length).fill(-1);
  const choices = slots.map((slot) =>
    shuffle(
      bag.flatMap((value, i) => (allowed(design, slot, key, value) ? [i] : [])),
      rng,
    ),
  );
  const place = (slotIndex: number, seen: Set<number>): boolean => {
    for (const index of choices[slotIndex] ?? []) {
      if (seen.has(index)) continue;
      seen.add(index);
      const previous = owners[index] ?? -1;
      if (previous === -1 || place(previous, seen)) {
        owners[index] = slotIndex;
        return true;
      }
    }
    return false;
  };
  for (const index of shuffle(
    slots.map((_, i) => i),
    rng,
  )) {
    if (!place(index, new Set()))
      throw new Error(`Infeasible counts and compatibility rules for ${key}.`);
  }
  owners.forEach((owner, index) => {
    const slot = slots[owner];
    const value = bag[index];
    if (!slot || !value) throw new Error("Incomplete assignment.");
    slot.assignments[key] = value;
  });
}

function pairTables(design: ContributionDesign, slots: Slot[]) {
  return design.dimensions.flatMap((left, i) =>
    design.dimensions.slice(i + 1).map((right) => {
      const counts = new Map<string, number>();
      for (const slot of slots) {
        const key = `${slot.assignments[left.id]}|${slot.assignments[right.id]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return { left: left.id, right: right.id, counts };
    }),
  );
}
const collisions = (n: number) => (n * (n - 1)) / 2;

function spreadPairs(
  design: ContributionDesign,
  slots: Slot[],
  rng: () => number,
) {
  const tables = pairTables(design, slots);
  const initial = tables.reduce(
    (sum, t) =>
      sum + [...t.counts.values()].reduce((s, n) => s + collisions(n), 0),
    0,
  );
  let score = initial;
  for (let attempt = 0; attempt < design.optimisationSteps; attempt++) {
    const dimension =
      design.dimensions[Math.floor(rng() * design.dimensions.length)];
    const a = slots[Math.floor(rng() * slots.length)];
    const b = slots[Math.floor(rng() * slots.length)];
    if (!dimension || !a || !b || a === b) continue;
    const av = a.assignments[dimension.id];
    const bv = b.assignments[dimension.id];
    if (
      !av ||
      !bv ||
      av === bv ||
      !allowed(design, a, dimension.id, bv) ||
      !allowed(design, b, dimension.id, av)
    )
      continue;
    const updates: {
      counts: Map<string, number>;
      key: string;
      value: number;
    }[] = [];
    let delta = 0;
    for (const table of tables) {
      if (table.left !== dimension.id && table.right !== dimension.id) continue;
      const keyFor = (slot: Slot, replacement: string) =>
        `${table.left === dimension.id ? replacement : slot.assignments[table.left]}|${table.right === dimension.id ? replacement : slot.assignments[table.right]}`;
      const changes = new Map<string, number>();
      for (const [key, change] of [
        [keyFor(a, av), -1],
        [keyFor(b, bv), -1],
        [keyFor(a, bv), 1],
        [keyFor(b, av), 1],
      ] as const)
        changes.set(key, (changes.get(key) ?? 0) + change);
      for (const [key, change] of changes) {
        const old = table.counts.get(key) ?? 0;
        const value = old + change;
        delta += collisions(value) - collisions(old);
        updates.push({ counts: table.counts, key, value });
      }
    }
    if (delta > 0) continue;
    a.assignments[dimension.id] = bv;
    b.assignments[dimension.id] = av;
    for (const update of updates) update.counts.set(update.key, update.value);
    score += delta;
  }
  return { initialPairCollisions: initial, finalPairCollisions: score };
}

// A nested order prioritises options not yet represented, then underrepresented
// options, across dimensions and situations. Ties use the recorded seeded order.
function selectOrder(
  design: ContributionDesign,
  slots: Slot[],
  rng: () => number,
): string[] {
  const remaining = shuffle(slots, rng);
  const seen = new Map<string, number>();
  const features = (slot: Slot) => [
    `situation|${slot.situationId}`,
    ...design.dimensions.map((d) => `${d.id}|${slot.assignments[d.id]}`),
  ];
  const selected: string[] = [];
  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = -1;
    remaining.forEach((slot, index) => {
      const score = features(slot).reduce(
        (sum, key) =>
          sum + (key.endsWith("|open") ? 0.5 : 1) / (1 + (seen.get(key) ?? 0)),
        0,
      );
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    const slot = remaining.splice(bestIndex, 1)[0];
    if (!slot) throw new Error("Subset selection failed.");
    selected.push(slot.id);
    for (const key of features(slot)) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return selected;
}

export function coverage(design: ContributionDesign, slots: Slot[]) {
  return {
    participants: slots.length,
    dimensions: design.dimensions.map((d) => ({
      id: d.id,
      options: d.options.map((o) => ({
        id: o.id,
        targetIn64: o.count,
        actual: slots.filter((s) => s.assignments[d.id] === o.id).length,
      })),
    })),
    situations: design.situations.map((s) => ({
      id: s.id,
      targetIn64: s.count,
      actual: slots.filter((slot) => slot.situationId === s.id).length,
    })),
    pairs: pairTables(design, slots).map((t) => ({
      left: t.left,
      right: t.right,
      observedCombinations: [...t.counts.values()].filter((n) => n > 0).length,
      counts: Object.fromEntries(
        [...t.counts.entries()].sort(([a], [b]) => a.localeCompare(b, "en")),
      ),
    })),
  };
}

export function contributionMessages(
  design: ContributionDesign,
  slot: Slot,
): PromptMessage[] {
  const situation = design.situations.find((s) => s.id === slot.situationId);
  if (!situation) throw new Error("Unknown situation.");
  return [
    { role: "system", content: authoringInstructions },
    {
      role: "user",
      content: JSON.stringify(
        {
          invitation: design.invitation,
          privateCircumstances: situation.context,
          privateDirections: design.dimensions.map((d) => {
            const option = d.options.find(
              (o) => o.id === slot.assignments[d.id],
            );
            if (!option) throw new Error("Unknown assigned option.");
            return { dimension: d.label, direction: option.instruction };
          }),
        },
        null,
        2,
      ),
    },
  ];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
export const fingerprint = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");

export function prepareCorpus(designInput: unknown, configInput: unknown) {
  const design = contributionDesignSchema.parse(designInput);
  const { generator } = contributionConfigSchema.parse(configInput);
  const rng = random(design.seed);
  const situationIds = shuffle(
    design.situations.flatMap((s) => Array<string>(s.count).fill(s.id)),
    rng,
  );
  const slots: Slot[] = situationIds.map((situationId, i) => ({
    id: `p${String(i + 1).padStart(3, "0")}`,
    situationId,
    assignments: {},
  }));
  for (const dimension of design.dimensions)
    assignDimension(design, slots, dimension.id, rng);
  const optimisation = spreadPairs(design, slots, rng);
  const order = selectOrder(design, slots, rng);
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const subsets = [8, 16, 32, 64].map((size) => ({
    size,
    ids: order.slice(0, size),
  }));
  const pilotSlots = order.slice(0, 8).map((id) => {
    const slot = byId.get(id);
    if (!slot) throw new Error("Missing pilot slot.");
    return slot;
  });
  const payload = {
    schemaVersion: 1,
    assignmentVersion: ASSIGNMENT_VERSION,
    authoringVersion: AUTHORING_VERSION,
    status: "prepared-not-generated",
    provenance: "fictional-design-not-a-population-sample",
    design,
    generator,
    slots,
    subsets,
    optimisation,
    coverage: {
      full: coverage(design, slots),
      pilot: coverage(design, pilotSlots),
    },
    requests: pilotSlots.map((slot) => ({
      id: slot.id,
      messages: contributionMessages(design, slot),
    })),
  };
  return { ...payload, fingerprint: fingerprint(payload) };
}
export type CorpusBundle = ReturnType<typeof prepareCorpus>;

export async function readCorpusBundle(path: string): Promise<CorpusBundle> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  const source = z
    .object({
      design: contributionDesignSchema,
      generator: contributionConfigSchema.shape.generator,
    })
    .parse(value);
  const expected = prepareCorpus(source.design, {
    schemaVersion: 1,
    generator: source.generator,
  });
  if (fingerprint(value) !== fingerprint(expected))
    throw new Error(
      "Bundle does not match its design, model or current algorithm. Prepare a new bundle before dispatch.",
    );
  return expected;
}

async function newDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await mkdir(path); // Exclusive: never mix or overwrite preparations or runs.
}
const jsonFile = (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });

export async function writeCorpusBundle(
  path: string,
  bundle: CorpusBundle,
): Promise<void> {
  await newDirectory(path);
  await jsonFile(join(path, "bundle.json"), bundle);
  const lines = [
    "# Prepared contribution pilot",
    "",
    "Status: prepared; no model calls or contributions.",
    "",
    `Bundle fingerprint: \`${bundle.fingerprint}\``,
    "",
    `Model: \`${bundle.generator.provider}/${bundle.generator.model}\`. Assignment seed: ${bundle.design.seed}.`,
    "",
    "## Invitation",
    "",
    `> ${bundle.design.invitation.main}`,
    "",
    "Optional supporting prompts:",
    "",
    ...bundle.design.invitation.optionalSupporting.flatMap((q) => [
      `> ${q}`,
      "",
    ]),
    "## Assignment counts",
    "",
    "Counts are design choices, not audience estimates. The pilot is selected for coverage, not proportional sampling.",
    "",
    "| Dimension / option | Target in 64 | Assigned in 64 | Pilot 8 |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const d of bundle.coverage.full.dimensions)
    for (const o of d.options) {
      const pilot = bundle.coverage.pilot.dimensions
        .find((p) => p.id === d.id)
        ?.options.find((p) => p.id === o.id)?.actual;
      lines.push(
        `| ${d.id} / ${o.id} | ${o.targetIn64} | ${o.actual} | ${pilot} |`,
      );
    }
  lines.push(
    "",
    "## Pair coverage",
    "",
    `Repeated-pair score: ${bundle.optimisation.initialPairCollisions} → ${bundle.optimisation.finalPairCollisions}. Lower means fewer repeated pairings, not more human realism.`,
    "",
    "Full pair counts, situations, slots and nested 8/16/32/64 subsets are in bundle.json. Constraints prevent some combinations; the search does not promise an optimum.",
    "",
    "## Pilot slots",
    "",
  );
  for (const request of bundle.requests) {
    const slot = bundle.slots.find((s) => s.id === request.id);
    lines.push(
      `### ${request.id}`,
      "",
      `Situation: ${slot?.situationId}.`,
      "",
      "```json",
      request.messages[1]?.content ?? "",
      "```",
      "",
    );
  }
  lines.push(
    "## Common authoring instruction",
    "",
    "```text",
    authoringInstructions,
    "```",
    "",
  );
  await writeFile(join(path, "review.md"), lines.join("\n"), { flag: "wx" });
}

export const wordCount = (text: string): number =>
  text.match(/\S+/gu)?.length ?? 0;

/** Runs only the frozen eight requests. No retries, continuation or composer calls. */
export async function runContributionPilot(
  bundle: CorpusBundle,
  outputDir: string,
  generate: Generate,
  signal: AbortSignal,
) {
  // Validate even when called from code rather than the file-reading CLI path.
  const expected = prepareCorpus(bundle.design, {
    schemaVersion: 1,
    generator: bundle.generator,
  });
  if (fingerprint(bundle) !== fingerprint(expected))
    throw new Error("Invalid pilot bundle.");
  signal.throwIfAborted();
  await newDirectory(outputDir);
  await jsonFile(join(outputDir, "bundle.json"), bundle);
  const journal = await open(join(outputDir, "events.jsonl"), "wx");
  const append = async (event: object) => {
    await journal.write(
      `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
    );
    await journal.sync();
  };
  const completed: {
    id: string;
    text: string;
    words: number;
    flags: string[];
  }[] = [];
  let failure: { id: string; code: string } | undefined;
  try {
    await append({ type: "started", fingerprint: bundle.fingerprint });
    for (const request of bundle.requests) {
      let prefix = "";
      await append({ type: "request-started", id: request.id });
      try {
        signal.throwIfAborted();
        // Fresh copies prevent an adapter from altering the frozen requests.
        const result = await generate(
          {
            config: structuredClone(bundle.generator) as ModelConfig,
            messages: structuredClone(request.messages),
            signal,
          },
          async (token) => {
            prefix += token;
            await append({ type: "prefix", id: request.id, text: prefix });
          },
        );
        signal.throwIfAborted();
        if (!result.text.trim())
          throw Object.assign(new Error("Empty contribution."), {
            code: "empty",
          });
        if (result.finishReason === "length")
          throw Object.assign(new Error("Truncated contribution."), {
            code: "truncated",
          });
        if (prefix && prefix !== result.text)
          throw Object.assign(new Error("Stream mismatch."), {
            code: "stream-mismatch",
          });
        const words = wordCount(result.text);
        const flags: string[] = [];
        if (words < 80 || words > 180) flags.push("length-review");
        if (completed.some((entry) => entry.text.trim() === result.text.trim()))
          flags.push("duplicate-review");
        completed.push({ id: request.id, text: result.text, words, flags });
        await append({
          type: "completed",
          id: request.id,
          text: result.text,
          words,
          flags,
          finishReason: result.finishReason,
          usage: result.usage,
        });
      } catch (error) {
        const code =
          error &&
          typeof error === "object" &&
          "code" in error &&
          [
            "timeout",
            "aborted",
            "empty",
            "truncated",
            "provider",
            "stream-mismatch",
          ].includes(String(error.code))
            ? String(error.code)
            : signal.aborted
              ? "aborted"
              : "provider";
        failure = { id: request.id, code };
        await append({ type: "failed", ...failure });
        break;
      }
    }
    const summary = {
      schemaVersion: 1,
      provenance: "LLM-generated fiction",
      status: failure ? "incomplete" : "awaiting-editorial-review",
      fingerprint: bundle.fingerprint,
      requested: 8,
      completed: completed.length,
      failure,
      contributions: completed,
    };
    await jsonFile(join(outputDir, "contributions.json"), summary);
    // This separate source-only score is suitable for the existing readers.
    // It contains no assignment labels, private circumstances or review tags.
    if (!failure)
      await jsonFile(
        join(outputDir, "score.json"),
        scoreSchema.parse({
          schemaVersion: 2,
          title:
            "Rehearsing We — fictional 8-person contribution pilot (unreviewed)",
          chunkPercent: 100,
          voices: completed.map(({ id, text }) => ({ id, name: id, text })),
        }),
      );
    await append({
      type: "finished",
      status: summary.status,
      completed: completed.length,
    });
    return summary;
  } finally {
    await journal.close();
  }
}
