const panel = document.querySelector('#pairing');
const join = document.querySelector('#pair-join');
const leave = document.querySelector('#pair-leave');
const message = document.querySelector('#pair-message');
const marker = document.querySelector('#pair-marker');
const error = document.querySelector('#pair-error');
const colours = ['blue', 'gold', 'pink', 'orange', 'green'];
const shapes = ['circle', 'square', 'triangle', 'diamond', 'cross'];
let round;
let token;
let joined = false;
let busy = false;
let paired = false;
let renderedResult = '';
const storageKey = 'rw-pairing-v1';

function remember() {
  try { localStorage.setItem(storageKey, JSON.stringify({ round, token, joined })); } catch { /* In-page recovery still works. */ }
}
export function showPairing(nextRound) {
  panel.hidden = !nextRound;
  document.body.classList.toggle('pairing-active', Boolean(nextRound));
  if (nextRound === round) return;
  round = nextRound;
  joined = false; paired = false; renderedResult = '';
  token = crypto.randomUUID();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.round === round && /^[a-f0-9-]{36}$/.test(saved.token)) {
      token = saved.token; joined = saved.joined === true;
    }
  } catch { /* A missing or invalid saved identity starts a new invitation. */ }
  if (round) remember();
  marker.hidden = true;
  error.hidden = true;
  join.hidden = joined;
  leave.hidden = !joined;
  message.textContent = joined ? 'Finding you a partner…' : 'Join when you are ready to meet someone.';
  if (round && joined) void update();
}
async function update(action = 'join') {
  if (!round || busy || (action === 'join' && paired)) return;
  const requestedRound = round;
  const requestedToken = token;
  busy = true;
  join.disabled = true; leave.disabled = true;
  try {
    const response = await fetch('/api/pairing', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roundId: requestedRound, token: requestedToken, action }),
      signal: AbortSignal.timeout(8000) });
    const result = await response.json();
    if (requestedRound !== round) return;
    if (!response.ok) throw new Error(result.error || 'Pairing unavailable.');
    if (!error.hidden) error.hidden = true;
    joined = action !== 'leave' || result.status === 'paired';
    paired = result.status === 'paired';
    remember();
    const resultKey = JSON.stringify(result);
    if (renderedResult === resultKey) return;
    renderedResult = resultKey;
    join.hidden = joined; leave.hidden = !joined || paired;
    marker.hidden = !paired;
    if (paired) {
      const colour = colours[(result.number - 1) % colours.length];
      const shape = shapes[Math.floor((result.number - 1) / colours.length) % shapes.length];
      document.querySelector('#pair-shape').setAttribute('class', `pair-shape ${colour} ${shape}`);
      document.querySelector('#pair-number').textContent = String(result.number).padStart(2, '0');
      document.querySelector('#pair-description').textContent = `${colour[0].toUpperCase()}${colour.slice(1)} ${shape}`;
      message.textContent = 'Hold up your screen. Find the same number, then compare screens.';
    } else message.textContent = joined
      ? 'Finding you a partner… We shuffle arrivals in batches of about 12 seconds. If you are still waiting, keep this page open or ask the facilitator.'
      : 'Join when you are ready to meet someone.';
  } catch (failure) {
    if (requestedRound !== round) return;
    const feedback = `${failure.message} Check your connection; we’ll retry while this page is open. You can also ask the facilitator.`;
    if (error.textContent !== feedback) error.textContent = feedback;
    if (error.hidden) error.hidden = false;
  } finally {
    busy = false;
    join.disabled = false; leave.disabled = false;
  }
}
join.addEventListener('click', () => {
  joined = true; remember(); join.hidden = true; leave.hidden = false;
  message.textContent = 'Finding you a partner…';
  void update();
});
leave.addEventListener('click', () => void update('leave'));
setInterval(() => { if (joined && !paired && !document.hidden) void update(); }, 2000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && joined && !paired) void update();
});
