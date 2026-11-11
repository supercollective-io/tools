import { describe, expect, it } from "vitest";
import { measureFreshness } from "../src/natural-comparison-metrics.ts";

describe("natural comparison freshness", () => {
  it("retains superseded and unresolved waits rather than hiding them", () => {
    const result = measureFreshness(
      [
        {
          track: "a",
          participant: "p",
          cue: 1,
          scheduledMs: 0,
          savedAt: new Date(1000).toISOString(),
        },
        {
          track: "a",
          participant: "p",
          cue: 2,
          scheduledMs: 150000,
          savedAt: new Date(2000).toISOString(),
        },
        {
          track: "b",
          participant: "q",
          cue: 1,
          scheduledMs: 150000,
          savedAt: new Date(2000).toISOString(),
        },
      ],
      [{ at: 3500, revisions: { p: 2 } }],
    );
    expect(result.all).toMatchObject({
      count: 2,
      p95Ms: 2500,
      unresolved: 1,
      supersededBeforeRequest: 1,
    });
    expect(result.burst).toMatchObject({
      count: 1,
      p95Ms: 1500,
      unresolved: 1,
    });
    expect(result.staggered).toMatchObject({ count: 1, p95Ms: 2500 });
  });

  it("does not invent timestamps for historical arrivals", () => {
    const result = measureFreshness(
      [{ track: "a", participant: "p", cue: 1, scheduledMs: 0 }],
      [],
    );
    expect(result.all).toMatchObject({
      count: 0,
      p95Ms: null,
      missingTiming: 1,
      unresolved: 0,
    });
  });
});
