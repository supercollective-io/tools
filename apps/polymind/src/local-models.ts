import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import type { LiveConfig } from "./live-schema.ts";
import type { ModelConfig } from "./models.ts";
import { validateModelEnvironment } from "./models.ts";
import {
  type WorkspaceModel,
  WorkspacePreparationError,
  type WorkspaceSettings,
} from "./workspace.ts";

export const quickModel = "qwen2.5:3b-instruct-q4_K_M";
function managedAddress() {
  const port = process.env.COLLECTIVE_OLLAMA_PORT ?? "11435";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("COLLECTIVE_OLLAMA_PORT must be between 1 and 65535.");
  return {
    port: Number(port),
    host: `127.0.0.1:${Number(port)}`,
    url: `http://127.0.0.1:${Number(port)}`,
  };
}
const originalUrl = "http://127.0.0.1:11434";

export async function modelChoices(
  config: LiveConfig,
  custom: boolean,
): Promise<WorkspaceModel[]> {
  if (custom)
    return [
      {
        id: "configured",
        label: config.composer.model,
        modes: ["continuous", "chunked", "fixed"],
        composer: config.composer,
        participants: config.live.participants,
      },
    ];
  const quick: ModelConfig = {
    ...config.composer,
    provider: "ollama",
    model: quickModel,
    baseUrl: managedAddress().url,
    numCtx: 8192,
  };
  delete quick.think;
  const choices: WorkspaceModel[] = [
    {
      id: "quick",
      label: "Qwen 3B · fast",
      modes: ["continuous", "chunked", "fixed"],
      composer: quick,
      participants: { ...quick },
    },
  ];
  try {
    const response = await fetch(`${originalUrl}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return choices;
    const data = (await response.json()) as { models?: { name: string }[] };
    if (data.models?.some((model) => model.name === "gemma4:12b-mlx")) {
      const gemma: ModelConfig = {
        provider: "ollama",
        model: "gemma4:12b-mlx",
        rawPrefill: true,
        baseUrl: originalUrl,
        think: false,
        numCtx: 8192,
        maxOutputTokens: 256,
        timeoutMs: 120000,
      };
      choices.push({
        id: "gemma",
        label: "Gemma 12B",
        modes: ["chunked", "fixed"],
        composer: gemma,
        participants: { ...gemma },
      });
    }
  } catch {
    /* The workspace can open before Ollama is available. */
  }
  return choices;
}

/** Only manages the process this application starts; never stops another service. */
export class LocalModels {
  private process: ChildProcess | null = null;
  private exited: Promise<void> | null = null;
  private slots = 0;
  private cancellation = new AbortController();
  private address = managedAddress();
  private manageQuick: boolean;
  constructor(manageQuick = true) {
    this.manageQuick = manageQuick;
  }

  cancel() {
    this.cancellation.abort();
  }

  async close() {
    const child = this.process;
    this.process = null;
    this.slots = 0;
    if (!child) return;
    child.kill("SIGTERM");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
    timeout.unref();
    await this.exited;
    clearTimeout(timeout);
  }

  async prepare(settings: WorkspaceSettings, config: LiveConfig) {
    this.cancellation.signal.throwIfAborted();
    try {
      validateModelEnvironment(config.composer);
      if (settings.mode !== "fixed")
        validateModelEnvironment(config.live.participants);
    } catch (error) {
      throw new WorkspacePreparationError(
        error instanceof Error
          ? error.message
          : "Check the model configuration.",
      );
    }
    const roles =
      settings.mode === "fixed"
        ? [config.composer]
        : [config.composer, config.live.participants];
    const managed =
      this.manageQuick &&
      roles.some(
        (role) =>
          role.provider === "ollama" &&
          role.baseUrl === this.address.url &&
          role.model === quickModel,
      );
    if (!managed) {
      await this.close();
      // Verify local services without generating or changing their state.
      for (const role of roles) {
        if (role.provider !== "ollama") continue;
        try {
          const response = await fetch(
            `${role.baseUrl ?? originalUrl}/api/tags`,
            {
              signal: AbortSignal.any([
                this.cancellation.signal,
                AbortSignal.timeout(3000),
              ]),
              redirect: "error",
            },
          );
          const data = (await response.json()) as {
            models?: { name: string }[];
          };
          if (
            !response.ok ||
            !data.models?.some((item) => item.name === role.model)
          )
            throw new Error("Missing model");
        } catch {
          throw new WorkspacePreparationError(
            `The selected local model is unavailable. Start its Ollama service and check that the model is installed.`,
          );
        }
      }
      return;
    }
    const slots =
      settings.mode === "continuous" ? settings.participants + 1 : 1;
    if (
      this.process &&
      this.slots === slots &&
      this.process.exitCode === null &&
      this.process.signalCode === null
    )
      return;
    await this.close();
    const check = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        check.once("error", reject);
        check.listen(this.address.port, "127.0.0.1", resolve);
      });
    } catch {
      throw new WorkspacePreparationError(
        `Another rehearsal model service is using port ${this.address.port}. Close that rehearsal, or use a custom configuration for its service.`,
      );
    }
    await new Promise<void>((resolve) => check.close(() => resolve()));
    this.cancellation.signal.throwIfAborted();
    const env = {
      ...process.env,
      OLLAMA_HOST: this.address.host,
      OLLAMA_NUM_PARALLEL: String(slots),
      OLLAMA_CONTEXT_LENGTH: "8192",
      OLLAMA_MAX_LOADED_MODELS: "1",
      OLLAMA_NO_CLOUD: "1",
      OLLAMA_KEEP_ALIVE: "60s",
    };
    const child = spawn("ollama", ["serve"], {
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    this.process = child;
    this.slots = slots;
    let failed = false;
    this.exited = new Promise((resolve) => {
      child.once("error", () => {
        failed = true;
        resolve();
      });
      child.once("close", () => {
        failed = true;
        resolve();
      });
    });
    child.stderr?.resume();
    try {
      let ready: { models?: { name: string }[] } | undefined;
      for (let attempt = 0; attempt < 100; attempt++) {
        this.cancellation.signal.throwIfAborted();
        if (failed)
          throw new WorkspacePreparationError(
            "Ollama could not start. Install Ollama, then try again.",
          );
        try {
          const response = await fetch(`${this.address.url}/api/tags`, {
            signal: AbortSignal.any([
              this.cancellation.signal,
              AbortSignal.timeout(1000),
            ]),
          });
          if (response.ok) {
            ready = (await response.json()) as typeof ready;
            break;
          }
        } catch {
          /* Wait for startup. */
        }
        await delay(100, undefined, { signal: this.cancellation.signal });
      }
      if (!ready)
        throw new WorkspacePreparationError(
          "Ollama did not become ready. Check the local service and try again.",
        );
      if (!ready.models?.some((item) => item.name === quickModel)) {
        process.stdout.write("Downloading Qwen 3B (about 1.9 GB, once)…\n");
        const pull = spawn("ollama", ["pull", quickModel], {
          env,
          stdio: "inherit",
        });
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        const abort = () => {
          pull.kill("SIGTERM");
          killTimer = setTimeout(() => pull.kill("SIGKILL"), 5000);
          killTimer.unref();
        };
        this.cancellation.signal.addEventListener("abort", abort, {
          once: true,
        });
        if (this.cancellation.signal.aborted) abort();
        try {
          await new Promise<void>((resolve, reject) => {
            pull.once("error", () =>
              reject(
                new WorkspacePreparationError(
                  "Could not download the model. Check Ollama and your connection.",
                ),
              ),
            );
            pull.once("close", (code) =>
              code === 0
                ? resolve()
                : reject(
                    new WorkspacePreparationError(
                      "The model download did not finish. Try Start again.",
                    ),
                  ),
            );
          });
        } finally {
          this.cancellation.signal.removeEventListener("abort", abort);
          clearTimeout(killTimer);
        }
      }
      this.cancellation.signal.throwIfAborted();
    } catch (error) {
      await this.close();
      throw error;
    }
  }
}
