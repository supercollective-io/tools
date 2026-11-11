import {$, api, action, copyLink, notice, profile} from '/common.js';
let key = location.hash.slice(1), revision, state;
async function load() {
  state = await api(key ? '/api/me' : '/api/event', key);
  $('event').textContent = state.description;
  const editable = state.status === 'open';
  const labels = {open: key ? 'Your profile is saved. You can edit it until matching starts.' : 'Enter your profile to join.',
    scoring: 'Matching is in progress. Your profile is frozen.',
    failed: 'Matching is delayed. The organiser can retry it.',
    ready: 'Your match is awaiting release by the organiser.',
    released: 'Partners have been released.'};
  $('state').textContent = labels[state.status];
  if (state.profile) {
    revision = state.revision;
    for (const field of ['name', 'offers', 'needs', 'contact']) $(field).value = state.profile[field];
    $('consent').checked = state.profile.consent;
  }
  $('profile-form').hidden = (!key && !editable) || state.status === 'released';
  for (const field of ['name', 'offers', 'needs', 'contact']) $(field).readOnly = !editable;
  $('consent').disabled = !editable;
  $('save').hidden = !editable;
  $('save').textContent = key ? 'Save changes' : 'Join event';
  $('return-link').hidden = !key;
  if (key) $('private-link').value = `${location.origin}/#${key}`;
  $('partner').hidden = !state.partner;
  $('partner-profile').replaceChildren();
  if (state.partner) $('partner-profile').append(profile(state.partner));
}
$('profile-form').onsubmit = action(async () => {
  const input = Object.fromEntries(['name', 'offers', 'needs', 'contact'].map(f => [f, $(f).value]));
  input.consent = $('consent').checked;
  if (key) await api('/api/me', key, {profile: input, revision});
  else {
    const result = await api('/api/join', '', {profile: input});
    key = result.key;
    history.replaceState(null, '', `#${key}`);
  }
  await load(); notice('Profile saved.');
});
$('copy-link').onclick = action(() => copyLink('private-link'));
$('refresh').onclick = action(load);
action(load)();
