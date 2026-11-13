const key = 'rw-display-name-v1';
const fragment = '#rw-name-v1=';

function valid(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 80 ? trimmed : '';
}

export function consumeDisplayName(): string {
  let handoff = '';
  if (location.hash.startsWith(fragment)) {
    const encoded = location.hash.slice(fragment.length);
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    try {
      handoff = valid(decodeURIComponent(encoded));
    } catch {
      // Ignore malformed handoffs and try the local preference.
    }
  }
  if (handoff) return handoff;
  try {
    return valid(localStorage.getItem(key) ?? '');
  } catch {
    return '';
  }
}

export function saveDisplayName(name: string): void {
  try {
    localStorage.setItem(key, valid(name));
  } catch {
    // Storage may be unavailable; joining still succeeds.
  }
}
