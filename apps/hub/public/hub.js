const title = document.querySelector('#activity-title');
const instruction = document.querySelector('#instruction');
const phase = document.querySelector('#phase');
const link = document.querySelector('#activity-link');
const phonesDown = document.querySelector('#phones-down');
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
      instruction.textContent = current.instruction;
      phase.textContent = { activity: 'The current invitation', analogue: 'Phones down · eyes up',
        waiting: 'Stay with the room', closed: 'For now, we close' }[current.kind];
      const canOpen = current.kind === 'activity' && current.status === 'ready' && current.url;
      link.hidden = !canOpen;
      if (canOpen) { link.href = current.url; link.textContent = `Open ${current.label} ↗`; }
      else link.removeAttribute('href');
      phonesDown.hidden = current.kind !== 'analogue' && current.kind !== 'closed';
      revision = state.revision;
    }
    connection.textContent = 'Connected · invitations update here';
    connection.dataset.state = 'connected';
  } catch {
    connection.textContent = revision ? 'Connection interrupted. Showing the last invitation; listen for the cue.'
      : 'Waiting for a connection. You can follow the spoken invitation.';
    connection.dataset.state = 'offline';
  }
}
void refresh();
setInterval(() => void refresh(), 2000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
window.addEventListener('pageshow', () => void refresh());
window.addEventListener('online', () => void refresh());
