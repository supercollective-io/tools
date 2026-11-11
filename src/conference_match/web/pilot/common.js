export const $ = id => document.getElementById(id);
export function node(tag, text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}
export function notice(text) {
  $('message').textContent = text;
  if (text) $('message').scrollIntoView({block: 'nearest'});
}
export async function api(path, key, body) {
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}
export function action(callback) {
  return async event => {
    event?.preventDefault();
    const button = event?.submitter || event?.currentTarget;
    if (button?.tagName === 'BUTTON') button.disabled = true;
    try { await callback(); } catch (error) { notice(error.message); }
    finally { if (button?.tagName === 'BUTTON') button.disabled = false; }
  };
}
export function profile(person) {
  const element = node('article');
  element.append(node('h3', person.name));
  for (const [key, label] of [['offers', 'Offers'], ['needs', 'Needs'], ['contact', 'Contact']]) {
    if (!person[key]) continue;
    const text = node('p', person[key]); text.className = 'profile-text';
    element.append(node('strong', label), text);
  }
  return element;
}
export async function copyLink(id) {
  try { await navigator.clipboard.writeText($(id).value); notice('Link copied.'); }
  catch { $(id).focus(); $(id).select(); notice('Copy the selected link.'); }
}
