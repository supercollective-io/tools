import { parseArgs } from "node:util";
import {
  prepareNaturalComparison,
  runNaturalComparison,
} from "./natural-comparison.ts";

const abort = new AbortController();
try {
  const { values } = parseArgs({
    options: {
      plan: { type: "string" },
      out: { type: "string" },
      prepare: { type: "boolean" },
      run: { type: "string" },
      "budget-usd": { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "natural-comparison --plan <input.json> --out <new-directory> --prepare\nnatural-comparison --run <prepared-directory> --budget-usd <amount>\nPreparation is offline. Run dispatches exactly two serial policy runs and stops after a failed or incomplete run.",
    );
  } else if (values.prepare) {
    if (!values.plan || !values.out || values.run || values["budget-usd"])
      throw new Error("Preparation requires --plan and --out only.");
    console.log(
      JSON.stringify(
        await prepareNaturalComparison(values.plan, values.out),
        null,
        2,
      ),
    );
  } else if (values.run) {
    if (values.plan || values.out || !values["budget-usd"])
      throw new Error("Run requires --run and an explicit --budget-usd.");
    const budget = Number(values["budget-usd"]);
    if (!Number.isFinite(budget) || budget <= 0 || budget > 5)
      throw new Error("Budget must be above zero and no more than USD 5.");
    const stop = () => abort.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      console.log(
        JSON.stringify(
          await runNaturalComparison(
            values.run,
            budget,
            undefined,
            abort.signal,
          ),
          null,
          2,
        ),
      );
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
  } else {
    throw new Error("Choose --prepare or --run.");
  }
} catch (error) {
  console.error(
    `Natural comparison could not complete: ${error instanceof Error ? error.message : "check the frozen plan and saved run"}`,
  );
  process.exitCode = 1;
}
