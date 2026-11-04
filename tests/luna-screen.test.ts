import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { screeningOrder } from "../src/luna-screen.ts";
import { configSchema } from "../src/schema.ts";

it("changes only the composer model and alternates paired model order", async () => {
  const read = async (model: string) =>
    configSchema.parse(
      JSON.parse(await readFile(`examples/composer-${model}.json`, "utf8")),
    );
  const luna = await read("luna");
  const terra = await read("terra");
  expect(luna.composer.model).toBe("gpt-6-luna");
  expect({
    ...luna,
    composer: { ...luna.composer, model: terra.composer.model },
  }).toEqual(terra);
  expect(screeningOrder().map(({ model }) => model)).toEqual([
    "luna",
    "terra",
    "luna",
    "terra",
    "terra",
    "luna",
    "terra",
    "luna",
  ]);
  expect(screeningOrder()).toHaveLength(8);
  expect(screeningOrder("correction")).toEqual([
    { repetition: 3, score: "correction", model: "luna" },
    { repetition: 3, score: "correction", model: "terra" },
  ]);
});
