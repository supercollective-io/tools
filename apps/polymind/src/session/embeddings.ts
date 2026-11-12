import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { digest } from "./contracts.ts";

const vectorsSchema = z.array(z.array(z.number().finite()).min(1));
export function validateVectors(value: unknown, count: number): number[][] {
  const vectors = vectorsSchema.parse(value);
  const dimensions = vectors[0]?.length;
  if (
    vectors.length !== count ||
    vectors.some((v) => v.length !== dimensions || !v.some((n) => n !== 0))
  )
    throw new Error("Invalid embedding coverage or dimensions.");
  return vectors;
}

/** Private, content-addressed cache shared by atlas and matching; no source text stored. */
export async function embedTexts(
  directory: string,
  texts: string[],
  model: string,
  signal: AbortSignal,
): Promise<number[][]> {
  const fingerprint = digest(JSON.stringify({ model, texts }));
  const folder = join(directory, "embeddings");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const path = join(folder, `${fingerprint}.json`);
  try {
    const cached = JSON.parse(await readFile(path, "utf8"));
    if (cached.fingerprint !== fingerprint || cached.model !== model)
      throw new Error("Embedding provenance mismatch.");
    return validateVectors(cached.vectors, texts.length);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!texts.length) return [];
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!response.ok) throw new Error("Embedding provider failed.");
  const payload = z
    .object({
      data: z.array(
        z.object({
          index: z.number().int().nonnegative(),
          embedding: z.array(z.number().finite()),
        }),
      ),
    })
    .parse(await response.json());
  const ordered = payload.data.sort((a, b) => a.index - b.index);
  if (ordered.some((v, i) => v.index !== i))
    throw new Error("Embedding coverage mismatch.");
  const vectors = validateVectors(
    ordered.map((v) => v.embedding),
    texts.length,
  );
  signal.throwIfAborted();
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      JSON.stringify({ fingerprint, model, vectors }),
      { mode: 0o600, flag: "wx" },
    );
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return vectors;
}
