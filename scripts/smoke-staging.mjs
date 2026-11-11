const origin = new URL(process.argv[2] ?? 'https://polymind.supercollective.io');
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password) throw new Error('Use an HTTPS application origin.');
for (const [path, expected] of [['/healthz', 200], ['/', 200], ['/api/operator/sessions', 401]]) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
  console.log(`${path}: ${response.status}`);
}
console.log('Public route and unauthenticated boundary passed. Phone save/return, provider and restore rehearsals are separate gates.');
