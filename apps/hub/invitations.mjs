const sessionIdPattern = /^[a-zA-Z0-9_-]{1,100}$/;

/**
 * Return whether a value is Polymind's canonical public participant URL.
 *
 * Polymind currently publishes `/?session=<id>` from its operator session
 * resource. Keep this check deliberately narrow: the Hub must not accept an
 * operator URL, an arbitrary path, a second query parameter or credentials as
 * a participant invitation.
 */
export function isPolymindInvitation(value, expectedOrigin, expectedId) {
  if (typeof value !== 'string' || typeof expectedOrigin !== 'string') return false;
  if (expectedId !== undefined && (typeof expectedId !== 'string' || !sessionIdPattern.test(expectedId))) return false;

  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.href !== value || url.origin !== expectedOrigin || url.protocol !== 'https:' ||
      url.username || url.password || url.pathname !== '/' || url.hash) return false;

  // Match the raw search string as well as URLSearchParams. This rejects
  // duplicate, encoded or differently cased parameter names and extra keys.
  const match = /^\?session=([a-zA-Z0-9_-]{1,100})$/.exec(url.search);
  if (!match || url.searchParams.size !== 1 || url.searchParams.get('session') !== match[1]) return false;
  return expectedId === undefined || match[1] === expectedId;
}
