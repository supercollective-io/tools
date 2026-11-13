const $ = selector => document.querySelector(selector);
const node = (tag, text) => { const item = document.createElement(tag); item.textContent = text; return item; };

export function runPreparation({ getState, installed, blocked = () => false, beforeInstall = () => true, launched = () => {} }) {
  let selected, profiles = [], busy = false, dirty = false, roomDirty = false, editing, displayedRun;
  const host = $('#run-preparation');
  host.innerHTML = `
    <h3>Show profiles</h3>
    <p class="aside">Choose a profile and launch the show. Its sessions are prepared and its programme is loaded, keeping the entrance on waiting until you choose a cue.</p>
    <section id="new-run">
      <form id="run-form" autocomplete="off">
        <label class="field">Profile<select name="profile"></select></label>
        <p class="aside">Launching an existing production run keeps its saved settings.</p>
        <details id="run-overrides"><summary>Profile settings and overrides</summary>
        <label class="field">Individual recording question<textarea name="writingQuestion" maxlength="2000" required></textarea></label>
        <p class="aside">For 1 → All, configure Polymind transcription before the show and test phone microphone access. Participants review and save their transcripts in 1; close collection without analysis, then analyse the same frozen round at All. Successfully transcribed audio is deleted; the reviewed text is retained.</p>
        <label class="field">Collective Voice question<textarea name="voiceQuestion" maxlength="2000" required></textarea></label>
        <h4>Polymind analysis model</h4>
        <div class="run-fields">
          <label class="field">Text provider<select name="provider"><option value="openai">OpenAI</option><option value="ollama">Ollama</option></select></label>
          <label class="field">Reasoning effort<select name="reasoningEffort"><option value="">Provider default</option><option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label class="field">Exact text model ID<input name="model" maxlength="150" required autocomplete="off" spellcheck="false"></label>
        </div>
        <details><summary>Model budgets</summary><div class="run-fields">
          <label class="field">Maximum input characters<input name="maxInputCharacters" type="number" min="1" max="1000000" value="500000" required></label>
          <label class="field">Maximum output tokens<input name="maxOutputTokens" type="number" min="100" max="16000" value="4096" required></label>
          <label class="field">Timeout (seconds)<input name="timeout" type="number" min="1" max="360" value="360" required></label>
        </div></details>
        <h4>Collective Voice model</h4>
        <div class="run-fields">
          <label class="field">Voice provider<select name="voiceProvider"><option value="openai">OpenAI</option><option value="ollama">Ollama</option></select></label>
          <label class="field">Voice model ID<input name="voiceModel" maxlength="150" required autocomplete="off" spellcheck="false"></label>
          <label class="field">Voice reasoning effort<select name="voiceReasoningEffort"><option value="">Provider default</option><option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        </div>
        <details><summary>Voice model budgets</summary><div class="run-fields">
          <label class="field">Voice maximum input characters<input name="voiceMaxInputCharacters" type="number" min="1" max="1000000" required></label>
          <label class="field">Voice maximum output tokens<input name="voiceMaxOutputTokens" type="number" min="100" max="16000" required></label>
          <label class="field">Voice timeout (seconds)<input name="voiceTimeout" type="number" min="1" max="360" required></label>
        </div></details>
        <label class="field">Puck question<input name="puckQuestion" maxlength="240" required autocomplete="off"></label>
        <label class="field">Puck answers — one per line<textarea name="puckOptions"></textarea></label>
        <p class="aside">Leave answers empty to collect them from the room during the show. The question is prepared now; the room is created once its answers are known.</p>
        <p class="aside">Flight’s invitation is retrieved automatically from the profile’s connected Flight service.</p><details><summary>Override Flight participant invitation</summary><label class="field">Participant invitation<input name="flightUrl" type="url" autocomplete="off" spellcheck="false"></label></details>
        <p class="aside">Copy Flight’s audience invitation. Leave blank to keep Flight unavailable until you connect it in the invitation editor. Keep the bridge credential in the simulator’s private configuration.</p>
        <button type="submit" id="create-rehearsal" value="rehearsal">Launch fresh rehearsal</button>
        </details>
        <div class="run-actions"><button type="submit" class="button" id="create-production" value="production">Launch show</button><button type="button" id="cancel-run-edit" hidden>Cancel run editing</button></div>
        <button type="button" id="reset-run-request" hidden>Discard interrupted request</button>
      </form>
    </section>
    <details id="saved-runs"><summary>Saved runs and recovery</summary>
    <label class="field">Saved run<select id="saved-run" name="savedRun"></select></label>
    <div class="run-actions"><button type="button" id="resume-run">Resume preparation</button><button type="button" id="refresh-runs">Refresh saved runs</button></div>
    </details>
    <p id="run-feedback" role="status" aria-live="polite" tabindex="-1"></p>
    <section id="selected-run" hidden aria-label="Selected run">
      <h4 id="selected-run-name"></h4><p id="run-sequence"></p>
      <p id="run-puck-question"></p>
      <button type="button" id="edit-run" hidden>Edit unprepared run</button>
      <ul id="run-resources"></ul>
      <form id="room-options" autocomplete="off"><label class="field">Answers proposed by the room — two to six, one per line<textarea name="options" required></textarea></label><button type="submit">Prepare Puck with these options</button></form>
      <p class="aside">Flight: launch <code>karlsruhe-747-landing</code> before the show, wait for the bridge and approach readiness, and leave FlightGear paused. Recheck before the cue. Release phone controls before unpausing locally.</p>
      <div class="run-actions"><button type="button" id="prepare-run">Launch saved show</button></div>
      <p id="run-impact" class="aside"></p>
    </section>`;
  const form = $('#run-form');
  const say = (text, error = false) => { $('#run-feedback').textContent = text; $('#run-feedback').classList.toggle('error', error); };
  async function api(path, body) {
    const response = await fetch(`/api/operator/${path}`, {
      ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      cache: 'no-store', signal: AbortSignal.timeout(body ? 35000 : 8000),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error ?? 'Could not prepare the run. Refresh saved runs and retry.');
      error.status = response.status; throw error;
    }
    return result;
  }
  function lock() {
    for (const control of host.querySelectorAll('button, input, textarea, select')) control.disabled = busy || blocked();
    $('#resume-run').disabled ||= !$('#saved-run').value;
    form.elements.profile.disabled ||= Boolean(editing);
    $('#prepare-run').disabled ||= Boolean(editing);
    const state = getState();
    const current = state?.activities.find(item => item.id === state.activeId);
    const waiting = current?.kind === 'waiting';
    $('#create-production').disabled ||= !state || (!editing && !waiting);
    $('#create-rehearsal').disabled ||= !state || !waiting;
    $('#prepare-run').disabled ||= !selected || !state || (state.runId !== selected?.id && !waiting);
    $('#run-impact').textContent = state?.runId === selected?.id ? 'This programme is loaded. Launch saved show recovers its sessions and preserves the current cue.'
      : !waiting ? 'Return to waiting in Live cues before launching a show.'
      : 'Launching keeps the current waiting invitation. Choose the first cue when you are ready.';
  }
  function render() {
    $('#selected-run').hidden = !selected;
    if (selected) {
      if (displayedRun !== selected.id) {
        $('#room-options').elements.options.value = selected.settings.puckOptions.join('\n');
        roomDirty = false; displayedRun = selected.id;
      }
      $('#selected-run-name').textContent = `${selected.label} · ${selected.id.slice(0, 8)}`;
      $('#run-puck-question').textContent = `Puck: ${selected.settings.puckQuestion}${selected.settings.puckOptions.length ? ` Answers: ${selected.settings.puckOptions.join(' · ')}` : ' Question ready; collect the answer options with the room.'}`;
      $('#edit-run').hidden = Boolean(selected.preparationStarted || Object.keys(selected.bindings).length);
      $('#room-options').hidden = Boolean(selected.bindings.puck || selected.puckPreparationStarted);
      $('#run-sequence').textContent = selected.activities.map(item => item.label).join(' → ');
      $('#run-resources').replaceChildren(...selected.activities.filter(item => item.kind === 'activity').map(item =>
        node('li', `${item.label}: ${selected.bindings[item.id] ? 'prepared; check its current state before cueing' : item.id === 'polymind-all' && item.url ? 'shares the individual recording session; analyse its frozen round at All' : item.id === 'puck' && !selected.settings.puckOptions.length ? 'waiting for the room’s answer options' : item.url ? 'invitation saved; simulator readiness must be checked locally' : 'needs preparation'}`)));
    }
    lock();
  }
  async function action(operation) {
    if (busy) return;
    busy = true; lock();
    try { await operation(); }
    catch (error) {
      // Preparation may have committed its freeze marker or resource before an
      // upstream/network failure. Re-read before offering another action.
      if (selected) { try { selected = await api(`runs/${selected.id}`); } catch { /* Retain the last-known run with explicit recovery guidance below. */ } }
      say(error.name === 'TimeoutError' ? 'The request may have completed. Click Launch show again to recover it, or launch the saved run.' : `${error.message} Refresh saved state, then launch again to recover the same sessions.`, true);
      if (!$('#prepare').hidden) $('#run-feedback').focus();
    }
    finally { busy = false; render(); }
  }
  async function refresh() {
    const saved = await api('runs');
    const previous = selected?.id ?? $('#saved-run').value;
    $('#saved-run').replaceChildren(...saved.map(run => {
      const option = node('option', `${run.label} · ${new Date(run.createdAt).toLocaleString('en-GB')} · ${run.id.slice(0, 8)}`);
      option.value = run.id; return option;
    }));
    if (!saved.length) { const empty = node('option', 'No saved runs'); empty.value = ''; $('#saved-run').append(empty); }
    else if (saved.some(run => run.id === previous)) $('#saved-run').value = previous;
  }
  function fillVoice(model) {
    form.elements.voiceProvider.value = model.provider;
    form.elements.voiceModel.value = model.model;
    form.elements.voiceReasoningEffort.value = model.reasoningEffort ?? '';
    form.elements.voiceMaxInputCharacters.value = model.maxInputCharacters;
    form.elements.voiceMaxOutputTokens.value = model.maxOutputTokens;
    form.elements.voiceTimeout.value = model.timeoutMs / 1000;
  }
  function defaults() {
    const profile = profiles.find(item => item.id === form.elements.profile.value);
    if (!profile) return;
    form.elements.writingQuestion.value = profile.writingQuestion;
    form.elements.voiceQuestion.value = profile.voiceQuestion;
    form.elements.puckQuestion.value = profile.puckQuestion ?? '';
    form.elements.puckOptions.value = (profile.puckOptions ?? []).join('\n');
    form.elements.flightUrl.value = profile.flightUrl ?? '';
    if (profile.model) {
      fillVoice(profile.voiceModel ?? profile.model);
      for (const key of ['provider', 'model', 'maxInputCharacters', 'maxOutputTokens']) form.elements[key].value = profile.model[key];
      form.elements.reasoningEffort.value = profile.model.reasoningEffort ?? '';
      form.elements.timeout.value = profile.model.timeoutMs / 1000;
    }
  }
  const requestKey = 'hub-run-creation';
  function fillSettings(value) {
    fillVoice(value.voiceModel ?? value.model);
    for (const key of ['writingQuestion', 'voiceQuestion', 'puckQuestion', 'flightUrl']) form.elements[key].value = value[key];
    for (const key of ['provider', 'model', 'maxInputCharacters', 'maxOutputTokens']) form.elements[key].value = value.model[key];
    form.elements.reasoningEffort.value = value.model.reasoningEffort ?? '';
    form.elements.timeout.value = value.model.timeoutMs / 1000;
    form.elements.puckOptions.value = value.puckOptions.join('\n');
  }
  function editMode(value) {
    editing = value;
    $('#create-production').textContent = editing ? 'Save run settings' : 'Launch show';
    $('#create-rehearsal').hidden = Boolean(editing);
    $('#cancel-run-edit').hidden = !editing;
    $('#run-overrides > summary').textContent = editing ? 'Edit this run’s settings' : 'Profile settings and overrides';
  }
  function restoreRequest() {
    try {
      const pending = JSON.parse(sessionStorage.getItem(requestKey) ?? 'null');
      if (!pending) return;
      fillVoice(pending.settings.voiceModel ?? pending.settings.model);
      form.elements.profile.value = pending.profileId;
      for (const key of ['writingQuestion', 'voiceQuestion', 'puckQuestion', 'flightUrl']) form.elements[key].value = pending.settings[key];
      for (const key of ['provider', 'model', 'maxInputCharacters', 'maxOutputTokens']) form.elements[key].value = pending.settings.model[key];
      form.elements.reasoningEffort.value = pending.settings.model.reasoningEffort ?? '';
      form.elements.timeout.value = pending.settings.model.timeoutMs / 1000;
      form.elements.puckOptions.value = pending.settings.puckOptions.join('\n');
      $('#reset-run-request').hidden = false;
      say(`An interrupted ${pending.mode} creation request is retained. Retry the same creation action to recover it.`);
    } catch { say('Browser storage is unavailable. Enable it before creating a run so retries remain safe.', true); }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const mode = event.submitter?.value;
    if (!['production', 'rehearsal'].includes(mode)) return;
    void action(async () => {
      const fields = form.elements;
      const body = { profileId: fields.profile.value, mode, settings: {
        writingQuestion: fields.writingQuestion.value.trim(), voiceQuestion: fields.voiceQuestion.value.trim(),
        model: { ...(fields.provider.value === 'openai' && fields.reasoningEffort.value ? { reasoningEffort: fields.reasoningEffort.value } : {}), provider: fields.provider.value, model: fields.model.value.trim(), maxInputCharacters: Number(fields.maxInputCharacters.value), maxOutputTokens: Number(fields.maxOutputTokens.value), timeoutMs: Number(fields.timeout.value) * 1000 },
        voiceModel: { ...(fields.voiceProvider.value === 'openai' && fields.voiceReasoningEffort.value ? { reasoningEffort: fields.voiceReasoningEffort.value } : {}), provider: fields.voiceProvider.value, model: fields.voiceModel.value.trim(), maxInputCharacters: Number(fields.voiceMaxInputCharacters.value), maxOutputTokens: Number(fields.voiceMaxOutputTokens.value), timeoutMs: Number(fields.voiceTimeout.value) * 1000 },
        puckQuestion: fields.puckQuestion.value.trim(), puckOptions: fields.puckOptions.value.split('\n').map(item => item.trim()).filter(Boolean), flightUrl: fields.flightUrl.value.trim(),
      } };
      if (editing) {
        selected = await api(`runs/${editing.id}/settings`, { settings: body.settings, expectedRevision: editing.revision });
        editMode(undefined); dirty = false; $('#run-overrides').open = false;
        say('Run settings saved. No app has been prepared and the current entrance is unchanged.');
        return;
      }
      if (!beforeInstall()) return;
      const current = getState()?.activities.find(item => item.id === getState().activeId);
      if (current?.kind !== 'waiting') throw new Error('Return to waiting before launching a show.');
      const saved = await api('runs');
      const production = mode === 'production' && saved.find(run => run.profileId === body.profileId && run.mode === mode);
      if (production) {
        selected = await api(`runs/${production.id}`);
        dirty = false;
        await launch(); await refresh();
        return;
      }
      let pending = JSON.parse(sessionStorage.getItem(requestKey) ?? 'null');
      if (pending && JSON.stringify({ profileId: pending.profileId, mode: pending.mode, settings: pending.settings }) !== JSON.stringify(body)) throw new Error('An interrupted request has different settings. Retry its original settings, or discard that request after checking saved runs.');
      pending ??= { ...body, requestId: crypto.randomUUID() };
      sessionStorage.setItem(requestKey, JSON.stringify(pending)); $('#reset-run-request').hidden = false;
      say('Saving the run recipe…');
      try { selected = await api('runs', pending); }
      catch (error) {
        if (error.status === 400) { sessionStorage.removeItem(requestKey); $('#reset-run-request').hidden = true; }
        throw error;
      }
      dirty = false;
      await refresh(); $('#run-overrides').open = false;
      await launch();
    });
  });
  $('#resume-run').onclick = () => void action(async () => {
    if (((editing && dirty) || roomDirty) && !window.confirm('Discard unsaved run settings or room options and resume the selected run?')) return;
    if (editing) dirty = false;
    editMode(undefined);
    selected = await api(`runs/${encodeURIComponent($('#saved-run').value)}`);
    $('#room-options').elements.options.value = selected.settings.puckOptions.join('\n'); roomDirty = false;
    say('Run resumed. Existing sessions and rooms are retained. The current entrance has not changed.');
  });
  $('#edit-run').onclick = () => {
    if (dirty && !window.confirm('Replace the unsaved form with this run’s saved settings?')) return;
    editMode({ id: selected.id, revision: selected.revision });
    form.elements.profile.value = selected.profileId;
    fillSettings(selected.settings); dirty = false; $('#run-overrides').open = true;
    lock(); form.elements.writingQuestion.focus();
  };
  $('#cancel-run-edit').onclick = () => {
    if (dirty && !window.confirm('Discard unsaved run settings?')) return;
    editMode(undefined); dirty = false; $('#run-overrides').open = false; lock();
  };
  $('#refresh-runs').onclick = () => void action(async () => { await refresh(); say('Saved runs refreshed.'); });
  $('#reset-run-request').onclick = () => {
    if (!window.confirm('Discard this retry record? A run may already exist. Check saved runs before creating another.')) return;
    try { sessionStorage.removeItem(requestKey); $('#reset-run-request').hidden = true; say('Ready for a new request.'); }
    catch { say('Could not clear browser storage.', true); }
  };
  async function launch() {
    // Keep the revision from before remote preparation: a concurrent cue must
    // reject installation instead of silently replacing another operator's work.
    const expectedRevision = getState().revision;
    for (const activityId of ['polymind', 'collective-voice', 'puck', 'flight']) {
      if (activityId === 'puck' && !selected.settings.puckOptions.length) continue;
      say(`Launching show: preparing ${selected.activities.find(item => item.id === activityId).label}…`);
      const result = await api(`runs/${selected.id}/prepare`, { activityId });
      selected = result.run; render();
    }
    installed(await api(`runs/${selected.id}/use`, { expectedRevision }));
    if (JSON.parse(sessionStorage.getItem(requestKey) ?? 'null')?.requestId === selected.requestId) {
      sessionStorage.removeItem(requestKey); $('#reset-run-request').hidden = true;
    }
    dirty = false;
    say(`Show launched. Programme loaded into Live cues. ${selected.bindings.puck ? 'Puck is prepared.' : 'Puck is waiting for the room’s options.'} Check Flight locally.`);
    launched();
  }
  $('#prepare-run').onclick = () => void action(async () => {
    if (!beforeInstall()) return;
    await launch();
  });
  $('#room-options').onsubmit = event => {
    event.preventDefault();
    void action(async () => {
      const options = $('#room-options').elements.options.value.split('\n').map(item => item.trim()).filter(Boolean);
      selected = await api(`runs/${selected.id}/puck-options`, { options, expectedRevision: selected.revision });
      roomDirty = false;
      const result = await api(`runs/${selected.id}/prepare`, { activityId: 'puck' });
      selected = result.run;
      if (getState().runId === selected.id) installed(await api(`runs/${selected.id}/use`, { expectedRevision: getState().revision }));
      say('Puck is prepared with the room’s options. Show its invitation in Live cues, then start its round in Puck controls.');
    });
  };
  form.elements.profile.onchange = defaults;
  form.addEventListener('invalid', event => {
    for (let parent = event.target.parentElement; parent && parent !== form; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
  }, true);
  form.addEventListener('input', () => { dirty = true; });
  $('#room-options').addEventListener('input', () => { roomDirty = true; });
  void action(async () => {
    profiles = await api('profiles');
    form.elements.profile.replaceChildren(...profiles.map(profile => { const option = node('option', profile.label); option.value = profile.id; return option; }));
    defaults(); restoreRequest(); await refresh();
  });
  return { update: render, isBusy: () => busy, hasUnsavedChanges: () => dirty || roomDirty,
    openRun: async (id, activityId) => {
      if (((editing && dirty) || roomDirty) && !window.confirm('Discard unsaved run settings or room options and open the current run?')) return;
      await action(async () => {
        if (editing) dirty = false;
        editMode(undefined); selected = await api(`runs/${encodeURIComponent(id)}`);
        $('#room-options').elements.options.value = selected.settings.puckOptions.join('\n'); roomDirty = false;
        say(activityId === 'puck' ? `Puck question: ${selected.settings.puckQuestion} Collect the room’s answers below.` : 'Prepare the saved activities below. This does not start them.');
      });
      $('#selected-run').scrollIntoView({ block: 'start' });
      if (activityId === 'puck' && !$('#room-options').hidden) $('#room-options').elements.options.focus();
      else $('#prepare-run').focus();
    } };
}
