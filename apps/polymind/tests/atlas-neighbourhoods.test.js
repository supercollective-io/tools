import { expect, it } from "vitest";
import { atlasNeighbourhoods } from "../src/web/session-atlas.js";

it("finds dense neighbourhoods across a weak bridge and leaves isolated text neutral", () => {
  const nodes = Array.from({ length: 7 }, (_, i) => ({ id: `c${i + 1}` }));
  const edge = (a, b, similarity = 1) => ({
    source: `c${a}`,
    target: `c${b}`,
    similarity,
  });
  const links = [
    edge(1, 2),
    edge(1, 3),
    edge(2, 3),
    edge(4, 5),
    edge(4, 6),
    edge(5, 6),
    edge(3, 4, 0.1),
  ];
  const result = atlasNeighbourhoods(nodes, links);
  expect(result.get("c1")).toBe(result.get("c3"));
  expect(result.get("c4")).toBe(result.get("c6"));
  expect(result.get("c1")).not.toBe(result.get("c4"));
  expect(result.has("c7")).toBe(false);
  expect(
    atlasNeighbourhoods([...nodes].reverse(), [...links].reverse()),
  ).toEqual(result);
  expect(atlasNeighbourhoods(nodes, []).size).toBe(0);
});
