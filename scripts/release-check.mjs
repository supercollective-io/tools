import { readFile } from 'node:fs/promises';
const file = process.argv[2] ?? 'deploy/release-candidate.json';
const manifest = JSON.parse(await readFile(file, 'utf8'));
const required = ['publicHttps', 'phoneReturn', 'mobileAudio', 'providerBudgetAndLatency', 'privateEncounterRehearsal', 'backupRestore', 'flightGearBridge', 'venueProjection', 'accessibleMeetingLocations', 'timedHumanRehearsal'];
const missing = required.filter((gate) => manifest.gates?.[gate]?.verified !== true || !manifest.gates[gate].evidence);
for (const name of ['polymind', 'matching', 'puck', 'flight', 'hub']) if (!manifest.applications?.[name]?.revision || !manifest.applications[name].artefact) missing.push(`${name} exact deployed revision/artefact`);
if (missing.length) { console.error(`Release is not verified:\n${missing.map((gate) => `- ${gate}`).join('\n')}`); process.exitCode = 1; }
else console.log('Recorded release gates and artefact references are complete. This checks the manifest, not the truth of human-entered evidence.');
