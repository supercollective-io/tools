import { nextWord, restoreOffset, saveOffset } from "/projection-state.js";

const pane = document.getElementById("text");
const fullscreen = document.getElementById("fullscreen");
let state = null;
let offset = 0;
let connected = false;
let last = performance.now();
let credit = 0;
function checkpoint() {
  if (state) {
    try {
      saveOffset(localStorage, state.runId, state.text, offset);
    } catch {
      /* Keep live display usable if browser storage is unavailable. */
    }
  }
}
function render() {
  pane.textContent = state?.text.slice(0, offset) ?? "";
  pane.scrollTop = pane.scrollHeight;
}
function accept(next) {
  if (next?.runId !== state?.runId) {
    checkpoint();
    offset = next ? restoreOffset(localStorage, next.runId, next.text) : 0;
    credit = 0;
  }
  state = next;
  connected = true;
  render();
}
const events = new EventSource("/api/projection/events");
events.addEventListener("state", (event) => {
  try {
    accept(JSON.parse(event.data));
  } catch {
    connected = false;
  }
});
events.addEventListener("error", () => {
  connected = false;
  credit = 0;
});
setInterval(() => {
  const now = performance.now();
  const elapsed = Math.min(250, now - last);
  last = now;
  if (!connected || !state || state.status === "paused" || document.hidden) {
    credit = 0;
    return;
  }
  const end = nextWord(state.text, offset, state.status === "ended");
  if (end === offset) {
    credit = 0;
    return;
  }
  credit += (elapsed * 140) / 60000;
  if (credit < 1) return;
  credit -= 1;
  offset = end;
  checkpoint();
  render();
}, 50);
fullscreen.addEventListener("click", () => {
  document.documentElement.requestFullscreen().catch(() => {});
});
window.addEventListener("pagehide", checkpoint);
