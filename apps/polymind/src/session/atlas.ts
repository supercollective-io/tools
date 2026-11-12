import { z } from "zod";
import type { AnalysisV2, Snapshot } from "./contracts.ts";
import { validateVectors } from "./embeddings.ts";

export const atlasSchema = z.strictObject({
  version: z.literal("atlas-v1"),
  snapshotHash: z.string(),
  model: z.string(),
  threshold: z.literal(0.35),
  neighbours: z.literal(3),
  nodes: z.array(z.strictObject({ id: z.string() })),
  links: z.array(
    z.strictObject({
      source: z.string(),
      target: z.string(),
      similarity: z.number().finite().min(-1).max(1),
    }),
  ),
});
export type Atlas = z.infer<typeof atlasSchema>;

export function buildAtlas(
  snapshot: Snapshot,
  snapshotHash: string,
  model: string,
  input: number[][],
): Atlas {
  const vectors = validateVectors(input, snapshot.contributions.length).map(
    (v) => {
      const norm = Math.hypot(...v);
      if (!Number.isFinite(norm))
        throw new Error("Invalid embedding magnitude.");
      return v.map((n) => n / norm);
    },
  );
  const links = new Map<string, Atlas["links"][number]>();
  for (let i = 0; i < vectors.length; i++) {
    const neighbours = vectors
      .map((v, j) => ({
        j,
        similarity: Math.max(
          -1,
          Math.min(
            1,
            v.reduce((sum, n, k) => sum + n * (vectors[i]?.[k] ?? 0), 0),
          ),
        ),
      }))
      .filter((v) => v.j !== i && v.similarity >= 0.35)
      .sort((a, b) => b.similarity - a.similarity || a.j - b.j)
      .slice(0, 3);
    for (const { j, similarity } of neighbours) {
      const a = Math.min(i, j),
        b = Math.max(i, j);
      const source = snapshot.contributions[a],
        target = snapshot.contributions[b];
      if (!source || !target) throw new Error("Missing atlas source.");
      links.set(`${a}:${b}`, {
        source: source.id,
        target: target.id,
        similarity,
      });
    }
  }
  return {
    version: "atlas-v1",
    snapshotHash,
    model,
    threshold: 0.35,
    neighbours: 3,
    nodes: snapshot.contributions.map((c) => ({ id: c.id })),
    links: [...links.values()],
  };
}

export function validateAtlas(
  value: unknown,
  snapshot: Snapshot,
  hash: string,
  model?: string,
): Atlas {
  const atlas = atlasSchema.parse(value);
  const ids = new Set(snapshot.contributions.map((c) => c.id));
  if (
    atlas.snapshotHash !== hash ||
    atlas.model !== model ||
    atlas.nodes.length !== ids.size ||
    new Set(atlas.nodes.map((n) => n.id)).size !== ids.size ||
    atlas.nodes.some((n) => !ids.has(n.id))
  )
    throw new Error("Atlas provenance mismatch.");
  const seen = new Set<string>();
  for (const link of atlas.links) {
    const key = [link.source, link.target].sort().join("\n");
    if (
      !ids.has(link.source) ||
      !ids.has(link.target) ||
      link.source === link.target ||
      seen.has(key) ||
      link.similarity < atlas.threshold
    )
      throw new Error("Invalid atlas edge.");
    seen.add(key);
  }
  if (atlas.links.length > atlas.nodes.length * 3)
    throw new Error("Atlas edge budget exceeded.");
  return atlas;
}

/** Only called after explicit atlas publication; never include private participant IDs. */
export function publicAtlas(
  atlas: Atlas,
  snapshot: Snapshot,
  analysis: AnalysisV2,
) {
  const aliases = new Map(
    snapshot.contributions.map((c, i) => [c.id, `c${i + 1}`]),
  );
  return {
    model: atlas.model,
    nodes: snapshot.contributions.map((c) => ({
      id: aliases.get(c.id) as string,
      text: c.text,
    })),
    links: atlas.links.map((e) => ({
      ...e,
      source: aliases.get(e.source) as string,
      target: aliases.get(e.target) as string,
    })),
    findings: (
      ["commonGround", "differences", "questions", "otherConcerns"] as const
    ).flatMap((category) =>
      analysis[category].map((f) => ({
        id: f.id,
        title: f.title,
        text: f.text,
        category,
        sourceRefs: f.sourceRefs.map((ref) => aliases.get(ref) as string),
      })),
    ),
  };
}
