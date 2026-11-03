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
function phase(actor) {
  const status = snapshot.state.status;
  if (status === "ended") return ["Ended", "idle"];
  if (!snapshot.runtime.running)
    return [status === "ready" ? "Ready" : "Paused", "idle"];
  if (actor?.phase === "receiving") return ["Writing", "receiving"];
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
  pane.setAttribute("aria-label", `${voice.name}: full growing contribution`);
  const button = node.querySelector(".follow");
  button.setAttribute("aria-label", `Follow ${voice.name}'s latest text`);
  const card = {
    node,
    updateText: textFollower(pane, button, "Waiting for text…"),
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
        ? "Resume"
        : "Start";
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
    const value = writer?.text ?? "";
    card.updateText(value, composer?.seenOffsets?.[voice.id] ?? 0);
    setPhase(card.phase, phase(actor));
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
            : "Ready when you are";
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
  elements.connection.hidden = ok;
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
    if (!snapshot) elements.invitation.textContent = "";
    setTimeout(connect, 3000);
  }
}
setInterval(() => {
  if (snapshot) render();
}, 1000);
connect();
