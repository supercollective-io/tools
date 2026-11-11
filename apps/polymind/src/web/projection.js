const pane = document.getElementById("text");
const fullscreen = document.getElementById("fullscreen");
const events = new EventSource("/api/projection/events");
events.addEventListener("state", (event) => {
  try {
    const state = JSON.parse(event.data);
    pane.textContent = state?.text ?? "";
    pane.scrollTop = pane.scrollHeight;
  } catch {
    /* Retain the last valid writing until a fresh snapshot arrives. */
  }
});
fullscreen.addEventListener("click", () => {
  document.documentElement.requestFullscreen().catch(() => {});
});
