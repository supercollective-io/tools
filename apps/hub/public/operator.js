const form = document.querySelector('#programme');
const list = document.querySelector('#activities');
const feedback = document.querySelector('#feedback');
let revision;
let serial = 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function field(card, label, name, value, options) {
  const wrapper = element('label', label, 'field');
  const input = element(options ? 'select' : name === 'instruction' ? 'textarea' : 'input');
  input.name = name;
  if (options) for (const option of options) {
    const node = element('option', option); node.value = option; input.append(node);
  }
  input.value = value;
  input.required = !['url', 'instruction'].includes(name);
  if (name === 'url') input.type = 'url';
  wrapper.append(input); card.append(wrapper);
  return input;
}
function addActivity(activity, selected = false) {
  const card = element('fieldset', '', 'activity-editor');
  card.dataset.id = activity.id;
  card.append(element('legend', activity.label));
  const choice = element('label', 'Make this the current activity', 'choice');
  const radio = element('input'); radio.type = 'radio'; radio.name = 'active'; radio.value = activity.id;
  radio.checked = selected; radio.required = true; choice.prepend(radio); card.append(choice);
  field(card, 'Activity name', 'label', activity.label);
  const kind = field(card, 'Activity type', 'kind', activity.kind,
    ['activity', 'analogue', 'waiting', 'closed']);
  const status = field(card, 'Availability', 'status', activity.status, ['ready', 'unavailable']);
  field(card, 'Instruction for the room', 'instruction', activity.instruction);
  const url = field(card, 'Participant destination (HTTPS)', 'url', activity.url ?? '');
  const instruction = card.querySelector('[name=instruction]');
  const refreshUrl = () => {
    const readyActivity = kind.value === 'activity' && status.value === 'ready';
    url.disabled = !readyActivity;
    instruction.disabled = readyActivity;
    instruction.closest('label').hidden = readyActivity;
  };
  kind.addEventListener('change', refreshUrl); status.addEventListener('change', refreshUrl); refreshUrl();
  list.append(card);
}
async function load() {
  const response = await fetch('/api/operator/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not read the programme. Check your operator sign-in.');
  const state = await response.json();
  revision = state.revision; list.replaceChildren();
  for (const activity of state.activities) addActivity(activity, activity.id === state.activeId);
  feedback.textContent = `Saved programme loaded · revision ${revision}`;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]'); button.disabled = true;
  try {
    const activities = [...list.children].map(card => {
      const value = name => card.querySelector(`[name="${name}"]`).value;
      const activity = { id: card.dataset.id, label: value('label'), kind: value('kind'),
        status: value('status'), instruction: value('instruction') };
      if (activity.kind === 'activity' && activity.status === 'ready') activity.url = value('url');
      return activity;
    });
    const response = await fetch('/api/operator/state', { method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: revision,
        activeId: form.querySelector('[name="active"]:checked').value, activities }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'The programme could not be saved.');
    revision = result.revision;
    feedback.textContent = `Invitation saved · revision ${revision}.`;
  } catch (error) { feedback.textContent = error.message; }
  finally { button.disabled = false; }
});
document.querySelector('#reload').addEventListener('click', () => {
  if (window.confirm('Discard unsaved edits and reload the saved programme?')) {
    void load().catch(error => { feedback.textContent = error.message; });
  }
});
document.querySelector('#add').addEventListener('click', () => {
  serial += 1;
  const id = `invitation-${Date.now()}-${serial}`;
  addActivity({ id, label: 'New invitation', kind: 'waiting', status: 'ready',
    instruction: '' });
});
void load().catch(error => { feedback.textContent = error.message; });
