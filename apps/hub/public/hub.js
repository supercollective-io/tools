const title = document.querySelector('#activity-title');
const instruction = document.querySelector('#instruction');
const phase = document.querySelector('#phase');
const link = document.querySelector('#activity-link');
const connection = document.querySelector('#connection');
let revision;

async function refresh() {
  if (document.hidden) return;
  try {
    const response = await fetch('/api/current', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Hub unavailable');
    const state = await response.json();
    if (revision !== state.revision) {
      const current = state.current;
      title.textContent = current.label;
      phase.hidden = current.kind === 'analogue';
      instruction.textContent = current.instruction;
      phase.textContent = { activity: 'Current activity', analogue: 'In-person activity',
        waiting: 'Waiting', closed: 'Finished' }[current.kind];
      const canOpen = current.kind === 'activity' && current.status === 'ready' && current.url;
      link.hidden = !canOpen;
      instruction.hidden = Boolean(canOpen) || !current.instruction;
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
