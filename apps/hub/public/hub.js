import { showPairing } from './pairing.js';
const title = document.querySelector('#activity-title');
const instruction = document.querySelector('#instruction');
const phase = document.querySelector('#phase');
const link = document.querySelector('#activity-link');
const connection = document.querySelector('#connection');
const nameArea = document.querySelector('#name-area');
const savedName = document.querySelector('#saved-name');
const nameValue = document.querySelector('#name-value');
const nameEditor = document.querySelector('#name-editor');
const nameInput = document.querySelector('#display-name');
const nameError = document.querySelector('#name-error');
const storageKey = 'rw-display-name-v1';
let rememberedName = '';
try { rememberedName = localStorage.getItem(storageKey)?.trim() ?? ''; } catch { /* Storage is optional. */ }
if (rememberedName.length > 80) rememberedName = '';
let handoff = false;
let revision;

function showName() {
  nameValue.textContent = rememberedName;
  savedName.hidden = !rememberedName;
  nameEditor.hidden = Boolean(rememberedName);
  nameInput.value = rememberedName;
  nameError.hidden = true;
}
showName();
nameInput.addEventListener('input', () => { nameError.hidden = true; });
document.querySelector('#change-name').addEventListener('click', () => {
  savedName.hidden = true;
  nameEditor.hidden = false;
  nameInput.focus();
});
link.addEventListener('click', event => {
  if (!handoff) return;
  const name = nameEditor.hidden ? rememberedName : nameInput.value.trim();
  if (!name || name.length > 80) {
    event.preventDefault();
    nameError.hidden = false;
    nameInput.focus();
    return;
  }
  rememberedName = name;
  try { localStorage.setItem(storageKey, name); } catch { /* Keep the name for this page. */ }
  const destination = new URL(link.href);
  destination.hash = `rw-name-v1=${encodeURIComponent(name)}`;
  link.href = destination.href;
  showName();
});

async function refresh() {
  if (document.hidden) return;
  try {
    const response = await fetch('/api/current', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Hub unavailable');
    const state = await response.json();
    if (revision !== state.revision) {
      const current = state.current;
      title.textContent = current.label;
      phase.hidden = ['analogue', 'pairs', 'fours'].includes(current.kind);
      showPairing(state.pairingRound, current.kind);
      instruction.textContent = current.instruction;
      phase.textContent = { activity: 'Current activity', analogue: 'In-person activity', pairs: 'Find a partner', fours: 'Find your group',
        waiting: 'Waiting', closed: 'Finished' }[current.kind];
      const canOpen = current.kind === 'activity' && current.status === 'ready' && current.url;
      handoff = Boolean(canOpen && state.nameHandoff);
      nameArea.hidden = !handoff;
      link.hidden = !canOpen;
      instruction.hidden = Boolean(canOpen) || Boolean(state.pairingRound) || !current.instruction;
      if (canOpen) { link.href = current.url; link.textContent = 'Join activity'; }
      else link.removeAttribute('href');
      revision = state.revision;
    }
    connection.textContent = '';
    connection.parentElement.hidden = true;
    connection.dataset.state = 'connected';
  } catch {
    connection.textContent = revision ? 'Connection interrupted. Showing the last invitation; listen for the cue.'
      : 'Waiting for a connection. You can follow the spoken invitation.';
    connection.dataset.state = 'offline';
    connection.parentElement.hidden = false;
  }
}
void refresh();
setInterval(() => void refresh(), 2000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
window.addEventListener('pageshow', () => void refresh());
window.addEventListener('online', () => void refresh());
