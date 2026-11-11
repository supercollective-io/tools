import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { liveConfigSchema } from "./live-schema.ts";
import { startParticipation } from "./participation.ts";
import { readJson } from "./schema.ts";

const { values } = parseArgs({
  options: {
    session: { type: "string" },
    invitation: { type: "string" },
    origin: { type: "string" },
    config: { type: "string" },
    "operator-port": { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "pnpm participate [--session runs/typed-session] [--origin http://LAN-IP:3200] [--config examples/live-projection.json] [--operator-port 3101]\nOmit --session to create a new session; specify it to reopen saved data. Restart always requires operator Start/Resume. Use phones on the same trusted Wi-Fi. No microphone or remote operator access.",
  );
} else {
  const interfaces = networkInterfaces();
  const address =
    [...(interfaces.en0 ?? []), ...Object.values(interfaces).flat()].find(
      (v) => v?.family === "IPv4" && !v.internal,
    )?.address ?? "127.0.0.1";
  const config = await readJson(
    resolve(values.config ?? "examples/live-projection.json"),
    liveConfigSchema,
    "Live configuration",
  );
  config.live.maxDurationMs = 3600000;
  const operatorPort = Number(values["operator-port"] ?? 3101);
  if (
    !Number.isInteger(operatorPort) ||
    operatorPort < 1 ||
    operatorPort > 65535
  )
    throw new Error("Invalid operator port.");
  const directory = resolve(values.session ?? `runs/typed-${randomUUID()}`);
  const app = await startParticipation({
    directory,
    invitation:
      values.invitation ??
      "What is something you’d like to change, but can’t change on your own?",
    config,
    origin: values.origin ?? `http://${address}:3200`,
    operatorPort,
  });
  console.log(
    `Operator: ${app.operatorUrl}\nSession: ${directory}\nJoin: ${app.joinUrl}\nKeep operator controls on this Mac. Press Start to compose. Ctrl+C pauses and saves.`,
  );
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
