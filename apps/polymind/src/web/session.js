const $ = (id) => document.getElementById(id);
const session = new URL(location.href).searchParams.get("session");
let state,
  pending,
  saving = false,
  confirmQueued = false,
  conflict,
  reconnecting = false,
  statusKind = "routine",
  debounce,
  editVersion = 0,
  recordingId,
  recordingRound,
  recordingGeneration = 0,
  recorder,
  stream,
  audioBlob,
  transcript,
  transcriptRecordingId,
  sourceRecording,
  roundId,
  participantId,
  editorGeneration = 0;
const draftKey = (round) => `polymind:${session}:${participantId}:${round}`;
function status(message, error = false, kind = "action") {
  $("status").textContent = message;
  $("status").dataset.error = String(error);
  statusKind = kind;
}
async function api(path, data, raw) {
  const response = await fetch(
    `${path}${path.includes("?") ? "&" : "?"}session=${encodeURIComponent(session ?? "")}`,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": raw ?? "application/json" },
          body: raw ? data : JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error), { status: response.status });
  return result;
}
function retainDraft() {
  if (roundId && participantId)
    localStorage.setItem(
      draftKey(roundId),
      JSON.stringify({
        text: $("text").value,
        pending,
        confirmQueued,
        matching: $("matching").checked,
      }),
    );
}
function makeRevision(
  confirmed,
  expectedRevision = state.contribution?.revision ?? 0,
) {
  return {
    requestId: crypto.randomUUID(),
    roundId,
    expectedRevision,
    text: $("text").value,
    confirmed,
    matching: confirmed && $("matching").checked,
    source: sourceRecording ? "transcript" : "typed",
    ...(sourceRecording ? { recordingId: sourceRecording } : {}),
  };
}
function updateConflict(latest) {
  conflict = latest;
  $("conflict-text").textContent = latest
    ? `Revision ${latest.revision}:\n${latest.text || "(No text was saved.)"}`
    : "The latest saved version could not be loaded. Read it before rebasing.";
  $("rebase").disabled =
    !latest || !state?.round?.open || !state?.session?.open;
}
async function readConflict() {
  const generation = editorGeneration;
  try {
    const latestState = await api("/api/state");
    if (generation !== editorGeneration) return;
    if (latestState.participant?.id !== participantId) {
      await refresh();
      return;
    }
    if (latestState.round?.id !== roundId) {
      updateConflict(undefined);
      status(
        "The round changed. Your local draft is still in this browser.",
        true,
      );
      return;
    }
    state = { ...state, ...latestState };
    updateConflict(
      latestState.contribution ?? { revision: 0, text: "", confirmed: false },
    );
    $("conflict").hidden = false;
    $("confirm").disabled = true;
    status(
      "Read the latest saved version, then choose whether to rebase your local draft.",
      false,
    );
  } catch (error) {
    if (generation !== editorGeneration) return;
    updateConflict(undefined);
    $("conflict").hidden = false;
    status(`Could not read the latest saved version: ${error.message}`, true);
  }
}
async function save(confirmed = false) {
  if (
    !participantId ||
    state?.participant?.id !== participantId ||
    !roundId ||
    !state.round?.open ||
    !state.session.open
  )
    return;
  if (confirmed) confirmQueued = true;
  if (confirmed) retainDraft();
  if (conflict) {
    retainDraft();
    status(
      "Read the latest saved version and rebase before saving this draft.",
      true,
    );
    return;
  }
  if (saving) return;
  saving = true;
  const sentRound = roundId;
  const generation = editorGeneration;
  try {
    pending ??= makeRevision(confirmQueued);
    const sent = pending;
    retainDraft();
    $("saved").textContent = "Saving…";
    const saved = await api("/api/contribution", sent);
    if (
      generation !== editorGeneration ||
      roundId !== sentRound ||
      sent.roundId !== sentRound
    )
      return;
    state.contribution = saved;
    pending = undefined;
    const latestText = $("text").value;
    const latestMatching = $("matching").checked;
    const changed =
      latestText !== saved.text ||
      (saved.confirmed && latestMatching !== saved.matching);
    const needsConfirmedFollowup =
      confirmQueued &&
      (!saved.confirmed ||
        changed ||
        (sourceRecording && saved.recordingId !== sourceRecording));
    if (confirmQueued && !needsConfirmedFollowup) confirmQueued = false;
    if (needsConfirmedFollowup || changed) {
      retainDraft();
      debounce = setTimeout(
        () => void save(needsConfirmedFollowup && confirmQueued),
        20,
      );
    } else {
      if (!saved.confirmed && latestMatching) retainDraft();
      else localStorage.removeItem(draftKey(roundId));
      $("saved").textContent = saved.confirmed
        ? "Confirmed and saved for this round."
        : "Draft saved.";
    }
    if (changed && !needsConfirmedFollowup)
      status(
        "Your latest edit is saved as a draft. Confirm again when ready.",
        false,
      );
  } catch (error) {
    if (generation !== editorGeneration) return;
    if (
      error.status === 409 &&
      /changed in another window|request id reused with different input/i.test(
        error.message,
      )
    ) {
      confirmQueued = false;
      $("conflict").hidden = false;
      updateConflict(undefined);
      retainDraft();
      status(
        "Another saved revision exists. Read it before choosing to rebase your local draft.",
        true,
      );
      await readConflict();
    } else if (error.status === undefined) {
      reconnecting = true;
      status(
        `${error.message} Your words remain in this browser. Reconnecting…`,
        true,
        "transient",
      );
    } else status(`${error.message} Your words remain in this browser.`, true);
    $("saved").textContent =
      "Not yet saved — retrying on your next edit or confirmation.";
  } finally {
    if (generation === editorGeneration) saving = false;
  }
}
$("text").addEventListener("input", () => {
  editVersion++;
  if (confirmQueued) confirmQueued = false;
  retainDraft();
  $("saved").textContent = "Unsaved changes";
  clearTimeout(debounce);
  const version = editVersion;
  debounce = setTimeout(() => {
    if (version === editVersion) void save(false);
  }, 500);
});
$("confirm").onclick = async () => {
  editVersion++;
  clearTimeout(debounce);
  await save(true);
};
$("read-conflict").onclick = () => void readConflict();
$("rebase").onclick = async () => {
  if (!conflict || $("rebase").disabled) return;
  const localText = $("text").value;
  const latest = conflict;
  const priorSource = pending?.source === "transcript" ? pending : undefined;
  state.contribution = latest;
  pending = {
    ...makeRevision(false, latest.revision),
    text: localText,
    matching: false,
    ...(priorSource?.recordingId
      ? { source: "transcript", recordingId: priorSource.recordingId }
      : {}),
  };
  confirmQueued = false;
  conflict = undefined;
  $("matching").checked = false;
  $("conflict").hidden = true;
  $("confirm").disabled = false;
  retainDraft();
  await save(false);
};
$("matching").onchange = () => {
  editVersion++;
  if (confirmQueued) confirmQueued = false;
  retainDraft();
  $("saved").textContent = "Confirm again to save your matching choice.";
};
$("join").onsubmit = async (event) => {
  event.preventDefault();
  resetEditor();
  participantId = undefined;
  try {
    const result = await api("/api/join", {
      name: $("name").value,
      seated: $("seated").checked,
    });
    if (result.recovery) {
      $("recovery").hidden = false;
      $("recovery").textContent =
        `Keep this private code if you need to return on another browser: ${result.recovery}`;
    }
    await refresh();
  } catch (e) {
    status(e.message, true);
  }
};
$("recover-form").onsubmit = async (event) => {
  event.preventDefault();
  resetEditor();
  participantId = undefined;
  try {
    await api("/api/recover", { recovery: $("recovery-code").value.trim() });
    await refresh();
  } catch (e) {
    status(e.message, true);
  }
};
$("help").onclick = async () => {
  try {
    await api("/api/help", { reason: $("help-reason").value });
    status("The organiser has your request. Released matches stay unchanged.");
  } catch (e) {
    status(e.message, true);
  }
};
function matches(items) {
  $("matches").replaceChildren();
  for (const item of items) {
    const box = document.createElement("div");
    box.className = "card";
    const heading = document.createElement("h3");
    heading.textContent = item.partners
      .map((p) => `${p.name} · ${p.badge}`)
      .join(" & ");
    const place = document.createElement("p");
    place.textContent = item.location;
    const invite = document.createElement("p");
    invite.textContent = item.invitation;
    box.append(heading, place, invite);
    $("matches").append(box);
  }
}
function resetEditor() {
  editorGeneration++;
  editVersion++;
  clearTimeout(debounce);
  saving = false;
  pending = undefined;
  confirmQueued = false;
  conflict = undefined;
  recordingGeneration++;
  if (recorder?.state === "recording") recorder.stop();
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
  recorder = stream = audioBlob = undefined;
  recordingId = recordingRound = transcript = transcriptRecordingId = undefined;
  sourceRecording = undefined;
  $("text").value = "";
  $("matching").checked = false;
  $("conflict").hidden = true;
  $("conflict-text").textContent = "";
  $("saved").textContent = "";
  $("identity").textContent = $("badge").textContent = "";
  $("record").disabled = false;
  for (const id of [
    "stop",
    "transcribe",
    "retry-audio",
    "use-transcript",
    "playback",
  ])
    $(id).hidden = true;
  $("record-status").textContent = $("transcript-preview").textContent = "";
  if ($("playback").src.startsWith("blob:"))
    URL.revokeObjectURL($("playback").src);
  $("playback").src = "";
  status("", false, "routine");
}
async function refresh() {
  if (!session) {
    status(
      "Open the session link from Rehearsing We to join.",
      false,
      "routine",
    );
    return;
  }
  const generation = editorGeneration;
  try {
    const next = await api("/api/state");
    if (generation !== editorGeneration) return;
    const identityChanged = participantId !== next.participant?.id;
    if (saving && !identityChanged) return;
    const editorChanged = identityChanged || roundId !== next.round?.id;
    if (editorChanged) resetEditor();
    participantId = next.participant?.id;
    roundId = next.round?.id;
    const recovered = reconnecting;
    reconnecting = false;
    state = next;
    $("event").textContent = next.session.title;
    $("hub").href = next.hubUrl;
    $("prompt").textContent =
      next.round?.prompt ?? "Welcome. The next invitation is on its way.";
    $("join").hidden = !!next.participant || !next.session.open;
    $("recover").hidden = !!next.participant;
    $("capture").hidden = !next.participant || !next.round;
    $("encounters").hidden = !next.participant;
    if (next.participant) {
      $("identity").textContent = next.participant.name;
      $("badge").textContent = next.participant.badge;
      if (next.round && editorChanged) {
        let draft;
        try {
          draft = JSON.parse(localStorage.getItem(draftKey(roundId)) ?? "null");
        } catch {
          /* An unreadable draft must not replace saved server text. */
        }
        $("text").value = draft?.text ?? next.contribution?.text ?? "";
        pending = draft?.pending;
        confirmQueued = Boolean(draft?.confirmQueued);
        sourceRecording =
          draft?.pending?.source === "transcript"
            ? draft.pending.recordingId
            : undefined;
        $("matching").checked =
          draft?.matching ??
          draft?.pending?.matching ??
          next.contribution?.matching ??
          false;
        $("saved").textContent = draft
          ? "Recovered a local draft. Save or confirm to send it."
          : next.contribution?.confirmed
            ? "Confirmed and saved for this round."
            : next.contribution
              ? "Draft saved."
              : "";
      }
      const open = next.session.open && next.round?.open;
      $("text").disabled = !open;
      $("confirm").disabled = !open || Boolean(conflict);
      $("matching").disabled = !open;
      if (conflict)
        $("rebase").disabled = !next.round?.open || !next.session.open;
      const continuous = next.round?.mode === "continuous";
      $("bounded").hidden = continuous;
      $("participation-notice").hidden = false;
      $("participation-notice").textContent = continuous
        ? "Live round: while the collective voice is running, your saved text goes to the selected model and may inform the public collective voice. There is no confirmation step."
        : "Bounded round: confirmed contributions are eligible for frozen processing. The organiser controls publication. Matching also requires your opt-in.";
      $("audio-controls").hidden =
        !next.capture.enabled || !open || !window.MediaRecorder;
      $("retention").textContent =
        next.capture.retention +
        (next.capture.enabled
          ? ` Recording uses ${next.capture.provider} (${next.capture.model}). ${continuous ? "Review the transcript before using it as live text." : "Review and correct the transcript before confirming."}`
          : " Recording is not enabled; typed input is available.");
      matches(next.encounters);
      if (recovered && statusKind === "transient")
        status("Connection restored.", false, "routine");
      else if (statusKind === "routine")
        status(
          open
            ? "You are part of this gathering."
            : "Collection has closed. Your identity and encounters remain available.",
          false,
          "routine",
        );
    } else
      status(
        next.session.open
          ? "Join with the name you want others to use."
          : "Joining has closed. You can still recover an existing place.",
        false,
        recovered && statusKind === "transient" ? "routine" : statusKind,
      );
    $("collective").hidden = !next.voice?.text;
    $("voice").textContent = next.voice?.text ?? "";
  } catch (e) {
    reconnecting = true;
    status(`${e.message} Reconnecting…`, true, "transient");
  }
}
function isCurrentRecording(job) {
  return (
    job.generation === recordingGeneration &&
    job.id === recordingId &&
    job.round === recordingRound
  );
}
$("record").onclick = async () => {
  const job = {
    id: crypto.randomUUID(),
    round: roundId,
    generation: ++recordingGeneration,
  };
  recordingId = job.id;
  recordingRound = job.round;
  transcript = undefined;
  transcriptRecordingId = undefined;
  sourceRecording = undefined;
  $("record").disabled = true;
  $("transcribe").hidden = true;
  $("retry-audio").hidden = true;
  $("use-transcript").hidden = true;
  $("transcript-preview").textContent = "";
  $("playback").hidden = true;
  try {
    const activeStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    if (!isCurrentRecording(job)) {
      activeStream.getTracks().forEach((track) => {
        track.stop();
      });
      return;
    }
    stream = activeStream;
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    );
    if (!mime)
      throw new Error(
        "This browser cannot record a supported format. Please type instead.",
      );
    const chunks = [];
    const start = Date.now();
    const activeRecorder = new MediaRecorder(activeStream, { mimeType: mime });
    recorder = activeRecorder;
    activeRecorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const timer = setInterval(() => {
      if (!isCurrentRecording(job)) {
        if (activeRecorder.state === "recording") activeRecorder.stop();
        return;
      }
      $("record-status").textContent =
        `Recording · ${Math.floor((Date.now() - start) / 1000)} / 60 seconds`;
      if (Date.now() - start >= 60000 && activeRecorder.state === "recording")
        activeRecorder.stop();
    }, 250);
    activeRecorder.onstop = () => {
      clearInterval(timer);
      activeStream.getTracks().forEach((track) => {
        track.stop();
      });
      if (!isCurrentRecording(job)) return;
      audioBlob = new Blob(chunks, { type: mime.split(";")[0] });
      if ($("playback").src.startsWith("blob:"))
        URL.revokeObjectURL($("playback").src);
      $("playback").src = URL.createObjectURL(audioBlob);
      $("playback").hidden = false;
      $("transcribe").hidden = false;
      $("stop").hidden = true;
      $("record").disabled = false;
      $("record-status").textContent =
        "Recording stays on your phone until you choose Transcribe.";
    };
    activeRecorder.start();
    $("stop").hidden = false;
    $("transcribe").hidden = true;
  } catch (e) {
    if (!isCurrentRecording(job)) return;
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    if (isCurrentRecording(job)) $("record").disabled = false;
    status(e.message, true);
  }
};
$("stop").onclick = () => {
  if (recorder?.state === "recording") recorder.stop();
};
async function pollRecording(job) {
  if (!isCurrentRecording(job)) return;
  try {
    const item = await api(`/api/recordings/${job.id}`);
    if (!isCurrentRecording(job)) return;
    $("record-status").textContent = item.state;
    if (item.state === "succeeded") {
      transcript = item.transcript;
      transcriptRecordingId = job.id;
      $("transcript-preview").textContent = transcript;
      $("use-transcript").hidden = false;
      $("retry-audio").hidden = true;
    } else if (["failed", "interrupted", "expired"].includes(item.state)) {
      $("record-status").textContent = item.error;
      $("retry-audio").hidden = item.state === "expired";
    } else setTimeout(() => void pollRecording(job), 1500);
  } catch (e) {
    if (!isCurrentRecording(job)) return;
    $("record-status").textContent = e.message;
    $("transcribe").hidden = false;
  }
}
$("transcribe").onclick = async () => {
  const job = {
    id: recordingId,
    round: recordingRound,
    generation: recordingGeneration,
  };
  const blob = audioBlob;
  if (!job.id || !job.round || !blob || !isCurrentRecording(job)) return;
  try {
    $("transcribe").hidden = true;
    $("record-status").textContent = "Uploading…";
    await api(`/api/recordings/${job.id}?round=${job.round}`, blob, blob.type);
    if (isCurrentRecording(job)) await pollRecording(job);
  } catch (e) {
    if (!isCurrentRecording(job)) return;
    $("record-status").textContent = e.message;
    $("transcribe").hidden = false;
  }
};
$("retry-audio").onclick = async () => {
  const job = {
    id: recordingId,
    round: recordingRound,
    generation: recordingGeneration,
  };
  if (!job.id || !job.round || !isCurrentRecording(job)) return;
  try {
    await api("/api/recording-retry", { id: job.id });
    if (isCurrentRecording(job)) await pollRecording(job);
  } catch (e) {
    if (!isCurrentRecording(job)) return;
    status(e.message, true);
  }
};
$("use-transcript").onclick = () => {
  if (
    !transcriptRecordingId ||
    transcriptRecordingId !== recordingId ||
    recordingRound !== roundId
  ) {
    status("This recording belongs to an earlier round.", true);
    return;
  }
  $("text").value = transcript;
  sourceRecording = transcriptRecordingId;
  retainDraft();
  void save(false);
  $("use-transcript").hidden = true;
  status(
    state?.round?.mode === "continuous"
      ? "Transcript added. Saved text goes to the selected model while the voice is running and may inform the public voice; there is no confirmation step."
      : "Review and correct your draft, then confirm it.",
  );
};
window.addEventListener("pagehide", () => {
  recordingGeneration++;
  if (recorder?.state === "recording") recorder.stop();
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
});
void refresh();
setInterval(refresh, 3000);
