import { parseArgs } from "node:util";
import {
  inspectRehearsal,
  prepareRehearsal,
  runRehearsal,
} from "./prompt-rehearsal.ts";

const abort = new AbortController();
try {
  const { values } = parseArgs({
    options: {
      plan: { type: "string" },
      out: { type: "string" },
      run: { type: "string" },
      json: { type: "boolean" },
      prepare: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "rehearse-prompts --plan <plan.json> --out <new-directory>\nrehearse-prompts --plan <plan.json> --prepare\ninspect-prompts --run <directory> --json\nPaths in a plan are relative to that plan. Preparation and inspection are offline.",
    );
  } else if (values.run) {
    if (values.plan || values.out || values.prepare)
      throw new Error("Inspection accepts --run and --json only.");
    console.log(JSON.stringify(await inspectRehearsal(values.run), null, 2));
  } else {
    if (!values.plan || (!values.prepare && !values.out))
      throw new Error("Supply --plan and --out, or --plan and --prepare.");
    const plan = await prepareRehearsal(values.plan);
    if (values.prepare) console.log(JSON.stringify(plan, null, 2));
    else {
      const stop = () => abort.abort();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        const report = await runRehearsal(
          plan,
          values.out as string,
          undefined,
          abort.signal,
        );
        console.log(JSON.stringify(report, null, 2));
        if (
          report.status !== "ended" ||
          !report.completion.allInputsAdmitted ||
          !report.completion.allInputsSeen ||
          report.completion.failedAttempts.length
        )
          process.exitCode = 1;
      } finally {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
    }
  }
} catch {
  console.error(
    "Prompt rehearsal could not complete. Check plan paths, schemas, model configuration and the saved run. Existing output directories cannot be overwritten.",
  );
  process.exitCode = 1;
}
