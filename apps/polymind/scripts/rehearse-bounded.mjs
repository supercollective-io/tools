import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  digest,
  operationConfigSchema,
  snapshotSchema,
} from "../src/session/contracts.ts";
import { modelExecutor, validateResult } from "../src/session/jobs.ts";

const file = process.argv[2];
if (!file)
  throw new Error(
    "Supply an explicit private request JSON path; see docs/operations.md.",
  );
const request = JSON.parse(await readFile(file, "utf8"));
if (request.authorisation !== "run-provider-rehearsal")
  throw new Error(
    "Explicit run-provider-rehearsal authorisation is required in the request.",
  );
if (!["analysis", "voice", "matching"].includes(request.kind))
  throw new Error("Select a supported operation.");
const snapshot = snapshotSchema.parse(request.snapshot),
  config = operationConfigSchema.parse(request.config);
const calls =
  request.kind === "matching"
    ? config.mode === "similarity"
      ? 1
      : config.maxCalls
    : 1;
if (
  !Number.isInteger(request.maxProviderCalls) ||
  !calls ||
  calls > request.maxProviderCalls
)
  throw new Error(
    "Set an explicit provider-call budget that covers this operation.",
  );
if (
  snapshot.contributions.reduce((n, c) => n + c.text.length, 0) >
  config.maxInputCharacters
)
  throw new Error("Input exceeds the explicit context budget.");
const directory = resolve(request.outputDirectory);
await mkdir(directory, { mode: 0o700 });
const op = {
  id: randomUUID(),
  snapshotId: snapshot.id,
  snapshotHash: digest(JSON.stringify(snapshot)),
  kind: request.kind,
  config,
  state: "running",
  createdAt: new Date().toISOString(),
  published: false,
};
await writeFile(
  join(directory, "request.json"),
  JSON.stringify({ ...request, operation: op }, null, 2),
  { mode: 0o600, flag: "wx" },
);
const started = performance.now();
try {
  const result = validateResult(
    op,
    snapshot,
    await modelExecutor(directory)(
      op,
      snapshot,
      AbortSignal.timeout(config.model.timeoutMs),
      (message) => console.log(message),
    ),
  );
  await writeFile(
    join(directory, "result.json"),
    JSON.stringify(
      {
        operation: op.id,
        durationMs: performance.now() - started,
        published: false,
        result,
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    `Completed private rehearsal ${op.id}. Review ${join(directory, "result.json")}; nothing was published.`,
  );
} catch {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify({
      operation: op.id,
      durationMs: performance.now() - started,
      error:
        "Rehearsal failed; inputs retained. Review configuration before any explicit retry.",
    }),
    { mode: 0o600 },
  );
  process.exitCode = 1;
}
