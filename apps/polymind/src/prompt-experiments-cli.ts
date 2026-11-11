import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  inspectExperiments,
  prepareExperiments,
  runExperiments,
} from "./prompt-experiments.ts";

try {
  const { values } = parseArgs({
    options: {
      prepare: { type: "boolean" },
      "live-plan": { type: "string" },
      "recorded-plan": { type: "string" },
      plan: { type: "string" },
      out: { type: "string" },
      inspect: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help)
    console.log(
      "prompt-experiments --prepare --live-plan <plan> --recorded-plan <plan> --out <new-batch.json>\nprompt-experiments --plan <batch.json> --out <new-directory>\nprompt-experiments --inspect <directory>\nPreparation is offline. Running makes real provider calls: 16 runs, two at a time; fail-fast, no retries.",
    );
  else if (values.inspect) {
    await inspectExperiments(values.inspect);
    console.log("Reading copies rebuilt.");
  } else if (values.prepare) {
    if (!values["live-plan"] || !values["recorded-plan"] || !values.out)
      throw new Error("Missing preparation arguments.");
    const batch = await prepareExperiments(
      values["live-plan"],
      values["recorded-plan"],
    );
    await writeFile(values.out, `${JSON.stringify(batch, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        path: values.out,
        runs: batch.jobs.length,
        concurrency: batch.concurrency,
        totalScheduledSeconds: batch.jobs.reduce(
          (sum, j) => sum + j.plan.endMs / 1000,
          0,
        ),
      }),
    );
  } else {
    if (!values.plan || !values.out) throw new Error("Missing run arguments.");
    const batch = JSON.parse(await readFile(values.plan, "utf8"));
    const abort = new AbortController();
    const stop = () => abort.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      const completed = await runExperiments(batch, values.out, abort.signal);
      console.log(JSON.stringify({ directory: values.out, completed }));
      if (!completed) process.exitCode = 1;
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
  }
} catch (error) {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === "EEXIST") {
    console.error(
      "The output destination already exists; it has not been overwritten. For an existing run, read reading-copy.txt and outcomes.json in that directory, or use prompt-experiments --inspect <directory>. To deliberately run another batch, choose a new --out destination.",
    );
  } else {
    console.error(
      "Experiment batch could not complete. Check paths, frozen plans and saved outcomes. Existing destinations are not overwritten.",
    );
  }
  process.exitCode = 1;
}
