const byId = (id) => document.getElementById(id);
const elements = {
  connection: byId("connection"),
  invitation: byId("invitation"),
  status: byId("session-status"),
  elapsed: byId("elapsed"),
  start: byId("start"),
  pause: byId("pause"),
  end: byId("end"),
  error: byId("error"),
  collectiveVersion: byId("collective-version"),
  collectivePhase: byId("collective-phase"),
  collectiveAge: byId("collective-age"),
  collectiveContext: byId("collective-context"),
  count: byId("participant-count"),
  activity: byId("activity"),
  participants: byId("participants"),
  template: byId("participant-template"),
  note: byId("session-note"),
};
let snapshot = null;
let receivedAt = performance.now();
let connected = false;
let pendingAction = null;
let commandError = "";
const cards = new Map();

function textFollower(pane, button, placeholder) {
  let following = true;
  let previousText = null;
  let previousSeen = null;
  const bottom = () =>
    pane.scrollHeight - pane.scrollTop - pane.clientHeight < 30;
  pane.addEventListener(
    "scroll",
    () => {
      following = bottom();
      button.hidden = following;
    },
    { passive: true },
  );
  button.addEventListener("click", () => {
    following = true;
    pane.scrollTop = pane.scrollHeight;
    button.hidden = true;
    pane.focus({ preventScroll: true });
  });
  return (text, seen) => {
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
      read.className = "seen";
      read.textContent = text.slice(0, offset);
      const unread = document.createElement("span");
      unread.className = "unseen";
      unread.textContent = text.slice(offset);
      pane.replaceChildren(read, unread);
    }
    pane.scrollTop = following ? pane.scrollHeight : position;
    button.hidden = following || bottom();
    previousText = text;
    previousSeen = offset;
  };
}
const collectiveText = textFollower(
  byId("collective-text"),
  byId("collective-follow"),
  "The collective voice will grow here as the rehearsal unfolds.",
);

function seconds(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}
function clock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function timestamp(value) {
  if (typeof value === "number") return value;
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function serverNow() {
  return (
    (snapshot?.runtime?.now ?? Date.now()) + performance.now() - receivedAt
  );
}
function age(value) {
  const at = timestamp(value);
  return at === null ? null : seconds(serverNow() - at);
}
function actorFor(id) {
  return snapshot?.runtime?.actors?.[id] ?? null;
}
function phase(writer, actor) {
  const status = snapshot.state.status;
  if (status === "ended") return ["Finished", "idle"];
  if (!snapshot.runtime.running)
    return [status === "ready" ? "Ready" : "Paused", "idle"];
  if (actor?.phase === "refreshing")
    return ["Refreshing context", "refreshing"];
  if (actor?.phase === "waiting") return ["Waiting for model", "waiting"];
  if (actor?.phase === "receiving")
    return [
      actor.refreshPending ? "Receiving · refresh due" : "Receiving",
      "receiving",
    ];
  if (writer?.active) return ["Waiting for model", "waiting"];
  return [
    writer?.id === "collective"
      ? "Waiting for participant text"
      : "Awaiting continuation",
    "idle",
  ];
}
function setPhase(node, value) {
  node.textContent = value[0];
  node.className = `phase ${value[1]}`;
}
function timing(writer, actor) {
  const active = writer?.active;
  const start = timestamp(active?.startedAt ?? actor?.startedAt);
  const first = timestamp(active?.firstTokenAt);
  const last = actor?.lastTokenAt ?? active?.firstTokenAt;
  const waiting =
    start === null
      ? ""
      : first === null
        ? snapshot.runtime.running
          ? `First text wait ${seconds(serverNow() - start)}`
          : "First text pending"
        : `First text in ${seconds(first - start)}`;
  return {
    waiting,
    last: last
      ? `Last text ${age(last)} ago`
      : writer?.text
        ? "Writing saved earlier"
        : "No text received yet",
  };
}
function createCard(voice) {
  const node = elements.template.content.firstElementChild.cloneNode(true);
  node.querySelector("h3").textContent = voice.name;
  node.querySelector(".avatar").textContent = Array.from(voice.name)[0] ?? "";
  const pane = node.querySelector(".participant-text");
  pane.setAttribute("aria-label", `${voice.name}: full growing contribution`);
  const button = node.querySelector(".follow");
  button.setAttribute("aria-label", `Follow ${voice.name}'s latest text`);
  const card = {
    node,
    updateText: textFollower(
      pane,
      button,
      "Their contribution will appear here.",
    ),
    phase: node.querySelector(".phase"),
    recent: node.querySelector(".recent"),
    context: node.querySelector(".context-line"),
    waiting: node.querySelector(".wait-time"),
    last: node.querySelector(".token-age"),
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
function contextLine(writer, actor, version) {
  const delivered =
    actor?.contextVersion ??
    writer?.active?.contextVersion ??
    writer?.lastContextVersion ??
    0;
  const current =
    delivered > 0
      ? `Context sent · ${delivered}`
      : actor?.startedAt || writer?.active
        ? "Opening context sent"
        : "Opening context";
  return version > delivered
    ? `${current} · ${version} now available`
    : `${current} · latest available`;
}
function updateControls() {
  const available =
    Boolean(snapshot) && connected && !pendingAction && !snapshot.runtime.fatal;
  const ended = snapshot?.state?.status === "ended";
  const running = snapshot?.runtime?.running;
  elements.start.disabled = !available || ended || running;
  elements.pause.disabled = !available || ended || !running;
  elements.end.disabled = !available || ended;
  elements.start.textContent =
    pendingAction === "start"
      ? "Starting…"
      : snapshot?.state?.status === "paused"
        ? "Resume rehearsal"
        : "Start rehearsal";
  elements.pause.textContent = pendingAction === "pause" ? "Pausing…" : "Pause";
  elements.end.textContent = pendingAction === "end" ? "Ending…" : "End";
  const error = commandError || snapshot?.runtime?.error || "";
  elements.error.textContent = error;
  elements.error.hidden = !error;
}
function render() {
  if (!snapshot) return;
  const { state, runtime } = snapshot;
  const voices = state.scenario?.voices ?? [];
  reconcileCards(voices);
  elements.invitation.textContent =
    state.scenario?.openingInvitation || state.scenario?.title || "";
  elements.invitation.title = elements.invitation.textContent;
  document.title = `Rehearsing We · ${state.status === "ended" ? "Ended" : "Live rehearsal"}`;
  elements.count.textContent = String(voices.length);
  const composer = state.composer;
  const version = state.collectiveVersion ?? 0;
  const composerActor = actorFor("collective");
  collectiveText(composer?.text ?? "", state.publishedOffset ?? 0);
  elements.collectiveVersion.textContent = version
    ? `Update ${version}`
    : "No update yet";
  setPhase(elements.collectivePhase, phase(composer, composerActor));
  elements.collectiveAge.textContent = composerActor?.lastTokenAt
    ? `Last text ${age(composerActor.lastTokenAt)} ago`
    : composer?.text
      ? "Writing saved earlier"
      : "No text received";
  elements.collectiveContext.textContent = version
    ? `Collective ${version} is available to participants. Context is sent when a model request starts or refreshes; this does not mean the model has used it.`
    : "Participants can develop their own thoughts and draw on the collective when useful.";
  for (const voice of voices) {
    const card = cards.get(voice.id);
    const writer = state.participants?.find(
      (person) => person.id === `participant/${voice.id}`,
    );
    const actor = actorFor(`participant/${voice.id}`);
    const value = writer?.text ?? "";
    card.updateText(value, composer?.seenOffsets?.[voice.id] ?? 0);
    setPhase(card.phase, phase(writer, actor));
    card.node.dataset.active = String(
      Boolean(runtime.running && actor?.phase === "receiving"),
    );
    const latest = value.trim().slice(-130).replace(/\s+/g, " ");
    card.recent.textContent = latest
      ? `Latest · ${latest}`
      : "Waiting for a first contribution";
    card.recent.title = latest;
    card.context.textContent = contextLine(writer, actor, version);
    const times = timing(writer, actor);
    card.waiting.textContent = times.waiting;
    card.last.textContent = times.last;
  }
  const actors = Object.values(runtime.actors ?? {});
  const receiving = actors.filter(
    (actor) => actor.phase === "receiving",
  ).length;
  const waiting = actors.filter((actor) => actor.phase === "waiting").length;
  elements.activity.textContent = runtime.running
    ? receiving === 0 && waiting > 0
      ? `Waiting for model service · ${waiting} requests`
      : `${receiving} receiving · ${waiting} waiting`
    : state.status === "ended"
      ? "Rehearsal ended"
      : "No active requests";
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
            : "Ready when you are";
  elements.note.textContent = runtime.fatal
    ? "Check storage, then reopen this saved rehearsal to recover."
    : state.pauseReason
      ? `Paused · ${state.pauseReason}`
      : state.status === "ended"
        ? "Saved text remains available to read."
        : "Activity reflects the requests reporting now.";
  updateControls();
  updateClock();
}
function updateClock() {
  if (!snapshot) return;
  const base = snapshot.runtime.elapsedMs ?? snapshot.state.elapsedMs ?? 0;
  elements.elapsed.textContent = clock(
    base + (snapshot.runtime.running ? performance.now() - receivedAt : 0),
  );
}
function accept(payload) {
  if (!payload?.state || !payload?.runtime)
    throw new Error("The server returned an incomplete rehearsal state.");
  snapshot = payload;
  receivedAt = performance.now();
  render();
}
function connectionStatus(ok, label) {
  connected = ok;
  elements.connection.textContent = label;
  elements.connection.className = `connection ${ok ? "connected" : "reconnecting"}`;
  updateControls();
}
async function command(action) {
  if (pendingAction) return;
  pendingAction = action;
  commandError = "";
  updateControls();
  try {
    const response = await fetch(`/api/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
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
elements.start.addEventListener("click", () => command("start"));
elements.pause.addEventListener("click", () => command("pause"));
elements.end.addEventListener("click", () => command("end"));

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
    elements.invitation.textContent =
      "Waiting for the rehearsal server. This page will reconnect automatically.";
    setTimeout(connect, 3000);
  }
}
setInterval(() => {
  if (snapshot) render();
}, 1000);
connect();
