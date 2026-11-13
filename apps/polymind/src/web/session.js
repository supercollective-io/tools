const $ = (id) => document.getElementById(id);
const session = new URL(location.href).searchParams.get("session");
let state,
  pending,
  saving = false,
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
  editorGeneration = 0,
  personalSignature = "";
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
      }),
    );
}
function makeRevision(expectedRevision = state.contribution?.revision ?? 0) {
  return {
    requestId: crypto.randomUUID(),
    roundId,
    expectedRevision,
    text: $("text").value,
    confirmed:
      state.round.mode !== "continuous" && Boolean($("text").value.trim()),
    matching:
      state.round.mode !== "continuous" && Boolean($("text").value.trim()),
    source: sourceRecording ? "transcript" : "typed",
    ...(sourceRecording ? { recordingId: sourceRecording } : {}),
  };
}
function updateConflict(latest) {
  conflict = latest;
  $("conflict-text").textContent = latest
    ? latest.text || "(No text was saved.)"
    : "Could not load the saved version. Refresh it before replacing it.";
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
        "The round changed. Your unsaved text is still in this browser.",
        true,
      );
      return;
    }
    state = { ...state, ...latestState };
    updateConflict(
      latestState.contribution ?? { revision: 0, text: "", confirmed: false },
    );
    $("conflict").hidden = false;
    status(
      "This contribution was edited in another window. Choose which text to keep.",
      false,
    );
  } catch (error) {
    if (generation !== editorGeneration) return;
    updateConflict(undefined);
    $("conflict").hidden = false;
    status(`Could not read the latest saved version: ${error.message}`, true);
  }
}
async function save() {
  if (
    !participantId ||
    state?.participant?.id !== participantId ||
    !roundId ||
    !state.round?.open ||
    !state.session.open
  )
    return;
  if (conflict) {
    retainDraft();
    status(
      "This contribution was edited in another window. Choose which text to keep.",
      true,
    );
    return;
  }
  if (saving) return;
  saving = true;
  const sentRound = roundId;
  const generation = editorGeneration;
  try {
    pending ??= makeRevision();
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
    const latest = makeRevision();
    const changed =
      latest.text !== saved.text ||
      latest.confirmed !== saved.confirmed ||
      latest.matching !== saved.matching ||
      latest.recordingId !== saved.recordingId;
    if (changed) {
      retainDraft();
      debounce = setTimeout(() => void save(), 20);
    } else {
      localStorage.removeItem(draftKey(roundId));
      $("saved").textContent = "Saved";
    }
  } catch (error) {
    if (generation !== editorGeneration) return;
    if (
      error.status === 409 &&
      /changed in another window|request id reused with different input/i.test(
        error.message,
      )
    ) {
      $("conflict").hidden = false;
      updateConflict(undefined);
      retainDraft();
      status(
        "This contribution was edited in another window. Choose which text to keep.",
        true,
      );
      await readConflict();
    } else if (error.status === undefined) {
      reconnecting = true;
      status(
        "Connection lost. Your words remain in this browser. Reconnecting…",
        true,
        "transient",
      );
    } else status(`${error.message} Your words remain in this browser.`, true);
    $("saved").textContent = conflict
      ? "Not saved — choose which text to keep."
      : error.status === 409
        ? "Writing closed. These unsaved changes are not included."
        : "Not yet saved — retrying…";
  } finally {
    if (generation === editorGeneration) saving = false;
  }
}
$("text").addEventListener("input", () => {
  editVersion++;
  retainDraft();
  $("saved").textContent = "Unsaved changes";
  clearTimeout(debounce);
  const version = editVersion;
  debounce = setTimeout(() => {
    if (version === editVersion) void save();
  }, 500);
});
$("read-conflict").onclick = () => void readConflict();
$("keep-saved").onclick = () => {
  if (!conflict) return;
  state.contribution = conflict;
  $("text").value = conflict.text;
  sourceRecording = conflict.recordingId;
  pending = undefined;
  conflict = undefined;
  clearTimeout(debounce);
  localStorage.removeItem(draftKey(roundId));
  $("conflict").hidden = true;
  $("saved").textContent = "Saved";
  status("", false, "routine");
};
$("rebase").onclick = async () => {
  if (!conflict || $("rebase").disabled) return;
  const localText = $("text").value;
  const latest = conflict;
  const priorSource = pending?.source === "transcript" ? pending : undefined;
  state.contribution = latest;
  pending = {
    ...makeRevision(latest.revision),
    text: localText,
    ...(priorSource?.recordingId
      ? { source: "transcript", recordingId: priorSource.recordingId }
      : {}),
  };
  conflict = undefined;
  $("conflict").hidden = true;
  retainDraft();
  status("", false, "routine");
  await save();
};
$("join").onsubmit = async (event) => {
  event.preventDefault();
  resetEditor();
  participantId = undefined;
  try {
    const result = await api("/api/join", {
      name: $("name").value,
    });
    if (result.recovery) {
      $("recovery").hidden = false;
      $("recovery").textContent =
        `Private recovery code — use this to recover your place in another browser: ${result.recovery}`;
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
$("help-reason").onchange = () => {
  $("help").disabled = !$("help-reason").value;
};
$("help").onclick = async () => {
  if (!$("help-reason").value) return;
  try {
    await api("/api/help", { reason: $("help-reason").value });
    status("Request sent to the organiser.");
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
function renderPerspective(next) {
  const closed = next.round?.mode === "bounded" && !next.round.open;
  $("closed-writing").hidden = !closed || !next.participant;
  const perspective = next.personalAnalysis;
  const own = perspective?.contribution ?? next.contribution;
  $("frozen-question").textContent = own?.prompt ?? next.round?.prompt ?? "";
  $("frozen-writing").textContent =
    own?.text || "No writing was included from you in this round.";
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(draftKey(roundId)) ?? "null");
  } catch {
    /* Preserve an unreadable draft without presenting it as saved. */
  }
  const excluded =
    closed && draft && draft.text !== (next.contribution?.text ?? "");
  $("excluded-draft").hidden = !excluded;
  $("excluded-text").textContent = excluded ? draft.text : "";
  $("personal").hidden = !next.participant || !perspective;
  const signature = JSON.stringify(perspective ?? null);
  if (signature === personalSignature) return;
  personalSignature = signature;
  $("personal-findings").replaceChildren();
  if (!perspective) return;
  const categories = {
    commonGround: "Common ground",
    differences: "Differences",
    questions: "Core questions",
    otherConcerns: "Other concerns",
  };
  let count = 0;
  for (const [key, label] of Object.entries(categories)) {
    const findings = perspective.analysis?.[key] ?? [];
    if (!findings.length) continue;
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = label;
    section.append(heading);
    for (const finding of findings) {
      count++;
      const title = document.createElement("h4");
      title.textContent = finding.title;
      const text = document.createElement("p");
      text.textContent = finding.text;
      section.append(title, text);
      for (const evidence of finding.evidence ?? []) {
        const quote = document.createElement("blockquote");
        quote.textContent = evidence.text;
        section.append(quote);
      }
    }
    $("personal-findings").append(section);
  }
  const note = document.createElement("p");
  note.textContent = count
    ? "Your contribution appears in these findings."
    : perspective.contribution
      ? "Your contribution is not explicitly represented in this overview."
      : "No writing was included from you in this round.";
  $("personal-findings").append(note);
}
function boundedStatus(next) {
  if (next.round?.mode !== "bounded" || next.round.open) return null;
  if (
    next.encounters?.some(
      (item) => !item.roundId || item.roundId === next.round.id,
    )
  )
    return "Your encounter";
  if (next.show?.analysisState === "succeeded") return "Analysis complete";
  if (["queued", "running"].includes(next.show?.analysisState))
    return "Writing closed. Analysis in progress.";
  return "Writing closed";
}
function resetEditor() {
  editorGeneration++;
  editVersion++;
  clearTimeout(debounce);
  saving = false;
  pending = undefined;
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
  personalSignature = "";
  $("personal").hidden = true;
  $("personal-findings").replaceChildren();
  $("closed-writing").hidden = true;
  status("", false, "routine");
}
async function refresh() {
  if (!session) {
    $("prompt").textContent = "Invitation needed";
    status("Open the full participant link supplied by the organiser.", true);
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
    $("hub").href = next.hubUrl;
    $("prompt").textContent =
      boundedStatus(next) ??
      next.round?.prompt ??
      "Waiting for the next question.";
    $("join").hidden = !!next.participant || !next.session.open;
    $("recover").hidden = !!next.participant;
    $("capture").hidden =
      !next.participant ||
      !next.round ||
      (next.round.mode === "bounded" && !next.round.open);
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
        sourceRecording =
          draft?.pending?.source === "transcript"
            ? draft.pending.recordingId
            : next.contribution?.recordingId;
        $("saved").textContent = draft
          ? "Restoring unsaved changes…"
          : next.contribution
            ? "Saved"
            : "";
        if (draft && next.round.open && next.session.open)
          debounce = setTimeout(() => void save(), 20);
      }
      const open = next.session.open && next.round?.open;
      if (!open && recorder?.state === "recording") recorder.stop();
      $("text").disabled = !open;
      if (conflict)
        $("rebase").disabled = !next.round?.open || !next.session.open;
      const continuous = next.round?.mode === "continuous";
      $("participation-notice").hidden = false;
      $("participation-notice").textContent = continuous
        ? "While the voice runs, saved text goes to the selected model and may inform the public voice. "
        : "Saved writing is included in collective analysis and matching. The organiser may also publish your original words in the room’s atlas after review.";
      $("audio-controls").hidden =
        !next.capture.enabled || !open || !window.MediaRecorder;
      $("retention").textContent =
        next.capture.retention +
        (next.capture.enabled
          ? ` Recording uses ${next.capture.provider} (${next.capture.model}). Check the transcript before adding it to your contribution.`
          : "");
      const hasEncounter = next.encounters.length > 0;
      $("matches-title").hidden = !hasEncounter;
      for (const id of ["help-absent", "help-decline"]) {
        $(id).hidden = !hasEncounter;
        $(id).disabled = !hasEncounter;
      }
      if (
        !hasEncounter &&
        ["absent", "decline"].includes($("help-reason").value)
      ) {
        $("help-reason").value = "";
      }
      $("help").disabled = !$("help-reason").value;
      matches(next.encounters);
      if (pending && !conflict && open) void save();
      if (!open) {
        clearTimeout(debounce);
        if (recorder?.state === "recording") recorder.stop();
        $("use-transcript").hidden = true;
        $("transcribe").hidden = true;
      }
      renderPerspective(next);
      if (recovered && statusKind === "transient")
        status("Connection restored.", false, "routine");
      else if (statusKind === "routine")
        status(
          open
            ? ""
            : next.round?.mode === "bounded"
              ? ""
              : "Contributions are closed. Your matches remain available.",
          false,
          "routine",
        );
    } else
      status(
        next.session.open
          ? ""
          : "Joining has closed. You can still recover an existing place.",
        false,
        recovered && statusKind === "transient" ? "routine" : statusKind,
      );
    $("collective").hidden =
      !next.voice?.text ||
      Boolean(next.show?.presentation && next.show.presentation !== "voice");
    $("voice").textContent = next.voice?.text ?? "";
  } catch (e) {
    if (e.status === 400 || e.status === 404) {
      reconnecting = false;
      $("prompt").textContent = "Invitation unavailable";
      status(
        "This participant link is incomplete or no longer valid. Ask the organiser for the current session link.",
        true,
      );
    } else {
      reconnecting = true;
      status(`${e.message} Reconnecting…`, true, "transient");
    }
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
    if (
      !isCurrentRecording(job) ||
      !state?.session.open ||
      !state?.round?.open
    ) {
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
        `Recording · ${Math.floor((Date.now() - start) / 1000)} seconds`;
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
    $("record-status").textContent =
      item.state === "succeeded" ? "Transcript ready." : item.state;
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
    recordingRound !== roundId ||
    !state?.round?.open ||
    !state?.session?.open
  ) {
    status("This recording belongs to an earlier round.", true);
    return;
  }
  $("text").value = transcript;
  sourceRecording = transcriptRecordingId;
  retainDraft();
  void save();
  $("use-transcript").hidden = true;
  status("Transcript added to your contribution.");
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
