import { describe, expect, it } from "vitest";
import {
  type EvidenceRecord,
  evidencePacket,
  packetTokens,
  type Source,
} from "../src/composer-evidence.ts";
import {
  parseRelationships,
  type Relationship,
  relationshipMessages,
  relationshipPacket,
} from "../src/composer-relationships.ts";

const sources: Source[] = [
  {
    id: "a",
    name: "A",
    text: "I need the room to stay quiet. FUTURE NOTE",
    availableTo: 34,
  },
  {
    id: "b",
    name: "B",
    text: "We can keep the room quiet. OMITTED SOURCE TEXT",
    availableTo: 31,
  },
  {
    id: "c",
    name: "C",
    text: "A later note is not selected.",
    availableTo: 29,
  },
];

const records: EvidenceRecord[] = [
  {
    schemaVersion: 1,
    id: "a:0:30:condition",
    sourceId: "a",
    start: 0,
    end: 30,
    kind: "condition",
    quote: "I need the room to stay quiet.",
    interpretation: "quiet is a need",
  },
  {
    schemaVersion: 1,
    id: "b:0:27:proposal",
    sourceId: "b",
    start: 0,
    end: 27,
    kind: "proposal",
    quote: "We can keep the room quiet.",
    interpretation: "offers a quiet room",
  },
];

function basePacket(budget = 760) {
  return evidencePacket(sources, records, budget);
}

describe("composer relationships", () => {
  it("shows only selected records and labels exact quotes separately from interpretations", () => {
    const packet = basePacket();
    const messages = relationshipMessages(packet);
    const prompt = messages.map(({ content }) => content).join("\n");
    expect(prompt).toContain("exactQuote");
    expect(prompt).toContain("generatedInterpretation");
    expect(prompt).toContain("I need the room to stay quiet.");
    expect(prompt).not.toContain("FUTURE NOTE");
    expect(prompt).not.toContain("OMITTED SOURCE TEXT");
    expect(prompt).not.toContain("later note is not selected");
    expect(prompt).not.toContain("provenance");
    expect(prompt).not.toContain("assessment");
  });

  it("parses strict JSON, checks endpoints and returns deterministic ordering", () => {
    const packet = basePacket();
    const parsed = parseRelationships(
      JSON.stringify({
        relationships: [
          {
            from: 1,
            to: 0,
            kind: "qualification",
            interpretation: "offers a way to meet the stated need",
          },
          {
            from: 0,
            to: 1,
            kind: "support",
            interpretation: "both explicitly refer to quiet",
          },
        ],
      }),
      packet,
    );
    expect(parsed.map(({ from, to, kind }) => [from, to, kind])).toEqual([
      [0, 1, "support"],
      [1, 0, "qualification"],
    ]);
    expect(() =>
      parseRelationships(
        '{"relationships":[{"from":0,"to":2,"kind":"support","interpretation":"x"}]}',
        packet,
      ),
    ).toThrow(/endpoint/u);
    expect(() =>
      parseRelationships(
        '{"relationships":[{"from":0,"to":0,"kind":"support","interpretation":"x"}]}',
        packet,
      ),
    ).toThrow(/Self/u);
    expect(() =>
      parseRelationships(
        '{"relationships":[{"from":0,"to":1,"kind":"support","interpretation":"x"},{"from":0,"to":1,"kind":"support","interpretation":"y"}]}',
        packet,
      ),
    ).toThrow(/Duplicate/u);
    expect(() =>
      parseRelationships(
        '{"relationships":[{"from":0,"to":1,"kind":"contradiction","interpretation":"x"}]}',
        packet,
      ),
    ).toThrow(/schema/u);
    expect(() =>
      parseRelationships('{"relationships":[],"score":1}', packet),
    ).toThrow(/schema/u);
    expect(() => parseRelationships("not json", packet)).toThrow(
      /valid raw JSON/u,
    );
  });

  it("adds whole edges within budget while keeping the selected node array unchanged", () => {
    const base = basePacket(1000);
    const selectedRecords = (text: string) =>
      (JSON.parse(text) as { records: unknown[] }).records;
    const edges: Relationship[] = [
      {
        from: 0,
        to: 1,
        kind: "support",
        interpretation: "quiet appears in both",
      },
      {
        from: 1,
        to: 0,
        kind: "qualification",
        interpretation: "the offer addresses the expressed need",
      },
      {
        from: 0,
        to: 1,
        kind: "opposition",
        interpretation: "a long basis that will not fit ".repeat(80),
      },
    ];
    const enriched = relationshipPacket(base, edges, base.localTokens + 45);
    expect(selectedRecords(enriched.text)).toEqual(selectedRecords(base.text));
    expect(enriched.localTokens).toBe(packetTokens(enriched.text));
    expect(enriched.localTokens).toBeLessThanOrEqual(base.localTokens + 45);
    expect(enriched.relationships.length).toBeGreaterThan(0);
    expect(enriched.deferredRelationships.length).toBeGreaterThan(0);
    expect(enriched.provenance).toBe(base.provenance);
    expect(enriched.omitted).toBe(base.omitted);
    expect(enriched.deferred).toBe(base.deferred);
    const body = JSON.parse(enriched.text) as {
      relationshipLegend: string[];
      relationships: unknown[][];
    };
    expect(body.relationshipLegend[0]).toContain("zero-based");
    expect(body.relationshipLegend[3]).toContain("generated basis");
    expect(body.relationships.every((row) => row.length === 4)).toBe(true);
  });

  it("rejects a base packet that already exceeds the requested budget", () => {
    const base = basePacket(1000);
    expect(() => relationshipPacket(base, [], base.localTokens - 1)).toThrow(
      /Base evidence packet exceeds/u,
    );
  });

  it("validates JSON structure only and does not claim a parsed edge is grounded", () => {
    const packet = basePacket();
    const edge = parseRelationships(
      '{"relationships":[{"from":0,"to":1,"kind":"opposition","interpretation":"unsubstantiated claim"}]}',
      packet,
    );
    expect(edge).toEqual([
      {
        from: 0,
        to: 1,
        kind: "opposition",
        interpretation: "unsubstantiated claim",
      },
    ]);
  });
});
