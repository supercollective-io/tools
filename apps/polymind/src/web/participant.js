const text = document.getElementById("contribution");
const status = document.getElementById("status");
let state = null;
let draft = null;
let composing = false;
let conflict = false;
const key = () => `collective-continuous:${state.runId}`;
function save() {
  localStorage.setItem(key(), JSON.stringify(draft));
}
async function api(path, data) {
  const response = await fetch(
    path,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      result.error ?? "Connection lost. Retrying automatically.",
    );
    error.status = response.status;
    throw error;
  }
  return result;
}
text.addEventListener("compositionstart", () => {
  composing = true;
});
text.addEventListener("compositionend", () => {
  composing = false;
});
text.addEventListener("input", () => {
  if (conflict) {
    draft.revision = state.contribution.revision;
    draft.pending = null;
    conflict = false;
  }
  draft.text = text.value;
  try {
    save();
    status.textContent = "Saving…";
  } catch {
    status.textContent = "Device storage unavailable. Keep this page open.";
  }
});
async function cycle() {
  try {
    state = await api("/api/state");
    document.getElementById("invitation").textContent = state.invitation;
    if (!draft) {
      try {
        const saved = JSON.parse(localStorage.getItem(key()));
        if (
          saved &&
          typeof saved.text === "string" &&
          Number.isSafeInteger(saved.revision) &&
          typeof saved.savedText === "string"
        )
          draft = saved;
      } catch {
        /* Restore from the server when there is no local draft. */
      }
      draft ??= {
        text: state.contribution.text,
        savedText: state.contribution.text,
        revision: state.contribution.revision,
        pending: null,
      };
      // A clean local copy can follow changes made in another tab.
      if (!draft.pending && draft.text === draft.savedText) {
        draft.text = draft.savedText = state.contribution.text;
        draft.revision = state.contribution.revision;
      }
      text.value = draft.text;
    }
    text.disabled = state.status === "ended";
    if (
      !conflict &&
      !composing &&
      (draft.pending ||
        (state.status !== "ended" && draft.text !== draft.savedText))
    ) {
      draft.pending ??= { revision: draft.revision + 1, text: draft.text };
      // Retain the exact revision for retries even as the person keeps typing.
      save();
      await api("/api/contribution", draft.pending);
      draft.revision = draft.pending.revision;
      draft.savedText = draft.pending.text;
      draft.pending = null;
      save();
    }
    if (!conflict)
      status.textContent =
        state.status === "ended"
          ? "Session ended. Any unsaved writing remains on this device."
          : draft.text !== draft.savedText || draft.pending
            ? "Saving…"
            : state.status !== "running"
              ? "Saved. Waiting for the voice."
              : "Saved.";
  } catch (error) {
    if (error.status === 409) conflict = true;
    status.textContent =
      error.message ?? "Reconnecting… Your writing remains here.";
  }
  setTimeout(cycle, 1000);
}
async function join() {
  const token = location.hash.slice(1);
  if (token) {
    try {
      await api("/api/join", { token });
      history.replaceState(null, "", location.pathname);
    } catch (error) {
      status.textContent = error.message;
      return;
    }
  }
  await cycle();
}
join();
