import { runPreparation } from './run-preparation.js';
const $ = selector => document.querySelector(selector);
const form = $('#programme');
const feedback = $('#feedback');
let state;
let origins = [];
let appOrigins = {};
let integrations = {};
let appBusy = false;
let availableSessions = [];
let preparationVersion = 0;
const reportedStatus = new Map();
let editingId;
let dirty = false;
let busy = false;
let uncertain = false;
let mode = new URL(location.href).searchParams.get('view') === 'preparation' ? 'prepare' : 'run';
let polling = false;
let runTools;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action) {
  const node = element('button', text);
  node.type = 'button'; node.addEventListener('click', action);
  return node;
}
function link(text, href) {
  const node = element('a', text);
  node.href = href; node.target = '_blank'; node.rel = 'noopener';
  return node;
}
function say(message, error = false) {
  feedback.textContent = message;
  feedback.classList.toggle('error', error);
}
function lock() {
  $('#current-heading').textContent = uncertain ? 'Last known entrance' : 'On the entrance now';
  for (const control of document.querySelectorAll('button, #programme input, #programme select, #programme textarea')) {
    if (control.closest('#run-preparation')) continue;
    control.disabled = busy || appBusy || (!state && control.id !== 'reload');
  }
  for (const control of document.querySelectorAll('[data-cue]')) {
    control.disabled ||= uncertain || control.dataset.cue === state?.activeId;
  }
  form.querySelector('[type=submit]').disabled ||= uncertain;
  $('#connect-session').disabled ||= !availableSessions.length || uncertain;
  $('#create-session').disabled ||= !integrations[form.elements.app.value] || uncertain;
  $('#add').disabled ||= (state?.activities.length ?? 0) >= 20;
  form.elements.origin.disabled ||= Boolean(form.elements.destination.value.trim()) && !/^[/?]/.test(form.elements.destination.value.trim());
  runTools?.update();
}
function showMode(next) {
  mode = next;
  const address = new URL(location.href);
  address.searchParams.set('view', next === 'prepare' ? 'preparation' : 'live');
  history.replaceState(null, '', address);
  $('#run').hidden = next !== 'run' || !state;
  $('#prepare').hidden = next !== 'prepare' || !state;
  for (const [id, selected] of [['run-view', next === 'run'], ['prepare-view', next === 'prepare']]) {
    const tab = $(`#${id}`);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
}
function ready(activity) { return activity.status === 'ready'; }
function description(activity) {
  if (!ready(activity)) return 'Needs preparation';
  return { activity: 'Link saved · check before showing', analogue: 'In person', waiting: 'Waiting', closed: 'Closing' }[activity.kind];
}
function cueButton(activity, label = `Show invitation: ${activity.label}`) {
  const node = button(label, () => cue(activity));
  node.dataset.cue = activity.id;
  return node;
}
function appFor(activity) {
  if (activity.url) {
    const url = new URL(activity.url);
    if (appOrigins.polymind && url.origin === appOrigins.polymind &&
      activity.id === 'collective-voice') return 'collective-voice';
    return Object.keys(appOrigins).find(id => url.origin === appOrigins[id]);
  }
  return activity.id === 'collective-voice' ? 'collective-voice' : Object.hasOwn(appOrigins, activity.id) ? activity.id : undefined;
}
function connectionFor(activity) {
  if (!activity.url) return null;
  const app = appFor(activity);
  if (!app) return null;
  const url = new URL(activity.url);
  const apiApp = app === 'collective-voice' ? 'polymind' : app;
  const id = apiApp === 'polymind' ? url.searchParams.get('session') : /^\/room\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname)?.[1];
  return id && /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? { app: apiApp, id, view: app } : null;
}
const statusLabels = { 'writing-open': 'Writing open', 'writing-closed': 'Writing not open', 'microphone-open': 'Microphone open',
  closed: 'Session closed', waiting: 'Waiting for a round', countdown: 'Countdown', active: 'Round running', selected: 'Round finished',
  'timed-out': 'Round finished', cancelled: 'Round cancelled', interrupted: 'Round interrupted', unknown: 'Status unknown' };
function statusText(activity) {
  if (activity.url && new URL(activity.url).origin === 'https://fly.supercollective.io') return 'Simulator readiness not checked here';
  const connection = connectionFor(activity);
  if (!connection) return '';
  if (!integrations[connection.app]) return 'App status: connection not configured';
  const report = reportedStatus.get(`${connection.app}:${connection.id}`);
  if (!report) return 'App status: not checked';
  const time = new Date(report.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return report.error ? `App status: unavailable${report.previous ? ` · Last checked ${time}: ${statusLabels[report.previous] ?? 'Unknown'}` : ''}`
    : `App status: ${statusLabels[report.status] ?? 'Status unknown'} · Checked ${time}`;
}
async function appApi(app, id, body) {
  const response = await fetch(`/api/operator/apps/${app}/sessions${id ? `/${encodeURIComponent(id)}` : ''}`, {
    ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Could not access the app. Try again.');
  return result;
}
async function checkActivities(manual = false) {
  if (!state || busy || appBusy || document.hidden) return;
  if (manual) say('Checking app status…');
  const connections = new Map(state.activities.map(activity => connectionFor(activity)).filter(Boolean).map(item => [`${item.app}:${item.id}`, item]));
  await Promise.all([...connections].map(async ([key, item]) => {
    if (!integrations[item.app]) return;
    const previous = reportedStatus.get(key);
    try { reportedStatus.set(key, await appApi(item.app, item.id)); }
    catch { reportedStatus.set(key, { error: true, checkedAt: previous?.checkedAt, previous: previous?.status ?? previous?.previous }); }
  }));
  for (const node of document.querySelectorAll('[data-app-status]')) {
    const activity = state.activities.find(item => item.id === node.dataset.appStatus);
    if (activity) node.textContent = statusText(activity);
  }
  if (manual) say('App checks updated. Saved invitations are unchanged.');
}
async function loadSessions() {
  const version = ++preparationVersion;
  const app = form.elements.app.value;
  availableSessions = []; form.elements.existing.replaceChildren();
  if (app === 'manual') return;
  if (!integrations[app]) {
    $('#app-feedback').textContent = 'This app connection needs installation setup. Its access token and participant website must be enabled before you can prepare it here.';
    lock(); return;
  }
  $('#app-feedback').textContent = 'Loading activities…';
  try {
    const result = await appApi(app);
    if (version !== preparationVersion) return;
    availableSessions = result;
    for (const item of result) {
      const option = element('option', `${item.title} · ${statusLabels[item.status] ?? 'Status unknown'}`);
      option.value = item.id; form.elements.existing.append(option);
    }
    $('#app-feedback').textContent = result.length ? 'Choose an existing activity, or create a new one below.' : 'No activities yet. Create one below.';
  } catch (error) { if (version === preparationVersion) $('#app-feedback').textContent = error.message; }
  finally { lock(); }
}
function connectSession(item) {
  form.elements.kind.value = 'activity';
  form.elements.destination.value = item.url;
  if (form.elements.label.value === 'New invitation') form.elements.label.value = item.title.slice(0, 100);
  dirty = true; updateFields();
  reportedStatus.set(`${form.elements.app.value}:${item.id}`, item);
  // The usual save path retains revision checks and live-edit confirmation.
  form.requestSubmit();
}
async function createSession() {
  if (busy || appBusy || uncertain) return;
  const app = form.elements.app.value;
  const settings = app === 'polymind' ? { title: form.elements.sessionTitle.value.trim(), capacity: Number(form.elements.capacity.value) }
    : { question: form.elements.question.value.trim(), options: form.elements.options.value.split('\n').map(value => value.trim()).filter(Boolean), mode: 'baseline' };
  if (app === 'polymind' ? !settings.title || !Number.isInteger(settings.capacity) || settings.capacity < 2 || settings.capacity > 180
    : !settings.question || settings.options.length < 2 || settings.options.length > 6 || settings.options.some(value => value.length > 48) || new Set(settings.options.map(value => value.toLowerCase())).size !== settings.options.length) {
    $('#app-feedback').textContent = 'Enter a session name and capacity of 2–180, or a question with two to six distinct options.'; return;
  }
  const storageKey = `hub-create:${app}`;
  let request;
  try {
    request = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (request && JSON.stringify(request.settings) !== JSON.stringify(settings)) {
      $('#app-feedback').textContent = 'A request was already made with different settings. Retry those settings, or choose “Start a different creation request”.'; return;
    }
    request ??= { requestId: crypto.randomUUID(), settings };
    sessionStorage.setItem(storageKey, JSON.stringify(request));
  } catch { $('#app-feedback').textContent = 'Browser storage is unavailable. Enable it so interrupted creation requests can be recovered safely.'; return; }
  appBusy = true; lock(); $('#app-feedback').textContent = 'Creating or recovering activity…';
  try {
    const item = await appApi(app, undefined, { requestId: request.requestId, settings: request.settings });
    request.resultId = item.id; sessionStorage.setItem(storageKey, JSON.stringify(request));
    appBusy = false; lock(); connectSession(item);
  } catch (error) {
    $('#app-feedback').textContent = `${error.message} Retry with the same settings to recover the activity.`;
  } finally { appBusy = false; lock(); }
}
function controlsLink(app, activity) {
  if (app === 'polymind' || app === 'collective-voice') {
    const url = new URL('/operator', appOrigins.polymind);
    const session = activity?.url ? new URL(activity.url).searchParams.get('session') : null;
    if (session) url.searchParams.set('session', session);
    const label = app === 'collective-voice' ? 'Collective Voice' : 'Polymind';
    return link(session ? `${label} session controls ↗` : `${label} controls ↗`, url.href);
  }
  const connection = activity && connectionFor(activity);
  return link(connection ? 'Puck room controls ↗' : 'Puck controls ↗', connection
    ? `${appOrigins.puck}/operator?room=${encodeURIComponent(connection.id)}` : `${appOrigins.puck}/operator`);
}
function renderAppControls() {
  $('#app-controls').hidden = false;
  $('#app-links').replaceChildren();
  for (const app of ['polymind', 'collective-voice', 'puck']) {
    const matches = state.activities.filter(activity => appFor(activity) === app && activity.url);
    const activity = matches.find(item => item.id === state.activeId) ?? matches[0];
    const item = element('div');
    item.append(controlsLink(app, activity));
    item.append(element('p', activity ? `Saved invitation: ${activity.label}`
      : app === 'polymind' ? 'Create or select a writing session' : app === 'collective-voice' ? 'Prepare a separate voice session' : 'Set up the question and options', 'aside'));
    $('#app-links').append(item);
  }
}
function render() {
  const current = state.activities.find(activity => activity.id === state.activeId);
  const upcoming = state.activities[state.activities.findIndex(item => item.id === state.activeId) + 1];
  $('#current-operator-note').textContent = state.operatorNotes?.[current.id] ?? '';
  $('#current-operator-note').hidden = !state.operatorNotes?.[current.id];
  $('#cues-heading').textContent = upcoming ? `Next: ${upcoming.label}` : 'No next activity';
  const preview = $('#current'); preview.replaceChildren();
  preview.append(element('h3', current.label, 'current-title'));
  if (current.kind === 'activity' && ready(current)) {
    preview.append(link('Join activity ↗', current.url));
  } else {
    preview.append(element('p', current.instruction || 'No additional instruction.'));
  }
  $('#pause').replaceChildren();
  const waiting = state.activities.find(activity => activity.kind === 'waiting' && ready(activity));
  if (waiting && waiting.id !== state.activeId) {
    $('#pause').append(cueButton(waiting, 'Return to waiting'));
  }
  const cues = $('#cues'); const activities = $('#activities');
  cues.replaceChildren(); activities.replaceChildren();
  for (const activity of state.activities) {
    const active = activity.id === state.activeId;
    const row = element('div', '', 'cue-row');
    row.classList.toggle('is-current', active);
    const copy = element('div');
    const next = upcoming?.id === activity.id;
    copy.append(element('h3', activity.label), element('p', active ? 'Current invitation · On the Hub entrance' : next ? `Next activity · ${description(activity)}` : description(activity), 'aside'));
    if (dirty && activity.id === editingId) copy.append(element('p', 'Unsaved changes · Show uses the saved version', 'aside'));
    if (next) copy.append(element('span', 'Next activity', 'next-marker'));
    row.append(copy, active ? element('span', 'Current invitation', 'current-marker') : ready(activity)
      ? cueButton(activity) : button(`Prepare ${activity.label}`, () => {
        if (state.runId && ['polymind', 'collective-voice', 'puck'].includes(activity.id)) {
          showMode('prepare'); void runTools.openRun(state.runId, activity.id);
        } else if (edit(activity)) showMode('prepare');
      }));
    const report = element('p', statusText(activity), 'aside'); report.dataset.appStatus = activity.id; copy.append(report);
    if (state.operatorNotes?.[activity.id]) {
      const guide = element('details');
      guide.append(element('summary', 'Operator cue'), element('p', state.operatorNotes[activity.id], 'aside'));
      copy.append(guide);
    }
    const app = appFor(activity);
    if (app && activity.url) copy.append(controlsLink(app, activity));
    cues.append(row);
    const item = button(`${activity.label} · ${description(activity)}`, () => edit(activity));
    item.className = 'prepare-choice'; item.setAttribute('aria-pressed', String(activity.id === editingId));
    activities.append(item);
  }
  renderAppControls(); updateImpact(); showMode(mode); lock();
}
function discard() { return !dirty || window.confirm('Discard your unsaved invitation changes?'); }
function closeEditor() {
  editingId = undefined; dirty = false; form.hidden = true; $('#editor-empty').hidden = false;
}
function restoreCreation(app) {
  try {
    const pending = JSON.parse(sessionStorage.getItem(`hub-create:${app}`) ?? 'null');
    if (pending?.settings) {
      if (app === 'polymind') { form.elements.sessionTitle.value = pending.settings.title; form.elements.capacity.value = pending.settings.capacity; }
      else if (app === 'puck') { form.elements.question.value = pending.settings.question; form.elements.options.value = pending.settings.options.join('\n'); }
    }
  } catch { /* A corrupt or unavailable draft must not prevent loading saved invitations. */ }
}
function edit(activity) {
  if (!discard()) return false;
  editingId = activity.id; dirty = false;
  form.hidden = false; $('#editor-empty').hidden = true;
  form.elements.label.value = activity.label;
  form.elements.kind.value = activity.kind;
  form.elements.instruction.value = activity.instruction;
  const chooseWebsite = element('option', 'Choose a website'); chooseWebsite.value = '';
  form.elements.origin.replaceChildren(chooseWebsite, ...origins.map(value => {
    const option = element('option', new URL(value).host); option.value = value; return option;
  }));
  const app = appFor(activity);
  const apiApp = app === 'collective-voice' ? 'polymind' : app;
  form.elements.app.value = apiApp ?? 'manual';
  $('#manual-destination').open = !app;
  $('#create-activity').open = false;
  form.elements.sessionTitle.value = activity.label;
  form.elements.question.value = ''; form.elements.options.value = '';
  restoreCreation(apiApp);
  form.elements.origin.value = apiApp && origins.includes(appOrigins[apiApp]) ? appOrigins[apiApp] : '';
  $('#editor-controls').replaceChildren();
  if (app) $('#editor-controls').append(controlsLink(app, activity));
  form.elements.destination.value = '';
  if (activity.url) {
    const url = new URL(activity.url);
    form.elements.origin.value = url.origin;
    form.elements.destination.value = url.pathname + url.search;
  }
  $('#editor-heading').textContent = `Prepare ${activity.label}`;
  $('#editor-error').hidden = true;
  $('#saved-link').replaceChildren();
  if (activity.url) $('#saved-link').append(link('Open saved participant page to check ↗', activity.url));
  showMode('prepare'); updateFields(); render();
  form.elements.label.focus();
  void loadSessions();
  return true;
}
function updateImpact() {
  if (!editingId) return;
  $('#edit-impact').textContent = editingId === state.activeId
    ? 'This invitation is live. Saving will change what people see on the entrance now.'
    : 'Saving prepares this invitation. It does not change the entrance.';
}
function updateFields() {
  const digital = form.elements.kind.value === 'activity';
  $('#digital-fields').hidden = !digital;
  const app = form.elements.app.value;
  $('#app-preparation').hidden = app === 'manual';
  $('#polymind-settings').hidden = app !== 'polymind';
  $('#puck-settings').hidden = app !== 'puck';
  $('#instruction-field').hidden = digital && Boolean(form.elements.destination.value.trim());
  lock();
}
function destination() {
  const value = form.elements.destination.value.trim();
  if (!value) return '';
  if ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('?')) {
    return new URL(value, form.elements.origin.value).href;
  }
  // Only supply a missing scheme. The server still validates the full destination.
  return /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
}
async function fetchState() {
  const response = await fetch('/api/operator/state', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Could not read the programme. Check your operator sign-in and connection, then refresh saved state.');
  return response.json();
}
async function load() {
  if (busy) return;
  busy = true; lock();
  try {
    const response = await fetch('/api/operator/config', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Could not load the allowed websites. Check your sign-in and refresh saved state.');
    const config = await response.json();
    origins = config.allowedOrigins; appOrigins = config.appOrigins; integrations = config.integrations ?? {};
    state = await fetchState(); uncertain = false;
    if (!dirty) closeEditor();
    else {
      $('#saved-link').replaceChildren();
      const saved = state.activities.find(item => item.id === editingId);
      if (saved?.url) $('#saved-link').append(link('Open saved participant page to check ↗', saved.url));
    }
    render();
    say(dirty ? 'Saved state refreshed. Your unsaved edits are kept. Review them against the current programme before saving.'
      : 'Saved programme loaded. Choose an invitation to show to the room.');
  } catch (error) { uncertain = true; say(error.message, true); }
  finally { busy = false; lock(); if (!uncertain) void checkActivities(); }
}
async function save(activities, activeId, message) {
  if (busy || uncertain) return false;
  busy = true; lock(); say('Saving…');
  try {
    const response = await fetch('/api/operator/state', { method: 'PUT',
      headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ expectedRevision: state.revision, activeId, activities }) });
    if (!response.ok) {
      if (response.status === 409) {
        uncertain = true;
        throw new Error('Another operator changed the programme. Your edits are still here. Refresh saved state before trying again.');
      }
      if (response.status >= 500) uncertain = true;
      const result = await response.json();
      throw new Error(result.error ?? 'Could not save. Check your sign-in and refresh saved state.');
    }
    state = await response.json(); render(); say(message);
    return true;
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'Error') uncertain = true;
    const message = error.name === 'Error' ? error.message
      : 'Could not confirm the save. Refresh saved state to check what the room sees before trying again. Your edits are still here.';
    say(message, true);
    if (!form.hidden) { $('#editor-error').textContent = message; $('#editor-error').hidden = false; $('#editor-error').focus(); }
    return false;
  } finally { busy = false; lock(); if (!uncertain) void checkActivities(); }
}
async function cue(activity) {
  if (dirty && editingId === activity.id && !window.confirm('Show the previously saved invitation? Your unsaved changes will not be shown.')) return;
  if (activity.kind === 'closed' && !window.confirm(`Show “${activity.label}” and replace the current invitation?`)) return;
  if (await save(state.activities, activity.id, `Now showing: ${activity.label}. Give the room its spoken cue.`)) $('#current-heading').focus();
}
form.addEventListener('input', () => { dirty = true; $('#editor-error').hidden = true; updateFields(); });
form.addEventListener('change', updateFields);
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || appBusy || uncertain) return;
  const activity = { id: editingId, label: form.elements.label.value.trim(), kind: form.elements.kind.value,
    status: form.elements.kind.value !== 'activity' || form.elements.destination.value.trim() ? 'ready' : 'unavailable',
    instruction: form.elements.instruction.value.trim() };
  if (activity.kind === 'activity' && activity.status === 'ready') {
    try { activity.url = destination(); } catch {
      $('#editor-error').textContent = 'Choose a website for this path, or paste the full participant link.';
      $('#editor-error').hidden = false; $('#editor-error').focus(); return;
    }
  }
  if (activity.id === state.activeId && !window.confirm('Save changes to the invitation currently shown to the room?')) return;
  const exists = state.activities.some(item => item.id === activity.id);
  const activities = exists ? state.activities.map(item => item.id === activity.id ? activity : item) : [...state.activities, activity];
  if (await save(activities, state.activeId, `Saved ${activity.label}.${activity.id === state.activeId ? ' The entrance has been updated.' : activity.status === 'ready' ? ' Check it before choosing Show.' : ' It will stay unavailable until you add a participant link.'}`)) {
    const connected = connectionFor(activity);
    if (connected) {
      try {
        const key = `hub-create:${connected.app}`;
        const pending = JSON.parse(sessionStorage.getItem(key) ?? 'null');
        if (pending?.resultId === connected.id) sessionStorage.removeItem(key);
      } catch { /* The saved invitation remains authoritative if browser storage is unavailable. */ }
    }
    dirty = false; edit(state.activities.find(item => item.id === activity.id));
  }
});
for (const tab of document.querySelectorAll('[role=tab]')) {
  tab.addEventListener('click', () => { showMode(tab.id === 'run-view' ? 'run' : 'prepare'); });
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[role=tab]')];
    const index = tabs.indexOf(tab);
    const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1)
      : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    target.focus(); target.click();
  });
}
$('#reload').addEventListener('click', () => void load());
$('#refresh-checks').addEventListener('click', () => void checkActivities(true));
$('#cancel').addEventListener('click', () => { if (discard()) { closeEditor(); render(); $('#add').focus(); } });
$('#add').addEventListener('click', () => {
  if (edit({ id: `invitation-${crypto.randomUUID()}`, label: 'New invitation', kind: 'analogue', status: 'ready', instruction: '' })) dirty = true;
});
window.addEventListener('beforeunload', event => { if (dirty || busy || appBusy || runTools?.isBusy() || runTools?.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; } });
// Observe changes without replacing an operator's in-progress form or keyboard focus.
setInterval(async () => {
  if (!state || busy || polling || document.hidden) return;
  polling = true;
  const revision = state.revision;
  try {
    const latest = await fetchState();
    if (busy || revision !== state.revision) return;
    if (latest.revision !== revision) {
      uncertain = true;
      say('The programme changed elsewhere. Refresh saved state to see the current invitation. Unsaved edits are still here.', true);
    }
  } catch {
    uncertain = true;
    say('Connection interrupted. The preview may be out of date. Refresh saved state when connected.', true);
  } finally { polling = false; lock(); }
}, 5000);
$('#load-sessions').addEventListener('click', () => void loadSessions());
form.elements.app.addEventListener('change', () => {
  $('#manual-destination').open = form.elements.app.value === 'manual';
  restoreCreation(form.elements.app.value);
  form.elements.destination.value = ''; dirty = true; updateFields(); void loadSessions();
});
$('#connect-session').addEventListener('click', () => {
  const item = availableSessions.find(item => item.id === form.elements.existing.value);
  if (item) connectSession(item);
});
$('#create-session').addEventListener('click', () => void createSession());
$('#new-request').addEventListener('click', () => {
  if (!window.confirm('Start a separate creation request? The earlier request may already have created an activity. Check the available activities first.')) return;
  try { sessionStorage.removeItem(`hub-create:${form.elements.app.value}`); $('#app-feedback').textContent = 'Ready for a new creation request.'; }
  catch { $('#app-feedback').textContent = 'Could not reset the creation request.'; }
});
setInterval(() => void checkActivities(), 15000);
runTools = runPreparation({ getState: () => state, blocked: () => busy || appBusy || uncertain,
  beforeInstall: discard,
  installed: next => {
    if (state?.runId !== next.runId) closeEditor();
    state = next; render(); say('Prepared programme saved. The current invitation has not changed.');
    void checkActivities();
  } });
void load();
