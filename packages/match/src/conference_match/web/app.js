'use strict';
const $ = id => document.getElementById(id);
let session, allocation, selected;
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function notice(text) {
  $('message').textContent = text;
  $('message').scrollIntoView({block: 'nearest'});
}
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({input_hash: session.input_hash, revision: session.revision, ...body})
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Request failed');
  return value;
}
function guarded(fn) { return async event => {
  if (event) event.preventDefault();
  try { await fn(event); } catch (error) { notice(error.message); }
}; }
function download(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], {type: 'application/json'}));
  const a = node('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function person(id) { return session.event.participants.find(p => p.id === id); }
function profile(id, focus) {
  const p = person(id), el = node('article');
  el.append(node('h3', p.name));
  for (const key of p.profile != null ? ['profile'] : focus === 'needs' ? ['needs', 'offers'] : ['offers', 'needs']) {
    if (!p[key]) continue;
    if (focus && key !== focus && key !== 'profile') {
      const more = node('details');
      more.append(node('summary', key[0].toUpperCase() + key.slice(1)), node('p', p[key], 'profile-text'));
      el.append(more);
    } else {
      el.append(node('strong', key[0].toUpperCase() + key.slice(1)), node('p', p[key], 'profile-text'));
    }
  }
  return el;
}
function showProposal() {
  selected = session.proposals.find(p => p.id === $('proposal').value);
  $('pairs').replaceChildren();
  $('review-form').reset();
  if (!selected) {
    $('question').textContent = 'At least three participants are needed to compare candidates.';
    $('save').disabled = true; return;
  }
  const shared = selected.left.filter(id => selected.right.includes(id));
  const commonRecipient = selected.metric === 'support' && selected.left[1] === selected.right[1];
  const sharedName = shared.length === 1 ? person(shared[0]).name : '';
  const questions = {
    support: commonRecipient
      ? `Who can provide more additional help towards ${sharedName}’s stated needs: A or B?`
      : 'Which direction provides more help towards the recipient’s stated needs?',
    shared_inquiry: sharedName
      ? `Who has stronger shared inquiry with ${sharedName}: A or B?`
      : 'Which pair has stronger shared inquiry?',
    sum: sharedName ? `Who is the better overall match for ${sharedName}: A or B?` : 'Which pair is the better overall match?'
  };
  $('question').textContent = questions[selected.metric];
  $('holdout-note').textContent = !session.expert_report_hash && selected.split === 'holdout' ? 'Reserved holdout: review without model scores.' : '';
  for (const id of shared) {
    const el = node('div', undefined, 'shared-person');
    el.append(node('h2', commonRecipient ? 'Recipient' : 'Shared participant'), profile(id, commonRecipient ? 'needs' : undefined));
    $('pairs').append(el);
  }
  for (const [label, pair] of [['A', selected.left], ['B', selected.right]]) {
    const el = node('div'); el.append(node('h2', label));
    if (selected.metric === 'support' && !commonRecipient) {
      el.append(node('p', `${person(pair[0]).name} → ${person(pair[1]).name}`));
    }
    pair.filter(id => !shared.includes(id)).forEach(id =>
      el.append(profile(id, commonRecipient ? 'offers' : undefined)));
    $('pairs').append(el);
  }
  const saved = session.judgements[selected.id];
  if (saved) {
    document.querySelector(`input[name="choice"][value="${saved.choice}"]`).checked = true;
    $('reason').value = saved.reason;
  }
  const locked = selected.split === 'holdout' && session.scores_revealed;
  $('save').disabled = locked;
  if (locked) $('holdout-note').textContent += ' Locked because allocation scores have been revealed.';
}
async function refresh(preferred) {
  session = await api('/api/session');
  $('description').textContent = session.event.description;
  $('person').replaceChildren(...session.event.participants.map(p => new Option(p.name, p.id)));
  $('profile').replaceChildren(profile($('person').value));
  $('proposal').replaceChildren(...session.proposals.map((p, i) => new Option(`${i + 1}. ${{support: 'Support', shared_inquiry: 'Shared inquiry', sum: 'Overall match'}[p.metric]}${session.expert_report_hash ? '' : ` · ${p.split}`}${session.judgements[p.id] ? ' · reviewed' : ''}`, p.id)));
  $('proposal').value = preferred || session.proposals.find(p => !session.judgements[p.id])?.id || session.proposals[0]?.id || '';
  const current = session.proposals.map(p => session.judgements[p.id]).filter(Boolean);
  const ranked = current.filter(j => j.choice !== 'unclear').length;
  $('progress').textContent = `${session.expert_report_hash ? `Batch ${session.batch_number}: ` : ''}${current.length} / ${session.proposals.length} reviewed; ${ranked} ranked.`;
  $('batch-status').textContent = session.expert_report_hash && session.batch_complete
    ? (session.batch_number < session.batch_total ? 'Batch complete. You can stop here.' : 'All batches complete.') : '';
  $('next-batch').hidden = !(session.expert_report_hash && session.batch_complete && session.batch_number < session.batch_total);
  $('allocation-panel').hidden = !!session.expert_report_hash;
  $('save').textContent = session.batch_complete ? 'Save changes' : 'Save and next';
  $('allocate').disabled = !session.has_run;
  $('allocation-note').textContent = session.has_run ? '' : 'To inspect an allocation, restart with --run pointing to a saved scoring run.';
  showProposal();
}
$('person').onchange = () => $('profile').replaceChildren(profile($('person').value));
$('proposal').onchange = showProposal;
$('review-form').onsubmit = guarded(async () => {
  const id = selected.id;
  await api('/api/judgements', {judgement: {
    proposal_id: id, choice: document.querySelector('input[name="choice"]:checked').value,
    reason: $('reason').value
  }});
  await refresh();
  if (session.batch_complete) { $('proposal').value = id; showProposal(); }
  notice(session.batch_complete ? 'Batch complete. You can stop here.' : 'Judgement saved.');
});
$('import-form').onsubmit = guarded(async () => {
  const event = JSON.parse(await $('event-file').files[0].text());
  const fixturesFile = $('fixtures-file').files[0];
  const fixtures = fixturesFile ? JSON.parse(await fixturesFile.text()) : null;
  await api('/api/import', {event, fixtures});
  allocation = null; $('allocation').replaceChildren(); $('export-allocation').disabled = true;
  await refresh(); notice('Event imported.');
});
$('next-batch').onclick = guarded(async () => {
  await api('/api/next-batch', {});
  await refresh(); notice('Next batch ready.');
});
$('export-fixtures').onclick = guarded(async () => download(await api('/api/fixtures'), 'comparisons.json'));
$('export-archive').onclick = guarded(async () => download(await api('/api/archive'), 'review-archive.json'));
$('allocate').onclick = guarded(async () => {
  allocation = await api('/api/allocation', {normalisation: $('normalisation').value});
  const table = node('table'), head = node('thead'), row = node('tr'), body = node('tbody');
  for (const label of ['Pair', 'A → B', 'B → A', 'Shared inquiry', 'Weight']) row.append(node('th', label));
  head.append(row); table.append(head, body);
  for (const pair of [...allocation.pairs].sort((a, b) => a.weight - b.weight)) {
    const row = node('tr'), cell = node('td'), details = node('details');
    details.append(node('summary', `${pair.a_name} / ${pair.b_name}`), profile(pair.a), profile(pair.b));
    cell.append(details); row.append(cell);
    for (const value of [pair.raw_scores.a_to_b, pair.raw_scores.b_to_a, pair.raw_scores.shared_inquiry, pair.weight]) row.append(node('td', value.toFixed(3)));
    body.append(row);
  }
  $('allocation').replaceChildren(table); $('export-allocation').disabled = false;
  await refresh(selected?.id);
  $('allocation-note').textContent = `${allocation.pairs.length} pairs, weakest first. ${allocation.normalisation === 'none' ? 'Raw sum' : 'Z-score'} weights. Components are rubric scores, not success probabilities. Model: ${allocation.model}.`;
  notice('Allocation revealed. Reserved holdout judgements are locked.');
});
$('normalisation').onchange = () => { allocation = null; $('allocation').replaceChildren(); $('export-allocation').disabled = true; };
$('export-allocation').onclick = () => download(allocation, 'allocation.json');
guarded(() => refresh())();
