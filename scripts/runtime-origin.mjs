import { pathToFileURL } from 'node:url';

function parseOrigin(value, label) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url;
  } catch {
    throw new Error(`${label} must contain HTTP(S) origins without credentials, paths or query parameters.`);
  }
}

export function runtimeOrigin(env, key) {
  if (!['PUBLIC_ORIGIN', 'HUB_PUBLIC_ORIGIN'].includes(key)) throw new Error('Unknown origin setting.');
  if (env[key] !== undefined) {
    if (!env[key].trim()) throw new Error(`${key} is blank; remove it to use COOLIFY_URL or set one origin.`);
    return parseOrigin(env[key].trim(), key).origin;
  }
  if (!env.COOLIFY_URL?.trim()) throw new Error(`Set ${key} or enable Coolify default variables and configure a domain.`);
  const urls = env.COOLIFY_URL.split(',').map(value => parseOrigin(value.trim(), 'COOLIFY_URL'));
  const families = new Set(urls.map(url => `${url.protocol}//${url.hostname.replace(/^www\./, '')}:${url.port}`));
  if (families.size !== 1) throw new Error(`COOLIFY_URL contains unrelated origins; set ${key} to the canonical origin.`);
  return (urls.find(url => !url.hostname.startsWith('www.')) ?? urls[0]).origin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(runtimeOrigin(process.env, process.argv[2])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
