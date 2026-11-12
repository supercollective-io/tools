import { resolve } from "node:path";
import { openAITranscriber } from "./session/recordings.ts";
import { startSessionServer } from "./session/server.ts";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT.");
if (process.env.NODE_ENV === "production" && !process.env.PUBLIC_ORIGIN?.trim())
  throw new Error(
    "Set PUBLIC_ORIGIN to the public origin before starting Polymind in production.",
  );
const origin = process.env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`;
const model = process.env.TRANSCRIPTION_MODEL;
const app = await startSessionServer({
  directory: resolve(process.env.DATA_DIR ?? "runs/polymind"),
  origin,
  port,
  host: process.env.HOST ?? "127.0.0.1",
  operatorToken: process.env.OPERATOR_TOKEN ?? "",
  hubUrl: process.env.HUB_URL,
  transcriptionModel: model,
  transcribe: model ? openAITranscriber(model) : undefined,
});
console.log(
  `Polymind: ${origin}\nOperator: ${origin}/operator\nCtrl+C saves and stops.`,
);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    if (closing) return;
    closing = true;
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  });
