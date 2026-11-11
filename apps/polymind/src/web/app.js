const byId = (id) => document.getElementById(id);
const elements = {
  connection: byId("connection"),
  invitation: byId("invitation"),
  status: byId("session-status"),
  elapsed: byId("elapsed"),
  start: byId("start"),
  pause: byId("pause"),
  end: byId("end"),
  new: byId("new"),
  saved: byId("saved"),
  savedLabel: byId("saved-label"),
  setup: byId("setup"),
  workspace: byId("workspace"),
  mode: byId("mode"),
  model: byId("model"),
  participantCount: byId("participant-count"),
  modeHint: byId("mode-hint"),
  error: byId("error"),
  collectivePhase: byId("collective-phase"),
  participants: byId("participants"),
  template: byId("participant-template"),
};
let snapshot = null;
let receivedAt = performance.now();
let connected = false;
let pendingAction = null;
let commandError = "";
const cards = new Map();
let runKey = null;
let setupInitialised = false;
let catalogKey = "";
let sessionsKey = "";

function textFollower(pane, button, placeholder, fixed = false) {
  let following = true;
  let previousText = null;
  let previousSeen = null;
  const bottom = () =>
    pane.scrollHeight - pane.scrollTop - pane.clientHeight < 30;
  pane.addEventListener(
    "scroll",
    () => {
      following = bottom();
      button.hidden = fixed || following;
    },
    { passive: true },
  );
  button.addEventListener("click", () => {
    following = true;
    pane.scrollTop = pane.scrollHeight;
    button.hidden = true;
    pane.focus({ preventScroll: true });
  });
  const update = (text, seen) => {
    const offset = Math.max(0, Math.min(text.length, seen ?? 0));
    if (text === previousText && offset === previousSeen) return;
    const position = pane.scrollTop;
    if (!text) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = placeholder;
      pane.replaceChildren(empty);
    } else {
      const read = document.createElement("span");
      read.className = fixed ? "source-sent" : "seen";
      read.textContent = text.slice(0, offset);
      const unread = document.createElement("span");
      unread.className = fixed ? "source-pending" : "unseen";
      unread.textContent = text.slice(offset);
      pane.replaceChildren(read, unread);
    }
    pane.scrollTop = !fixed && following ? pane.scrollHeight : position;
    button.hidden = fixed || following || bottom();
    previousText = text;
    previousSeen = offset;
  };
  update.reset = () => {
    following = true;
    previousText = null;
    previousSeen = null;
    pane.scrollTop = 0;
    button.hidden = true;
  };
  return update;
}
const collectiveText = textFollower(
  byId("collective-text"),
  byId("collective-follow"),
  "Waiting for text…",
);

function clock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function actorFor(id) {
  return snapshot?.runtime?.actors?.[id] ?? null;
}
function phase(actor, participant = false) {
  if (participant && snapshot.state.config?.live?.mode === "fixed")
    return ["Prewritten", "idle"];
  if (participant && snapshot.state.config?.live?.mode === "typed")
    return ["Typed", "idle"];
  const status = snapshot.state.status;
  if (status === "ended") return ["Ended", "idle"];
  if (!snapshot.runtime?.running)
    return [status === "ready" ? "Ready" : "Paused", "idle"];
  if (actor?.phase === "receiving") return ["Writing", "receiving"];
  if (
    actor?.phase === "idle" &&
    !["continuous", "typed"].includes(snapshot.state.config?.live?.mode) &&
    snapshot.state.config?.live?.mode
  )
    return ["Queued", "waiting"];
  return ["Waiting", "waiting"];
}
function setPhase(node, value) {
  node.textContent = value[0];
  node.className = `phase ${value[1]}`;
}
function createCard(voice) {
  const node = elements.template.content.firstElementChild.cloneNode(true);
  node.querySelector("h3").textContent = voice.name;
  const pane = node.querySelector(".participant-text");
  const fixed = snapshot.state.config?.live?.mode === "fixed";
  node.classList.toggle("fixed-source", fixed);
  pane.setAttribute(
    "aria-label",
    `${voice.name}: ${fixed ? "prewritten source" : "full growing contribution"}`,
  );
  const button = node.querySelector(".follow");
  button.setAttribute("aria-label", `Follow ${voice.name}'s latest text`);
  const card = {
    node,
    updateText: textFollower(pane, button, "Waiting for text…", fixed),
    phase: node.querySelector(".phase"),
  };
  cards.set(voice.id, card);
  return card;
}
function reconcileCards(voices) {
  const ids = new Set(voices.map((voice) => voice.id));
  for (const [id, card] of cards) {
    if (!ids.has(id)) {
      card.node.remove();
      cards.delete(id);
    }
  }
  if (cards.size === 0) elements.participants.replaceChildren();
  for (const voice of voices) {
    const existing = cards.get(voice.id);
    const card = existing ?? createCard(voice);
    if (!existing) elements.participants.append(card.node);
  }
}
function updateControls() {
  const setup = Boolean(snapshot?.workspace) && !snapshot.state;
  const busy = snapshot?.workspace?.busy;
  const available = Boolean(snapshot) && connected && !pendingAction && !busy;
  const writable = available && !snapshot?.runtime?.fatal;
  const ended = snapshot?.state?.status === "ended";
  const running = snapshot?.runtime?.running;
  elements.start.disabled =
    !writable || ended || running || (setup && !elements.model.value);
  elements.pause.disabled = !writable || ended || !running;
  elements.end.disabled = !writable || ended;
  elements.pause.hidden = setup;
  elements.end.hidden = setup;
  elements.new.hidden = !snapshot?.workspace || setup;
  elements.new.disabled = !available;
  elements.new.textContent = pendingAction === "new" ? "Opening…" : "New run";
  elements.saved.disabled = !available;
  for (const select of [
    elements.mode,
    elements.model,
    elements.participantCount,
  ])
    select.disabled = !available || !setup;
  elements.elapsed.hidden = setup;
  elements.start.textContent =
    busy || pendingAction === "start"
      ? "Preparing model…"
      : snapshot?.state?.status === "paused"
        ? "Resume"
        : "Start";
  elements.pause.textContent = pendingAction === "pause" ? "Pausing…" : "Pause";
  elements.end.textContent = pendingAction === "end" ? "Ending…" : "End";
  const error = commandError || snapshot?.runtime?.error || "";
  elements.error.textContent = error;
  elements.error.hidden = !error;
}
function option(value, label) {
  const node = document.createElement("option");
  node.value = String(value);
  node.textContent = label;
  return node;
}
function updateModels(preferred = elements.model.value) {
  const models = (snapshot?.workspace?.models ?? []).filter((model) =>
    model.modes.includes(elements.mode.value),
  );
  elements.model.replaceChildren(
    ...models.map((model) => option(model.id, model.label)),
  );
  if (models.some((model) => model.id === preferred))
    elements.model.value = preferred;
  elements.modeHint.textContent =
    elements.mode.value === "chunked"
      ? "One writer at a time."
      : elements.mode.value === "fixed"
        ? "Participants contribute the same written texts each time."
        : "";
}
function renderWorkspace() {
  const workspace = snapshot.workspace;
  const setup = Boolean(workspace) && !snapshot.state;
  elements.setup.hidden = !workspace;
  elements.workspace.hidden = setup;
  const sessions = workspace?.sessions ?? [];
  elements.saved.hidden = !workspace || !sessions.length;
  elements.savedLabel.hidden = elements.saved.hidden;
  const nextSessionsKey = JSON.stringify(sessions);
  if (nextSessionsKey !== sessionsKey) {
    elements.saved.replaceChildren(
      option("", "Open saved…"),
      ...sessions.map((session) =>
        option(
          session.id,
          `${new Date(session.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${session.mode === "fixed" ? "Prewritten" : session.mode === "chunked" ? "Chunked" : "Continuous"} · ${workspace.models.find((model) => model.id === session.model)?.label ?? session.model} · ${session.status}`,
        ),
      ),
    );
    sessionsKey = nextSessionsKey;
  }
  if (!setup) {
    setupInitialised = false;
    if (workspace) {
      const settings = workspace.settings;
      elements.mode.value = settings.mode;
      elements.model.replaceChildren(
        option(
          settings.model,
          workspace.models.find((model) => model.id === settings.model)
            ?.label ?? settings.model,
        ),
      );
      elements.participantCount.replaceChildren(
        option(settings.participants, String(settings.participants)),
      );
      elements.modeHint.textContent = "";
    }
    return;
  }
  const nextCatalogKey = JSON.stringify([
    workspace.models,
    workspace.participantCounts,
  ]);
  if (!setupInitialised || nextCatalogKey !== catalogKey) {
    const settings = workspace.settings;
    const selectedCount = setupInitialised
      ? elements.participantCount.value
      : String(settings.participants);
    if (!setupInitialised) elements.mode.value = settings.mode;
    const counts = workspace.participantCounts ?? [2, 8];
    elements.participantCount.replaceChildren(
      ...counts.map((count) => option(count, String(count))),
    );
    if (counts.some((count) => String(count) === selectedCount))
      elements.participantCount.value = selectedCount;
    updateModels(setupInitialised ? elements.model.value : settings.model);
    setupInitialised = true;
    catalogKey = nextCatalogKey;
  }
}
function render() {
  if (!snapshot) return;
  const { state, runtime } = snapshot;
  renderWorkspace();
  if (!state) {
    elements.invitation.textContent = "";
    elements.status.textContent =
      snapshot.workspace?.busy || "Ready for a new rehearsal";
    elements.elapsed.textContent = "00:00";
    document.title = "Collective Microphone";
    updateControls();
    return;
  }
  const voices = state.scenario?.voices ?? [];
  reconcileCards(voices);
  const scenario = state.scenario;
  const topic = scenario?.title?.replace(
    /^(?:Rehearsing We|Collective Microphone)\s*[—–:·-]?\s*/i,
    "",
  );
  const invitation = topic || scenario?.openingInvitation || "";
  elements.invitation.textContent =
    invitation.charAt(0).toUpperCase() + invitation.slice(1);
  elements.invitation.title = scenario?.openingInvitation || topic || "";
  document.title = `Collective Microphone${state.status === "ended" ? " · Ended" : ""}`;
  const composer = state.composer;
  const composerActor = actorFor("collective");
  collectiveText(composer?.text ?? "", state.publishedOffset ?? 0);
  setPhase(elements.collectivePhase, phase(composerActor));
  for (const voice of voices) {
    const card = cards.get(voice.id);
    const writer = state.participants?.find(
      (person) => person.id === `participant/${voice.id}`,
    );
    const actor = actorFor(`participant/${voice.id}`);
    const fixed = state.config?.live?.mode === "fixed";
    const value = fixed
      ? (writer?.sourceText ?? writer?.text ?? "")
      : (writer?.text ?? "");
    const sent = composer?.seenOffsets?.[voice.id] ?? 0;
    card.updateText(value, sent);
    setPhase(card.phase, phase(actor, true));
  }
  elements.status.textContent = pendingAction
    ? "Updating rehearsal…"
    : runtime.fatal
      ? "Stopped by a storage error"
      : state.status === "ended"
        ? "Rehearsal ended"
        : runtime.running
          ? "Rehearsal running"
          : state.status === "paused"
            ? "Rehearsal paused"
            : "Ready";
  updateControls();
  updateClock();
}
function updateClock() {
  if (!snapshot) return;
  const base = snapshot.runtime?.elapsedMs ?? snapshot.state?.elapsedMs ?? 0;
  elements.elapsed.textContent = clock(
    base + (snapshot.runtime?.running ? performance.now() - receivedAt : 0),
  );
}
function accept(payload) {
  if (payload?.joinUrl) {
    const url = new URL(payload.joinUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      byId("join-link").href = url.href;
      byId("join-qr").src = "/join.svg";
      byId("join").hidden = false;
    }
  }
  if (
    (!payload?.state || !payload?.runtime) &&
    !(payload?.workspace && payload.state === null)
  )
    throw new Error("The server returned an incomplete rehearsal state.");
  const nextRunKey =
    payload.state?.runId ??
    payload.workspace?.activeSessionId ??
    payload.path ??
    null;
  if (nextRunKey !== runKey) {
    cards.clear();
    elements.participants.replaceChildren();
    collectiveText.reset();
    runKey = nextRunKey;
  }
  snapshot = payload;
  receivedAt = performance.now();
  render();
}
function connectionStatus(ok, label) {
  connected = ok;
  elements.connection.textContent = label;
  elements.connection.hidden = ok;
  elements.connection.className = `connection ${ok ? "connected" : "reconnecting"}`;
  updateControls();
}
async function command(action, body = {}) {
  if (pendingAction) return;
  pendingAction = action;
  commandError = "";
  updateControls();
  try {
    const response = await fetch(`/api/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok || payload.error)
      throw new Error(
        payload.error || "The server could not update this rehearsal.",
      );
    accept(payload);
  } catch (error) {
    commandError =
      error instanceof TypeError
        ? "The server could not be reached. Your saved text remains available; wait for reconnection before trying again."
        : error instanceof Error
          ? error.message
          : "The rehearsal could not be updated. Try again when connected.";
  } finally {
    pendingAction = null;
    render();
    updateControls();
  }
}
elements.start.addEventListener("click", () =>
  command(
    "start",
    snapshot?.workspace && !snapshot.state
      ? {
          mode: elements.mode.value,
          model: elements.model.value,
          participants: Number(elements.participantCount.value),
        }
      : {},
  ),
);
elements.pause.addEventListener("click", () => command("pause"));
elements.end.addEventListener("click", () => command("end"));
elements.new.addEventListener("click", () => command("new"));
elements.saved.addEventListener("change", () => {
  const id = elements.saved.value;
  elements.saved.value = "";
  if (id) command("open", { id });
});
elements.mode.addEventListener("change", () => {
  updateModels();
  updateControls();
});
elements.model.addEventListener("change", updateControls);

async function connect() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("State unavailable");
    accept(await response.json());
    connectionStatus(true, "Connected");
    const events = new EventSource("/api/events");
    events.addEventListener("open", () => connectionStatus(true, "Connected"));
    events.addEventListener("state", (event) => {
      try {
        accept(JSON.parse(event.data));
        connectionStatus(true, "Connected");
      } catch {
        connectionStatus(false, "Waiting for session data");
      }
    });
    events.addEventListener("error", () =>
      connectionStatus(false, "Reconnecting…"),
    );
  } catch {
    connectionStatus(false, "Reconnecting…");
    if (!snapshot) elements.invitation.textContent = "";
    setTimeout(connect, 3000);
  }
}
setInterval(() => {
  if (snapshot) render();
}, 1000);
connect();
