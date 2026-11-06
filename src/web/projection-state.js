export function restoreOffset(storage, runId, text) {
  try {
    const saved = JSON.parse(storage.getItem(`collective-reveal:${runId}`));
    // Verify the visible prefix before applying a stored cursor to this session.
    if (
      Number.isInteger(saved?.offset) &&
      saved.offset >= 0 &&
      saved.offset <= text.length &&
      text.slice(0, saved.offset) === saved.prefix
    )
      return saved.offset;
  } catch {
    /* Missing or damaged checkpoint starts at the beginning. */
  }
  return 0;
}
export function saveOffset(storage, runId, text, offset) {
  storage.setItem(
    `collective-reveal:${runId}`,
    JSON.stringify({ offset, prefix: text.slice(0, offset) }),
  );
}
export function nextWord(text, offset, ended) {
  const rest = text.slice(offset);
  const match = /^\s*\S+\s+/u.exec(rest);
  if (match) return offset + match[0].length;
  return ended && rest.length ? text.length : offset;
}
