import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  prepareCorpus,
  readCorpusBundle,
  runContributionPilot,
  writeCorpusBundle,
} from "./contribution-corpus.ts";

const help = `Contribution corpus — offline preparation and explicit 8-person generation

  pnpm corpus prepare --design <design.json> --config <config.json> --out <new-directory>
  pnpm corpus check --bundle <bundle.json>
  pnpm corpus pilot --bundle <bundle.json> --out <new-run-directory>

Prepare and check are offline and need no model credentials.
Pilot makes at most eight sequential model requests using the frozen configuration.
It stops at the first failure and never retries or overwrites an existing directory.
`;

export async function contributionMain(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      design: { type: "string" },
      config: { type: "string" },
      out: { type: "string" },
      bundle: { type: "string" },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return;
  }
  const command = positionals[0];
  if (
    positionals.length !== 1 ||
    !["prepare", "check", "pilot"].includes(command ?? "")
  )
    throw new Error(help);
  const accepted =
    command === "prepare"
      ? ["design", "config", "out"]
      : command === "check"
        ? ["bundle"]
        : ["bundle", "out"];
  for (const key of Object.keys(values))
    if (!accepted.includes(key))
      throw new Error(`Option --${key} does not apply to ${command}.`);
  const required = (value: string | undefined, label: string) => {
    if (!value) throw new Error(`Missing --${label}.`);
    return resolve(value);
  };
  if (command === "prepare") {
    const design = JSON.parse(
      await readFile(required(values.design, "design"), "utf8"),
    );
    const config = JSON.parse(
      await readFile(required(values.config, "config"), "utf8"),
    );
    const output = required(values.out, "out");
    const bundle = prepareCorpus(design, config);
    await writeCorpusBundle(output, bundle);
    process.stdout.write(
      `Prepared 64 slots and 8 requests at ${output}. No models contacted.\nFingerprint: ${bundle.fingerprint}\n`,
    );
    return;
  }
  const output = command === "pilot" ? required(values.out, "out") : undefined;
  const bundle = await readCorpusBundle(required(values.bundle, "bundle"));
  if (command === "check") {
    process.stdout.write(
      `Valid reproducible bundle: ${bundle.fingerprint}\nPilot: ${bundle.requests.map((r) => r.id).join(", ")}\nNo models contacted.\n`,
    );
    return;
  }
  // Import and validate the provider only in the explicitly requested pilot path.
  const { generate, validateModelEnvironment } = await import("./models.ts");
  validateModelEnvironment(bundle.generator);
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    if (!output) throw new Error("Missing output directory.");
    const result = await runContributionPilot(
      bundle,
      output,
      generate,
      controller.signal,
    );
    process.stdout.write(
      `Pilot ${result.status}: ${result.completed}/8 saved in ${output}.\n`,
    );
    if (result.failure) process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  contributionMain(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Contribution command failed."}\n`,
    );
    process.exitCode = 1;
  });
}
