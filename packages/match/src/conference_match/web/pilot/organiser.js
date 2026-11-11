import {$, api, action, copyLink, node, notice, profile} from '/common.js';
const key = location.hash.slice(1);
let state, timer;
$('join-link').value = `${location.origin}/`;
async function load() {
  clearTimeout(timer);
  state = await api('/api/organiser', key);
  $('event').textContent = state.description;
  const count = state.entrants.length;
  $('state').textContent = `${count} participants · ${state.status}. ${state.error || state.progress || ''}`;
  const open = state.status === 'open', retry = state.status === 'failed';
  $('start').hidden = !(open || retry);
  $('start').disabled = open && (count < 2 || count % 2 !== 0);
  $('start').textContent = retry ? 'Retry matching' : 'Run matching';
  $('reopen').hidden = !['failed', 'ready'].includes(state.status);
  $('release').hidden = state.status !== 'ready';
  $('run-note').textContent = open
    ? (count < 2 || count % 2 ? 'Matching requires at least two participants and an even count.'
      : `Run matching freezes profiles and sends offers and needs to Jev for ${count * (count - 1) / 2} pair assessment${count === 2 ? '' : 's'}, using API credit. Everyone receives one partner.`)
    : retry ? 'Retry uses the same frozen profiles and resumes missing assessments using API credit.' : '';
  $('participants').replaceChildren();
  for (const person of state.entrants) {
    const details = node('details');
    details.append(node('summary', person.name), profile(person));
    if (open) {
      const remove = node('button', 'Remove participant'); remove.type = 'button';
      remove.onclick = action(async () => {
        await api('/api/remove', key, {id: person.id, revision: state.revision});
        await load(); notice('Participant removed.');
      });
      details.append(remove);
    }
    $('participants').append(details);
  }
  $('matches').hidden = !state.allocation;
  $('pairs').replaceChildren();
  if (state.allocation) {
    $('match-note').textContent = `${state.status === 'released' ? 'Released' : 'Not yet visible to participants'}. Weakest pair first. Scores are rubric values, not success probabilities.`;
    for (const pair of [...state.allocation.pairs].sort((a, b) => a.weight - b.weight)) {
      const details = node('details');
      details.append(node('summary', `${pair.a_name} / ${pair.b_name}`));
      for (const id of [pair.a, pair.b]) details.append(profile(state.entrants.find(e => e.id === id)));
      details.append(node('p', `A → B: ${pair.raw_scores.a_to_b.toFixed(3)} · B → A: ${pair.raw_scores.b_to_a.toFixed(3)} · Shared inquiry: ${pair.raw_scores.shared_inquiry.toFixed(3)}`));
      $('pairs').append(details);
    }
  }
  if (state.status === 'scoring') timer = setTimeout(() => action(load)(), 2000);
}
for (const [id, endpoint, message] of [
  ['start', '/api/start', 'Matching started.'], ['release', '/api/release', 'Partners released.'],
  ['reopen', '/api/reopen', 'Registration reopened. Previous proposed matches are no longer active.']
]) $(id).onclick = action(async () => {
  await api(endpoint, key, {revision: state.revision});
  await load(); notice(message);
});
$('refresh').onclick = action(load);
$('copy-link').onclick = action(() => copyLink('join-link'));
action(load)();
