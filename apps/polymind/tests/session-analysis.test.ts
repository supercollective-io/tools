import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Generate } from "../src/models.ts";
import {
  analysisV2Messages,
  personalAnalysis,
  publicAnalysis,
  resolveAnalysisSources,
  validateAnalysisV2,
} from "../src/session/analysis.ts";
import {
  type AnalysisFinding,
  type AnalysisV2,
  analysisV2Schema,
  digest,
  type Operation,
  operationConfigSchema,
  personalAnalysisV2Schema,
  type Snapshot,
} from "../src/session/contracts.ts";
import {
  modelExecutor,
  safeAnalysisFailure,
  validateResult,
} from "../src/session/jobs.ts";
import { SessionStore } from "../src/session/store.ts";

function fixture() {
  const roundId = randomUUID();
  const snapshot: Snapshot = {
    schemaVersion: 1,
    id: randomUUID(),
    sessionId: randomUUID(),
    roundId,
    createdAt: new Date().toISOString(),
    eligible: [],
    contributions: [
      { id: "source-a", text: "I want a safe crossing near the library." },
      {
        id: "source-b",
        text: "A safe crossing matters, but preserving bus access matters too.",
      },
      { id: "source-c", text: "How could we keep the library open later?" },
    ].map((source) => ({
      ...source,
      participantId: randomUUID(),
      roundId,
      prompt: "What would make our neighbourhood easier to live in?",
      revision: 1,
      confirmed: true,
      matching: false,
      source: "typed",
      savedAt: new Date().toISOString(),
    })),
  };
  const op: Operation = {
    id: randomUUID(),
    snapshotId: snapshot.id,
    snapshotHash: "synthetic-hash",
    kind: "analysis",
    state: "queued",
    config: {
      promptVersion: "analysis-v2",
      maxInputCharacters: 100000,
      model: {
        provider: "ollama",
        model: "test-double",
        maxOutputTokens: 2000,
        timeoutMs: 1000,
      },
    },
    createdAt: new Date().toISOString(),
    published: false,
  };
  return { snapshot, op };
}
function finding(patch: Partial<AnalysisFinding> = {}): AnalysisFinding {
  return {
    id: "safe-crossing",
    title: "A safer crossing",
    text: "Make crossing near the library safer.",
    sourceRefs: ["source-a", "source-b"],
    evidence: [
      { sourceRef: "source-a", text: "a safe crossing near the library" },
      { sourceRef: "source-b", text: "preserving bus access matters too" },
    ],
    ...patch,
  };
}
function analysis(patch: Partial<AnalysisV2> = {}): AnalysisV2 {
  return {
    version: "analysis-v2",
    commonGround: [finding()],
    differences: [],
    questions: [],
    otherConcerns: [],
    ...patch,
  };
}

describe("analysis-v2 provenance and concise contract", () => {
  it("accepts exact frozen references and excerpts, including empty sections", () => {
    const { op, snapshot } = fixture();
    expect(validateResult(op, snapshot, analysis())).toEqual(analysis());
    const empty = analysis({ commonGround: [] });
    expect(validateAnalysisV2(empty, snapshot)).toEqual(empty);
    expect(operationConfigSchema.parse(op.config).autoPublish).toBe(false);
  });

  it("rejects invented references, duplicate references and duplicate finding IDs across sections", () => {
    const { snapshot } = fixture();
    expect(() =>
      validateAnalysisV2(
        analysis({
          commonGround: [finding({ sourceRefs: ["unknown", "source-a"] })],
        }),
        snapshot,
      ),
    ).toThrow("Unknown source");
    expect(() =>
      validateAnalysisV2(
        analysis({
          commonGround: [finding({ sourceRefs: ["source-a", "source-a"] })],
        }),
        snapshot,
      ),
    ).toThrow("Duplicate source");
    expect(() =>
      validateAnalysisV2(
        analysis({
          questions: [finding({ sourceRefs: ["source-c"], evidence: [] })],
        }),
        snapshot,
      ),
    ).toThrow("Duplicate finding");
  });

  it("rejects fabricated quotes, quotes from another revision and quotes outside a finding's references", () => {
    const { snapshot } = fixture();
    for (const evidence of [
      { sourceRef: "source-a", text: "I want a railway station." },
      {
        sourceRef: "source-a",
        text: "I want a safer crossing near the library.",
      },
      { sourceRef: "source-c", text: "keep the library open later" },
      { sourceRef: "unknown", text: "a safe crossing" },
    ])
      expect(() =>
        validateAnalysisV2(
          analysis({ commonGround: [finding({ evidence: [evidence] })] }),
          snapshot,
        ),
      ).toThrow(/Evidence/);
  });

  it("rejects private source or participant identifiers echoed into public finding fields", () => {
    const { snapshot } = fixture();
    const source = snapshot.contributions[0];
    if (!source) throw new Error("Missing synthetic source.");
    for (const identifier of [source.id, source.participantId, "c1", "p1"]) {
      for (const patch of [
        { id: identifier },
        { title: `Source ${identifier}` },
        { text: `A perspective from ${identifier}.` },
      ])
        expect(() =>
          validateAnalysisV2(
            analysis({ commonGround: [finding(patch)] }),
            snapshot,
          ),
        ).toThrow("private source identifiers");
    }
  });

  it("requires two source IDs for relational findings, verifies distinct people, and allows isolated concerns", () => {
    const { snapshot } = fixture();
    const one = finding({ sourceRefs: ["source-a"], evidence: [] });
    expect(() =>
      validateAnalysisV2(analysis({ commonGround: [one] }), snapshot),
    ).toThrow("Too small");
    expect(() =>
      validateAnalysisV2(
        analysis({
          commonGround: [],
          differences: [{ ...one, distinction: "emphasis" }],
        }),
        snapshot,
      ),
    ).toThrow("Too small");
    const [first, second] = snapshot.contributions;
    if (!first || !second) throw new Error("Missing synthetic contributors.");
    second.participantId = first.participantId;
    expect(() => validateAnalysisV2(analysis(), snapshot)).toThrow(
      "distinct contributors",
    );
    expect(
      validateAnalysisV2(
        analysis({ commonGround: [], otherConcerns: [one] }),
        snapshot,
      ).otherConcerns,
    ).toEqual([one]);
  });

  it("enforces every section, field and excerpt limit without truncating", () => {
    const { snapshot } = fixture();
    const tooMany = (amount: number) =>
      Array.from({ length: amount }, (_, i) => finding({ id: `finding-${i}` }));
    const invalid: unknown[] = [
      analysis({ commonGround: tooMany(5) }),
      analysis({
        differences: tooMany(4).map((f) => ({ ...f, distinction: "tension" })),
      }),
      analysis({ questions: tooMany(4) }),
      analysis({ otherConcerns: tooMany(3) }),
      ...[
        { id: "x".repeat(81) },
        { title: "x".repeat(61) },
        { text: "x".repeat(181) },
        { text: "   " },
        { sourceRefs: [] },
        { sourceRefs: Array.from({ length: 181 }, (_, i) => `source-${i}`) },
        {
          evidence: Array.from({ length: 3 }, () => ({
            sourceRef: "source-a",
            text: "safe",
          })),
        },
        { evidence: [{ sourceRef: "source-a", text: "x".repeat(161) }] },
      ].map((patch) => analysis({ commonGround: [finding(patch)] })),
      analysis({
        differences: [{ ...finding(), distinction: "opposition" as "tension" }],
      }),
    ];
    for (const value of invalid)
      expect(() => validateAnalysisV2(value, snapshot)).toThrow();
    const boundary = analysis({
      commonGround: [finding({ title: "x".repeat(60), text: "x".repeat(180) })],
    });
    expect(validateAnalysisV2(boundary, snapshot)).toEqual(boundary);
  });

  it("keeps bounded-v1 parsing separate and preserves its saved shape", () => {
    const { op, snapshot } = fixture();
    const legacyOp: Operation = {
      ...op,
      config: { ...op.config, promptVersion: "bounded-v1" },
    };
    const legacy = {
      themes: [{ text: "Access", sourceRefs: ["source-a"] }],
      similarities: [],
      tensions: [],
      conflicts: [],
      outlyingConcerns: [],
      questions: [],
    };
    expect(validateResult(legacyOp, snapshot, legacy)).toEqual(legacy);
    expect(() => validateResult(op, snapshot, legacy)).toThrow();
    expect(() => validateResult(legacyOp, snapshot, analysis())).toThrow();
  });

  it("reuses a legacy operation whose persisted config and hash predate autoPublish", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "polymind-analysis-legacy-"),
    );
    const store = new SessionStore(join(directory, "session.sqlite"));
    try {
      const session = store.createSession("Synthetic legacy event", 2);
      const round = store.createRound(
        session.id,
        "What could we change?",
        "bounded",
      );
      const participant = store.join(
        session.id,
        "Fictional participant",
      ).participant;
      store.revise(session.id, participant.id, {
        requestId: randomUUID(),
        roundId: round.id,
        expectedRevision: 0,
        text: "A safer crossing.",
        confirmed: true,
        matching: false,
        source: "typed",
      });
      const snapshot = store.freeze(round.id);
      const { op } = fixture();
      const parsed = operationConfigSchema.parse({
        ...op.config,
        promptVersion: "bounded-v1",
      });
      const { autoPublish: _, ...legacyConfig } = parsed;
      const legacy: Operation = {
        ...op,
        snapshotId: snapshot.id,
        snapshotHash: store.snapshot(snapshot.id).hash,
        config: legacyConfig,
      };
      const key = digest(
        JSON.stringify({
          hash: legacy.snapshotHash,
          kind: legacy.kind,
          config: legacyConfig,
        }),
      );
      store.db
        .prepare("INSERT INTO operations VALUES (?,?,?,?)")
        .run(legacy.id, snapshot.id, key, JSON.stringify(legacy));
      expect(store.enqueue(snapshot.id, "analysis", legacyConfig).id).toBe(
        legacy.id,
      );
      expect(
        store.enqueue(snapshot.id, "analysis", {
          ...legacyConfig,
          autoPublish: false,
        }).id,
      ).toBe(legacy.id);
      expect(store.operations(session.id)).toHaveLength(1);
    } finally {
      store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("analysis-v2 projections and model request", () => {
  it("reports only bounded schema and provider diagnostics", () => {
    const invalid = analysisV2Schema.safeParse(
      analysis({
        commonGround: [finding({ title: "secret-value".repeat(8) })],
      }),
    );
    expect(invalid.success).toBe(false);
    if (invalid.success) throw new Error("Expected a schema failure.");
    const schemaMessage = safeAnalysisFailure(invalid.error);
    expect(schemaMessage).toContain("too_big");
    expect(schemaMessage).toContain("commonGround[0].title");
    expect(schemaMessage).not.toContain("secret-value");

    const providerError = Object.assign(
      new Error("raw key and response body must never be shown"),
      { code: "provider", status: 400 },
    );
    expect(safeAnalysisFailure(providerError)).toBe(
      "The provider rejected the analysis request (HTTP 400). Check the selected model and request configuration.",
    );
    expect(safeAnalysisFailure(providerError)).not.toContain("raw key");
    expect(safeAnalysisFailure(new SyntaxError("raw model text"))).toContain(
      "not valid JSON",
    );
    expect(
      safeAnalysisFailure(new Error("untrusted provider body")),
    ).not.toContain("untrusted provider body");
    expect(
      safeAnalysisFailure(
        new Error("Relational findings require distinct contributors."),
      ),
    ).toContain("two distinct contributors");
  });

  it("resolves compact source and evidence aliases exactly, rejects unknown aliases and preserves prose", () => {
    const { snapshot } = fixture();
    const compact = analysis({
      commonGround: [
        finding({
          sourceRefs: ["c1", "c2"],
          evidence: [
            { sourceRef: "c2", text: "preserving bus access matters too" },
          ],
        }),
      ],
    });
    const resolved = resolveAnalysisSources(compact, snapshot);
    expect(resolved.commonGround[0]).toEqual({
      ...compact.commonGround[0],
      sourceRefs: ["source-a", "source-b"],
      evidence: [
        { sourceRef: "source-b", text: "preserving bus access matters too" },
      ],
    });
    expect(validateAnalysisV2(resolved, snapshot)).toEqual(resolved);
    expect(compact.commonGround[0]?.sourceRefs).toEqual(["c1", "c2"]);
    for (const bad of [
      analysis({
        commonGround: [finding({ sourceRefs: ["c1", "c999"], evidence: [] })],
      }),
      analysis({
        commonGround: [
          finding({
            sourceRefs: ["c1", "c2"],
            evidence: [{ sourceRef: "p1", text: "safe crossing" }],
          }),
        ],
      }),
      { ...compact, extra: true },
      null,
    ])
      expect(() => resolveAnalysisSources(bad, snapshot)).toThrow();
    const [first, second] = snapshot.contributions;
    if (!first || !second) throw new Error("Missing synthetic sources.");
    second.participantId = first.participantId;
    const inputs = JSON.parse(
      analysisV2Messages(snapshot)[1]?.content ?? "{}",
    ).contributions;
    expect(inputs[0].participantId).toBe("p1");
    expect(inputs[1].participantId).toBe("p1");
    expect(inputs[2].participantId).toBe("p2");
  });

  it("publishes a concise overview and derives personal views solely from the existing references", () => {
    const { snapshot } = fixture();
    const result = validateAnalysisV2(
      analysis({
        differences: [
          { ...finding({ id: "bus-access" }), distinction: "emphasis" },
        ],
        questions: [
          finding({
            id: "library-hours",
            title: "Later opening",
            text: "Could the library open later?",
            sourceRefs: ["source-c"],
            evidence: [
              { sourceRef: "source-c", text: "keep the library open later" },
            ],
          }),
        ],
      }),
      snapshot,
    );
    const publicView = publicAnalysis(result);
    expect(publicView.commonGround).toEqual([
      {
        id: "safe-crossing",
        title: "A safer crossing",
        text: "Make crossing near the library safer.",
      },
    ]);
    expect(publicView.differences[0]?.distinction).toBe("emphasis");
    expect(JSON.stringify(publicView)).not.toMatch(
      /sourceRefs|evidence|source-a|source-b|source-c/,
    );
    const personal = personalAnalysis(result, { id: "source-a" });
    expect(personalAnalysisV2Schema.parse(personal)).toEqual(personal);
    expect(personal.commonGround[0]?.sourceRefs).toEqual(["source-a"]);
    expect(personal.commonGround[0]?.evidence).toEqual([
      result.commonGround[0]?.evidence?.[0],
    ]);
    expect(personal.differences[0]?.distinction).toBe("emphasis");
    expect(personal.questions).toEqual([]);
    expect(JSON.stringify(personal)).not.toMatch(
      /source-b|source-c|preserving bus access/,
    );
    expect(personalAnalysis(result, { id: "unknown" }).commonGround).toEqual(
      [],
    );
    expect(result.commonGround[0]?.sourceRefs).toEqual([
      "source-a",
      "source-b",
    ]);
  });

  it("sends all complete contributions in one request with the actual round question and no second personal call", async () => {
    const { op, snapshot } = fixture();
    const compact = analysis({
      commonGround: [
        finding({
          sourceRefs: ["c1", "c2"],
          evidence: [
            { sourceRef: "c1", text: "a safe crossing near the library" },
            { sourceRef: "c2", text: "preserving bus access matters too" },
          ],
        }),
      ],
    });
    const model = vi
      .fn<Generate>()
      .mockResolvedValue({ text: JSON.stringify(compact) });
    const execute = modelExecutor("/unused-synthetic-directory", model);
    const openAiOp: Operation = {
      ...op,
      config: {
        ...op.config,
        model: { ...op.config.model, provider: "openai" },
      },
    };
    expect(
      await execute(openAiOp, snapshot, new AbortController().signal, () => {}),
    ).toEqual(analysis());
    expect(model).toHaveBeenCalledTimes(1);
    const request = model.mock.calls[0]?.[0];
    if (!request) throw new Error("Missing synthetic model request.");
    const messages = request.messages;
    expect(messages).toEqual(analysisV2Messages(snapshot));
    const [system, user] = messages;
    if (!system || !user) throw new Error("Missing analysis messages.");
    const body = JSON.parse(user.content);
    expect(body.contributions).toHaveLength(snapshot.contributions.length);
    for (const [index, contribution] of snapshot.contributions.entries())
      expect(body.contributions).toContainEqual({
        id: `c${index + 1}`,
        participantId: `p${index + 1}`,
        prompt: contribution.prompt,
        text: contribution.text,
      });
    expect(user.content).not.toContain(
      snapshot.contributions[0]?.participantId,
    );
    expect(user.content).not.toContain("source-a");
    expect(user.content).toContain(snapshot.contributions[0]?.prompt);
    expect(system.content).toContain("Never manufacture conflict");
    expect(system.content).toContain("concrete shared intentions");
    expect(system.content).toContain(
      "cite at least two source IDs that belong to two different participant aliases",
    );
    expect(system.content).toContain(
      "If two distinct contributors do not support a relational finding, omit it.",
    );
    expect(system.content).toContain(
      "Each commonGround or differences finding needs 2–180 unique exact supporting source IDs from two distinct participant aliases.",
    );
    expect(system.content).toContain(
      "Evidence must always be an array with up to two excerpts of at most 160 characters each (use [] when no excerpt is included)",
    );
    expect(system.content).not.toContain(
      "Each finding needs 1–180 unique exact supporting source IDs.",
    );
    expect(request.responseFormat).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "polymind_analysis_v2",
        strict: true,
        schema: {
          properties: {
            commonGround: { type: "array", maxItems: 4 },
            differences: { type: "array", maxItems: 3 },
            questions: { type: "array", maxItems: 3 },
            otherConcerns: { type: "array", maxItems: 2 },
          },
        },
      },
    });
    expect(JSON.stringify(request.responseFormat)).toContain('"minItems":2');
    expect(JSON.stringify(request.responseFormat)).not.toContain("uniqueItems");
    personalAnalysis(analysis(), { id: "source-a" });
    expect(model).toHaveBeenCalledTimes(1);
  });
});
