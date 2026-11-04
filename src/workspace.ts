import { randomUUID } from "node:crypto";
import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { LiveController } from "./live.ts";
import { LiveLog, type LiveState, readLiveRun } from "./live-runs.ts";
import { type LiveConfig, liveConfigSchema } from "./live-schema.ts";
import {
  LocalControlError,
  publicLiveState,
  startLocalRehearsalServer,
} from "./live-server.ts";
import { type Generate, generate as generateModel } from "./models.ts";
import type { Config, Score, SimulationScenario } from "./schema.ts";

export type WorkspaceSettings = {
  mode: "continuous" | "chunked" | "fixed";
  model: string;
  participants: number;
};
export type WorkspaceModel = {
  id: string;
  label: string;
  modes: WorkspaceSettings["mode"][];
  composer: Config["composer"];
  participants: Config["composer"];
};
export type WorkspaceOptions = {
  runsDirectory: string;
  scenario: SimulationScenario;
  score: Score;
  config: LiveConfig;
  models: WorkspaceModel[];
  prepare: (settings: WorkspaceSettings, config: LiveConfig) => Promise<void>;
  port?: number;
  initialRun?: string;
  initialSettings?: Partial<WorkspaceSettings>;
  generate?: Generate;
  useDefaults?: boolean;
};
export class WorkspacePreparationError extends LocalControlError {}

type Session = {
  id: string;
  label: string;
  status: LiveState["status"];
  mode: WorkspaceSettings["mode"];
  model: string;
  updatedAt: string;
};

/** Starts an idle browser workspace. Model preparation and journals wait for Start. */
export async function startWorkspace(options: WorkspaceOptions) {
  const runsDirectory = resolve(options.runsDirectory);
  const counts =
    options.scenario.voices.length < 2
      ? [options.scenario.voices.length]
      : [...new Set([2, options.scenario.voices.length])];
  const catalogue = options.models;
  if (
    !catalogue.length ||
    new Set(catalogue.map((model) => model.id)).size !== catalogue.length
  )
    throw new Error("The workspace needs a model catalogue with unique IDs.");
  const defaultModel =
    catalogue.find((model) => model.id === "qwen3b") ?? catalogue[0];
  if (!defaultModel) throw new Error("The workspace needs a model.");
  const defaults: WorkspaceSettings = {
    mode: defaultModel.modes.includes("continuous")
      ? "continuous"
      : (defaultModel.modes[0] ?? "chunked"),
    model: defaultModel.id,
    participants: counts[0] ?? 2,
    ...options.initialSettings,
  };
  function validateSettings(value: Record<string, unknown>): WorkspaceSettings {
    if (Object.keys(value).sort().join(",") !== "mode,model,participants")
      throw new LocalControlError(
        "Choose a mode, model and participant count.",
        400,
      );
    const model = catalogue.find((model) => model.id === value.model);
    if (!model?.modes.includes(value.mode as WorkspaceSettings["mode"]))
      throw new LocalControlError(
        "Choose a supported mode and model combination.",
        400,
      );
    if (
      typeof value.participants !== "number" ||
      !counts.includes(value.participants)
    )
      throw new LocalControlError(
        "Choose one of the available participant counts.",
        400,
      );
    return {
      mode: value.mode as WorkspaceSettings["mode"],
      model: model.id,
      participants: value.participants,
    };
  }
  validateSettings(defaults);
  let settings = { ...defaults };
  let log: LiveLog | null = null;
  let controller: LiveController | null = null;
  let controllerSubscription: (() => void) | undefined;
  let sessions: Session[] = [];
  let busy: string | undefined;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const modelId = (state: LiveState) =>
    catalogue.find(
      (model) =>
        model.composer.provider === state.config.composer.provider &&
        model.composer.model === state.config.composer.model &&
        model.composer.baseUrl === state.config.composer.baseUrl &&
        model.participants.model === state.config.live.participants.model &&
        model.participants.baseUrl === state.config.live.participants.baseUrl,
    )?.id ?? state.config.composer.model;
  const summarise = (id: string, state: LiveState): Session => ({
    id,
    label: state.scenario.title,
    status:
      state.status === "running" && log?.path !== join(runsDirectory, id)
        ? "paused"
        : state.status,
    mode: state.config.live.mode ?? "continuous",
    model: modelId(state),
    updatedAt: state.updatedAt,
  });
  const updateCurrent = () => {
    if (!log) return;
    const summary = summarise(basename(log.path), log.state);
    const index = sessions.findIndex((session) => session.id === summary.id);
    if (index === -1) sessions.unshift(summary);
    else sessions[index] = summary;
  };
  const refreshSessions = async () => {
    const entries = await readdir(runsDirectory, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      },
    );
    const found: Session[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      try {
        const state =
          log?.path === join(runsDirectory, entry.name)
            ? log.state
            : (await readLiveRun(join(runsDirectory, entry.name))).state;
        if (
          state.status === "ready" &&
          !state.composer.text &&
          !state.participants.some((writer) => writer.text)
        )
          continue;
        found.push(summarise(entry.name, state));
      } catch {
        /* Other journals and incomplete files are not live sessions. */
      }
    }
    sessions = found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    updateCurrent();
  };
  const release = async () => {
    const previousLog = log;
    const previousController = controller;
    controllerSubscription?.();
    controllerSubscription = undefined;
    try {
      await previousController?.close();
    } finally {
      await previousLog?.close();
      log = null;
      controller = null;
    }
  };
  const attach = (next: LiveLog) => {
    log = next;
    controller = new LiveController(next, options.generate ?? generateModel);
    controllerSubscription = controller.onChange(() => {
      updateCurrent();
      notify();
    });
  };
  const openSession = async (id: string, allowUnlisted = false) => {
    if (
      basename(id) !== id ||
      id === "." ||
      id === ".." ||
      (!allowUnlisted && !sessions.some((session) => session.id === id))
    )
      throw new LocalControlError(
        "Choose a saved session from this workspace.",
        400,
      );
    const path = join(runsDirectory, id);
    const stat = await lstat(path).catch(() => null);
    const canonical = await realpath(path).catch(() => null);
    const canonicalDirectory = await realpath(runsDirectory);
    if (
      !stat?.isFile() ||
      stat.isSymbolicLink() ||
      canonical !== join(canonicalDirectory, id)
    )
      throw new LocalControlError("This saved session is unavailable.");
    if (log?.path === path) return;
    await release();
    try {
      attach(await LiveLog.resume(path));
    } catch {
      throw new LocalControlError(
        "Cannot open this saved session. It may be in use; after a crash, wait 10 seconds and try again.",
      );
    }
    if (log) {
      const state: LiveState = (log as LiveLog).state;
      settings = {
        mode: state.config.live.mode ?? "continuous",
        model: modelId(state),
        participants: state.scenario.voices.length,
      };
    }
    await refreshSessions();
  };
  const makeInputs = (selected: WorkspaceSettings) => {
    const model = catalogue.find((model) => model.id === selected.model);
    if (!model) throw new LocalControlError("Choose an available model.", 400);
    const pair = ["chris", "rosa"].map((id) =>
      options.scenario.voices.find(
        (voice) =>
          voice.id.toLowerCase() === id || voice.name.toLowerCase() === id,
      ),
    );
    const voices =
      selected.participants === options.scenario.voices.length
        ? options.scenario.voices
        : pair.every(Boolean)
          ? (pair as SimulationScenario["voices"])
          : options.scenario.voices.slice(0, selected.participants);
    const scenario = { ...options.scenario, voices };
    const { score: _score, ...live } = options.config.live;
    const config = liveConfigSchema.parse({
      ...options.config,
      composer: {
        ...model.composer,
        ...(selected.mode !== "continuous" && options.useDefaults !== false
          ? { maxOutputTokens: 96 }
          : {}),
      },
      live: {
        ...live,
        mode: selected.mode,
        participants: {
          ...model.participants,
          ...(selected.mode !== "continuous" && options.useDefaults !== false
            ? { maxOutputTokens: 96 }
            : {}),
        },
        ...(options.useDefaults !== false
          ? {
              maxDurationMs: selected.mode === "continuous" ? 60_000 : 300_000,
              refreshIntervalMs: selected.participants > 2 ? 5_000 : 2_000,
              maxContextCharacters: 24_000,
            }
          : {}),
        ...(selected.mode === "fixed"
          ? {
              serialRequestTokens:
                live.serialRequestTokens ??
                (options.useDefaults !== false
                  ? 96
                  : model.composer.maxOutputTokens),
              score: {
                ...options.score,
                voices: voices.map((voice) => {
                  const source = options.score.voices.find(
                    (item) => item.id === voice.id,
                  );
                  if (!source || options.score.schemaVersion !== 2)
                    throw new LocalControlError(
                      "The fixed score must contain each selected participant.",
                    );
                  return source;
                }),
              },
            }
          : {}),
      },
    });
    return { scenario, config };
  };
  const prepare = async (selected: WorkspaceSettings, config: LiveConfig) => {
    busy = "Preparing models…";
    notify();
    try {
      await options.prepare(selected, config);
    } catch (error) {
      if (error instanceof WorkspacePreparationError) throw error;
      throw new LocalControlError(
        "Cannot prepare the selected model. Check that its local service and model are available.",
      );
    } finally {
      busy = undefined;
      notify();
    }
  };
  await refreshSessions();
  if (options.initialRun) {
    const initial = resolve(runsDirectory, options.initialRun);
    if (dirname(initial) !== runsDirectory)
      throw new Error(
        "The initial session must be inside the workspace runs directory.",
      );
    await openSession(basename(initial), true);
  }
  const snapshot = () => ({
    state: log ? publicLiveState(log.state) : null,
    runtime: controller?.snapshot() ?? null,
    ...(log ? { path: log.path } : {}),
    workspace: {
      settings: { ...settings },
      models: catalogue.map(({ id, label, modes }) => ({ id, label, modes })),
      participantCounts: counts,
      sessions: sessions.map((session) => ({ ...session })),
      ...(log ? { activeSessionId: basename(log.path) } : {}),
      ...(busy ? { busy } : {}),
    },
  });
  try {
    return await startLocalRehearsalServer({
      port: options.port,
      snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      paths: ["/api/start", "/api/pause", "/api/end", "/api/new", "/api/open"],
      validate: (path, body) => {
        const keys = Object.keys(body);
        if (path === "/api/start" && keys.length) validateSettings(body);
        else if (path === "/api/open") {
          if (keys.length !== 1 || typeof body.id !== "string")
            throw new LocalControlError("Choose a saved session.", 400);
        } else if (keys.length)
          throw new LocalControlError(
            "This control accepts only an empty JSON object: {}.",
            400,
          );
      },
      control: async (path, body) => {
        if (path === "/api/start") {
          if (log) {
            if (Object.keys(body).length)
              throw new LocalControlError(
                "Start a new session to change its settings.",
              );
            if (log.state.status === "ended")
              throw new LocalControlError(
                "This session has ended. Start a new session to continue.",
              );
            if (log.state.status === "running") return;
            const state = log.state;
            const needsInference =
              state.scheduler.phase !== "complete" &&
              (state.config.live.mode === "fixed" ||
                state.elapsedMs < state.config.live.maxDurationMs);
            if (needsInference) await prepare(settings, state.config);
          } else {
            const selected = Object.keys(body).length
              ? validateSettings(body)
              : { ...settings };
            const inputs = makeInputs(selected);
            await prepare(selected, inputs.config);
            attach(
              await LiveLog.create(
                join(runsDirectory, `${randomUUID()}.jsonl`),
                { type: "live.created", ...inputs },
              ),
            );
            settings = selected;
          }
          await controller?.start();
          updateCurrent();
        } else if (path === "/api/new") {
          await release();
          try {
            settings = validateSettings(settings);
          } catch {
            settings = { ...defaults };
          }
          await refreshSessions();
        } else if (path === "/api/open") {
          await refreshSessions();
          await openSession(body.id as string);
        } else if (!controller)
          throw new LocalControlError("Start or open a session first.");
        else if (path === "/api/pause") await controller.pause();
        else {
          await controller.end();
          await refreshSessions();
        }
      },
      close: release,
    });
  } catch (error) {
    await release();
    throw error;
  }
}
