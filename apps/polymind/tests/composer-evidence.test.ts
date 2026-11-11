import { describe, expect, it } from "vitest";
import {
  type EvidenceRecord,
  evidencePacket,
  fullPacket,
  packetTokens,
  parseEvidence,
  readerMessages,
  rotatingPacket,
  type Source,
} from "../src/composer-evidence.ts";

const sources: Source[] = [
  { id: "b", name: "Bee", text: "I want rain. Maybe later.", availableTo: 25 },
  { id: "a", name: "Ay", text: "🙂I refuse. A bright moon!", availableTo: 26 },
];

function raw(records: unknown[]) {
  return JSON.stringify({ records });
}

describe("composer evidence", () => {
  it("excludes future text from reader messages and rejects split surrogate boundaries", () => {
    const visible = readerMessages([
      { id: "a", name: "A", text: "visible FUTURE", availableTo: 7 },
    ]);
    expect(visible[1]?.content).toContain("visible");
    expect(visible[1]?.content).not.toContain("FUTURE");
    expect(() =>
      readerMessages([{ id: "a", name: "A", text: "🙂", availableTo: 1 }]),
    ).toThrow(/surrogate/u);
  });

  it("rejects invented, ambiguous, and future-only quotes", () => {
    const partialSource: Source = {
      id: "b",
      name: "Bee",
      text: "I want rain. Maybe later.",
      availableTo: 18,
    };
    expect(() =>
      parseEvidence(
        raw([
          {
            sourceId: "b",
            quote: "invented",
            kind: "experience",
            interpretation: "x",
          },
        ]),
        sources,
      ),
    ).toThrow(/not present/u);
    expect(() =>
      parseEvidence(
        raw([
          {
            sourceId: "b",
            quote: "I",
            kind: "experience",
            interpretation: "x",
          },
        ]),
        [{ id: "b", name: "B", text: "I I FUTURE", availableTo: 3 }],
      ),
    ).toThrow(/ambiguous/u);
    expect(() =>
      parseEvidence(
        raw([
          {
            sourceId: "b",
            quote: "later",
            kind: "experience",
            interpretation: "x",
          },
        ]),
        [partialSource],
      ),
    ).toThrow(/not present/u);
  });

  it("returns deterministic source-offset-kind ordering with UTF-16 offsets and stable IDs", () => {
    const input = raw([
      {
        sourceId: "b",
        quote: "Maybe later.",
        kind: "uncertainty",
        interpretation: "uncertain timing",
      },
      {
        sourceId: "a",
        quote: "I refuse.",
        kind: "refusal",
        interpretation: "declines",
      },
      { sourceId: "a", quote: "🙂", kind: "image", interpretation: "an image" },
    ]);
    const parsed = parseEvidence(input, sources);
    expect(
      parsed.map(({ sourceId, start, quote }) => [sourceId, start, quote]),
    ).toEqual([
      ["a", 0, "🙂"],
      ["a", 2, "I refuse."],
      ["b", 13, "Maybe later."],
    ]);
    expect(parseEvidence(input, sources).map((record) => record.id)).toEqual(
      parsed.map((record) => record.id),
    );
  });

  it("counts the complete rendered packet locally and keeps full packets unbounded", () => {
    const packet = fullPacket(sources);
    expect(packet.localTokens).toBe(packetTokens(packet.text));
    expect(packet.text).not.toContain('"provenance"');
    expect(packet.text.split("I want rain.")).toHaveLength(2);
    expect(packet.localTokens).toBeGreaterThan(0);
    expect(
      fullPacket([
        {
          id: "x",
          name: "X",
          text: "lots of words ".repeat(500),
          availableTo: 7000,
        },
      ]).localTokens,
    ).toBeGreaterThan(760);
  });

  it("keeps sentence excerpts whole, respects the complete budget, and reports exact deferred ranges", () => {
    const src = [
      { id: "v", name: "Voice", text: "One. Two. Three.", availableTo: 16 },
    ];
    const base = rotatingPacket(src, 0, 1000);
    const one = rotatingPacket(src, 0, base.localTokens - 1);
    expect(one.localTokens).toBeLessThanOrEqual(base.localTokens - 1);
    expect(one.deferred.length).toBeGreaterThan(0);
    expect(
      one.provenance.every(
        (span) => span.quote.endsWith(" ") || span.end === src[0]?.availableTo,
      ),
    ).toBe(true);
    const uncovered = [
      ...one.provenance.map((span) => [span.start, span.end]),
      ...one.deferred.map((span) => [span.start, span.end]),
    ];
    expect(uncovered).toContainEqual([0, 5]);
  });

  it("defers valid evidence excluded by budget and labels unextracted text as omitted", () => {
    const src: Source[] = [
      {
        id: "v",
        name: "Voice",
        text: "I want tea. I need quiet.",
        availableTo: 25,
      },
    ];
    const records: EvidenceRecord[] = [
      {
        schemaVersion: 1,
        id: "v:0:11:proposal",
        sourceId: "v",
        start: 0,
        end: 11,
        quote: "I want tea.",
        kind: "proposal",
        interpretation: "asks for tea",
      },
      {
        schemaVersion: 1,
        id: "v:12:25:condition",
        sourceId: "v",
        start: 12,
        end: 25,
        quote: "I need quiet.",
        kind: "condition",
        interpretation: "needs quiet",
      },
    ];
    const full = evidencePacket(src, records, 2000);
    const small = evidencePacket(src, records, full.localTokens - 1);
    expect(small.localTokens).toBeLessThanOrEqual(full.localTokens - 1);
    expect(small.deferred.length).toBeGreaterThan(0);
    expect(
      small.omitted.every(
        (range) => range.reason === "no extracted evidence record",
      ),
    ).toBe(true);
    expect(
      small.deferred.every((range) => range.reason.includes("budget")),
    ).toBe(true);
  });

  it("fails clearly when fixed packet metadata alone exceeds the budget", () => {
    expect(() => rotatingPacket(sources, 0, 0)).toThrow(/too small/u);
    expect(() => evidencePacket(sources, [], 0)).toThrow(/too small/u);
  });

  it("rotates the starting sentence as well as source priority", () => {
    const src = [
      { id: "v", name: "Voice", text: "One. Two. Three.", availableTo: 16 },
    ];
    expect(rotatingPacket(src, 0, 1000).provenance[0]?.quote).toBe("One. ");
    expect(rotatingPacket(src, 1, 1000).provenance[0]?.quote).toBe("Two. ");
    expect(rotatingPacket(src, 2, 1000).provenance[0]?.quote).toBe("Three.");
  });

  it("orders overlapping quotes independently of the reader's array order", () => {
    const source = [
      { id: "v", name: "Voice", text: "I want tea.", availableTo: 11 },
    ];
    const units = [
      {
        sourceId: "v",
        quote: "I want tea.",
        kind: "proposal",
        interpretation: "Wants tea.",
      },
      {
        sourceId: "v",
        quote: "I want",
        kind: "proposal",
        interpretation: "States a desire.",
      },
    ];
    const first = parseEvidence(raw(units), source);
    const second = parseEvidence(raw([...units].reverse()), source);
    expect(first).toEqual(second);
    expect(first.map(({ end }) => end)).toEqual([6, 11]);
    expect(evidencePacket(source, first, 1000)).toEqual(
      evidencePacket(source, [...second].reverse(), 1000),
    );
  });
});
