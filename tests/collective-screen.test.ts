import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runScreen, type ScreenPlan } from "../src/collective-screen.ts";
import type { Generate } from "../src/models.ts";

const config = {
  provider: "ollama" as const,
  model: "test",
  maxOutputTokens: 40,
  timeoutMs: 1000,
};
const plan: ScreenPlan = {
  model: config,
  concurrency: 2,
  repetitions: 1,
  datasets: [
    {
      id: "d1",
      invitation: "write",
      contributions: [{ id: "c1", text: "voice" }],
    },
  ],
  variants: [
    {
      id: "v1",
      stages: [
        { instructions: "plan" },
        { instructions: "compose", includePrevious: true },
      ],
    },
  ],
};
const firstDataset = plan.datasets[0];
const firstVariant = plan.variants[0];
if (!firstDataset || !firstVariant) throw new Error("Test plan is incomplete.");
const dirs: string[] = [];
async function output() {
  const dir = await mkdtemp(join(tmpdir(), "collective-screen-"));
  dirs.push(dir);
  return join(dir, "run");
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
const writer: Generate = async (request, onToken) => {
  const msg = JSON.parse(request.messages.at(1)?.content ?? "{}") as {
    contributions: { id: string; text: string }[];
    previousStageText?: string;
  };
  const text = msg.previousStageText ? "final passage" : "a plan";
  await onToken(text);
  return { text };
};

describe("runScreen", () => {
  it("uses explicit model overrides and keeps alternative passages and their history", async () => {
    const out = await output();
    const override = {
      ...config,
      model: "alternative",
      reasoningEffort: "medium" as const,
    };
    let calls = 0;
    const fake: Generate = async (request, onToken) => {
      expect(request.config).toEqual(override);
      const payload = JSON.parse(request.messages[1]?.content ?? "{}");
      expect(payload.contributions).toEqual(firstDataset.contributions);
      expect(payload.previousStages ?? []).toEqual(
        Array.from({ length: calls }, (_, stage) => ({
          stage,
          text: `reading ${stage + 1}`,
        })),
      );
      const text = `reading ${++calls}`;
      await onToken(text);
      return { text };
    };
    const result = await runScreen(
      {
        ...plan,
        variants: [
          {
            id: "alternatives",
            model: override,
            stages: [
              { instructions: "first", retainAsCandidate: true },
              {
                instructions: "second",
                includeHistory: true,
                retainAsCandidate: true,
              },
              { instructions: "third", includeHistory: true },
            ],
          },
        ],
      },
      out,
      fake,
    );
    expect(result[0]?.candidates?.map((item) => item.text)).toEqual([
      "reading 1",
      "reading 2",
      "reading 3",
    ]);
    expect(result[0]?.finalText).toBe("reading 3");
    const reading = await readFile(join(out, "reading-copy.txt"), "utf8");
    for (const text of ["reading 1", "reading 2", "reading 3"])
      expect(reading).toContain(text);
  });

  it("retains earlier alternatives when a later branch fails", async () => {
    const out = await output();
    let calls = 0;
    const fake: Generate = async (_request, onToken) => {
      if (++calls > 1) throw new Error("private failure");
      await onToken("first candidate");
      return { text: "first candidate" };
    };
    const result = await runScreen(
      {
        ...plan,
        variants: [
          {
            id: "alternatives",
            stages: [
              { instructions: "first", retainAsCandidate: true },
              { instructions: "second", includeHistory: true },
            ],
          },
        ],
      },
      out,
      fake,
    );
    expect(result[0]?.status).toBe("failed");
    expect(result[0]?.candidates?.[0]?.text).toBe("first candidate");
    expect(await readFile(join(out, "reading-copy.txt"), "utf8")).toContain(
      "(job failed)",
    );
  });

  it("runs bounded jobs with sequential stages, sanitises sources and hides intermediates from the reading pack", async () => {
    const out = await output();
    let active = 0;
    let peak = 0;
    const many = {
      ...plan,
      concurrency: 2,
      datasets: [firstDataset, { ...firstDataset, id: "d2" }],
      variants: [firstVariant],
    };
    const fake: Generate = async (request, onToken) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const messages = request.messages;
      const payload = JSON.parse(messages.at(1)?.content ?? "{}") as Record<
        string,
        unknown
      >;
      expect((payload.contributions as object[])[0]).toEqual({
        id: "c1",
        text: "voice",
      });
      const text = payload.previousStageText ? "final passage" : "a plan";
      await onToken(text);
      active--;
      return { text };
    };
    const outcomes = await runScreen(many, out, fake);
    expect(peak).toBe(2);
    expect(outcomes).toHaveLength(2);
    expect(await readFile(join(out, "reading-copy.txt"), "utf8")).not.toContain(
      "a plan",
    );
    expect(await readFile(join(out, "reading-copy.txt"), "utf8")).toContain(
      "final passage",
    );
    expect(await readFile(join(out, "requests.jsonl"), "utf8")).toContain(
      '"prefix":"a plan"',
    );
    expect(await readFile(join(out, "key.json"), "utf8")).toContain(
      '"variantId": "v1"',
    );
  });

  it("isolates failed jobs and does not save raw errors", async () => {
    const out = await output();
    const many = {
      ...plan,
      concurrency: 1,
      datasets: [firstDataset, { ...firstDataset, id: "d2" }],
      variants: [firstVariant],
    };
    let n = 0;
    const fake: Generate = async (_request, onToken) => {
      n++;
      if (n === 1) {
        await onToken("partial prefix");
        throw new Error("secret provider response");
      }
      await onToken("ok");
      return { text: "ok" };
    };
    const outcomes = await runScreen(many, out, fake);
    expect(outcomes.map((item) => item.status)).toEqual([
      "failed",
      "completed",
    ]);
    expect(await readFile(join(out, "results.jsonl"), "utf8")).not.toContain(
      "secret provider response",
    );
    expect(await readFile(join(out, "requests.jsonl"), "utf8")).toContain(
      "partial prefix",
    );
  });

  it("stops queued work on abort and rejects existing output directories", async () => {
    const out = await output();
    const controller = new AbortController();
    const many = {
      ...plan,
      concurrency: 1,
      datasets: [firstDataset, { ...firstDataset, id: "d2" }],
      variants: [firstVariant],
    };
    const fake: Generate = async (_request, onToken) => {
      controller.abort();
      await onToken("partial");
      return { text: "partial" };
    };
    const outcomes = await runScreen(many, out, fake, controller.signal);
    expect(outcomes.map((item) => item.status)).toEqual([
      "aborted",
      "not_dispatched",
    ]);
    await expect(runScreen(plan, out, writer)).rejects.toThrow();
  });

  it("rejects mismatched streamed text", async () => {
    const out = await output();
    const fake: Generate = async () => ({ text: "different" });
    const result = await runScreen(plan, out, fake);
    expect(result[0]?.status).toBe("failed");
  });

  it("does not accept a final stage returned after cancellation", async () => {
    const controller = new AbortController();
    const fake: Generate = async (_request, onToken) => {
      await onToken("finished after cancellation");
      controller.abort();
      return { text: "finished after cancellation" };
    };
    const result = await runScreen(
      {
        ...plan,
        variants: [{ id: "single", stages: [{ instructions: "compose" }] }],
      },
      await output(),
      fake,
      controller.signal,
    );
    expect(result[0]?.status).toBe("aborted");
    expect(result[0]?.finalText).toBeUndefined();
  });
});
