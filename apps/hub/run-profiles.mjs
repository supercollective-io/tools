import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import zkm from './profiles/zkm-production-show-14-11-2026.json' with { type: 'json' };

export const profiles = [zkm];
export function programme(profile = zkm) {
  return profile.activities.map(activity => ({ ...activity, status: activity.kind === 'activity' ? 'unavailable' : 'ready' }));
}

// Runs are private preparation records. Only installing a prepared programme
// touches the live manifest, through the Hub's existing revision-checked writer.
export async function openRuns(config, { atomicSave, HttpError, appRequest, appSummary, configurePolymind, participantUrl, validateSelection }) {
  const path = join(config.dataDir, 'runs.json');
  const fail = message => { throw new HttpError(400, message); };
  const string = (value, label, max) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`Enter ${label}.`);
    return value.trim();
  };
  const keys = (value, allowed) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('Invalid run preparation fields.');
  };
  function settings(value) {
    keys(value, ['writingQuestion', 'voiceQuestion', 'model', 'voiceModel', 'puckQuestion', 'puckOptions', 'flightUrl']);
    const parseModel = model => {
      keys(model, ['provider', 'model', 'reasoningEffort', 'maxInputCharacters', 'maxOutputTokens', 'timeoutMs']);
      if (!['openai', 'ollama'].includes(model.provider)) fail('Choose a text provider.');
      if (model.reasoningEffort !== undefined && (model.provider !== 'openai' || !['none', 'low', 'medium', 'high'].includes(model.reasoningEffort))) fail('Choose a supported OpenAI reasoning effort.');
      const modelId = string(model.model, 'the exact text model ID', 150);
      for (const [key, minimum, maximum] of [['maxInputCharacters', 1, 1000000], ['maxOutputTokens', 100, 16000], ['timeoutMs', 1000, 360000]]) {
        if (!Number.isInteger(model[key]) || model[key] < minimum || model[key] > maximum) fail(`Invalid ${key}.`);
      }
      return { ...(model.reasoningEffort !== undefined ? { reasoningEffort: model.reasoningEffort } : {}), provider: model.provider, model: modelId, maxInputCharacters: model.maxInputCharacters, maxOutputTokens: model.maxOutputTokens, timeoutMs: model.timeoutMs };
    };
    const model = parseModel(value.model);
    const voiceModel = value.voiceModel === undefined ? undefined : parseModel(value.voiceModel);
    if (!Array.isArray(value.puckOptions) || value.puckOptions.length === 1 || value.puckOptions.length > 6) fail('Enter two to six Puck answer options, or leave them empty until the room proposes them.');
    const puckOptions = value.puckOptions.map(option => string(option, 'a Puck answer option', 48));
    if (new Set(puckOptions.map(option => option.toLowerCase())).size !== puckOptions.length) fail('Puck answer options must be distinct.');
    let flightUrl = '';
    if (value.flightUrl) {
      flightUrl = participantUrl(value.flightUrl, config);
      const invitation = new URL(flightUrl);
      if (invitation.origin !== config.appOrigins.flight || invitation.pathname !== '/' || !/^\?key=[A-Za-z0-9_-]{24,128}$/.test(invitation.search)) fail('Use Flight’s public participant invitation.');
    }
    return {
      writingQuestion: string(value.writingQuestion, 'the writing question', 2000),
      voiceQuestion: string(value.voiceQuestion, 'the Collective Voice question', 2000),
      model, ...(voiceModel ? { voiceModel } : {}),
      puckQuestion: string(value.puckQuestion, 'the Puck question', 240), puckOptions, flightUrl,
    };
  }
  let data;
  try {
    data = JSON.parse(await readFile(path, 'utf8'));
    if (data.schemaVersion !== 1 || !Array.isArray(data.runs) || !Number.isSafeInteger(data.revision) || data.revision < 1) throw new Error('Invalid run registry');
    const ids = new Set(), requests = new Set();
    for (const run of data.runs) {
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(run.id) || !/^[a-zA-Z0-9_-]{16,100}$/.test(run.requestId) || ids.has(run.id) || requests.has(run.requestId) ||
        !profiles.some(profile => profile.id === run.profileId) || !['production', 'rehearsal'].includes(run.mode) || !run.bindings || !Array.isArray(run.activities) ||
        !Number.isSafeInteger(run.revision) || run.revision < 1 || !/^[a-f0-9]{64}$/.test(run.creationFingerprint) ||
        !Number.isFinite(Date.parse(run.createdAt)) || typeof run.label !== 'string' || !run.label.trim() || run.label.length > 150 ||
        (run.puckPreparationStarted !== undefined && typeof run.puckPreparationStarted !== 'boolean')) throw new Error('Invalid saved run');
      keys(run.bindings, ['polymind', 'collective-voice', 'puck', 'flight']);
      for (const binding of Object.values(run.bindings)) {
        keys(binding, ['id']);
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(binding.id ?? '')) throw new Error('Invalid saved app binding');
      }
      validateSelection({ activeId: 'arrival', activities: run.activities }, config);
      if (run.operatorNotes !== undefined) {
        keys(run.operatorNotes, run.activities.map(item => item.id));
        for (const note of Object.values(run.operatorNotes)) string(note, 'an operator cue', 2000);
      }
      if (run.activityBindings !== undefined) {
        keys(run.activityBindings, ['polymind', 'collective-voice', 'puck', 'flight']);
        for (const targets of Object.values(run.activityBindings)) {
          if (!Array.isArray(targets) || !targets.length || new Set(targets).size !== targets.length ||
            targets.some(target => !run.activities.some(item => item.id === target && item.kind === 'activity'))) throw new Error('Invalid saved activity bindings');
        }
      }
      settings(run.settings); ids.add(run.id); requests.add(run.requestId);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    data = { schemaVersion: 1, revision: 1, runs: [] };
    await atomicSave(path, data);
  }
  let writes = Promise.resolve();
  const serial = operation => {
    const result = writes.then(operation);
    writes = result.catch(() => {});
    return result;
  };
  async function persist(run) {
    run = { ...run, revision: (data.runs.find(item => item.id === run.id)?.revision ?? 0) + 1 };
    const next = { ...data, revision: data.revision + 1, runs: data.runs.some(item => item.id === run.id)
      ? data.runs.map(item => item.id === run.id ? run : item) : [...data.runs, run] };
    await atomicSave(path, next); data = next;
    return structuredClone(run);
  }
  const get = id => {
    const run = data.runs.find(item => item.id === id);
    if (!run) throw new HttpError(404, 'Run not found. Refresh the saved runs.');
    return structuredClone(run);
  };
  return {
    list: () => data.runs.map(({ id, profileId, label, mode, createdAt }) => ({ id, profileId, label, mode, createdAt })),
    get,
    updateSettings: (id, body) => serial(async () => {
      keys(body, ['settings', 'expectedRevision']);
      const run = get(id);
      if (!Number.isSafeInteger(body.expectedRevision)) fail('Provide the saved run revision.');
      if (body.expectedRevision !== run.revision) throw new HttpError(409, 'Another operator changed this run. Resume preparation before editing it.');
      if (run.preparationStarted || run.puckPreparationStarted || Object.keys(run.bindings).length) throw new HttpError(409, 'App preparation has already started. Adjust session settings in the app controls, or create a fresh rehearsal.');
      run.settings = settings(body.settings);
      const flight = run.activities.find(item => item.id === 'flight');
      delete flight.url; flight.status = 'unavailable';
      if (run.settings.flightUrl) Object.assign(flight, { status: 'ready', url: run.settings.flightUrl });
      return persist(run);
    }),
    setPuckOptions: (id, body) => serial(async () => {
      keys(body, ['options', 'expectedRevision']);
      const run = get(id);
      if (!Number.isSafeInteger(body.expectedRevision)) fail('Provide the saved run revision.');
      if (body.expectedRevision !== run.revision) throw new HttpError(409, 'Another operator changed this run. Resume preparation before saving options again.');
      if (run.bindings.puck || run.puckPreparationStarted) throw new HttpError(409, 'Puck room preparation has already started. Retry its original options or create a fresh rehearsal.');
      const prepared = settings({ ...run.settings, puckOptions: body.options });
      if (prepared.puckOptions.length < 2) fail('Enter at least two options proposed by the room.');
      run.settings = prepared;
      return persist(run);
    }),
    create: body => serial(async () => {
      keys(body, ['requestId', 'profileId', 'mode', 'settings']);
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(body.requestId ?? '')) fail('Provide a creation request key.');
      const profile = profiles.find(item => item.id === body.profileId);
      if (!profile || !['production', 'rehearsal'].includes(body.mode)) fail('Choose a profile and run type.');
      const prepared = settings(body.settings);
      const fingerprint = createHash('sha256').update(JSON.stringify({ profileId: profile.id, mode: body.mode, settings: prepared })).digest('hex');
      const existing = data.runs.find(run => run.requestId === body.requestId);
      if (existing) {
        if (existing.creationFingerprint !== fingerprint) throw new HttpError(409, 'This request already has different settings. Resume its run or create a fresh run.');
        return structuredClone(existing);
      }
      if (data.runs.length >= 200) throw new HttpError(409, 'Run storage is full. Archive the installation’s run records before creating more.');
      // One production run per named profile. Rehearsals always get fresh IDs.
      if (body.mode === 'production' && data.runs.some(run => run.profileId === profile.id && run.mode === 'production')) throw new HttpError(409, 'This profile already has a production run. Resume it, or create a fresh rehearsal.');
      const activities = programme(profile);
      if (prepared.flightUrl) Object.assign(activities.find(item => item.id === 'flight'), { status: 'ready', url: prepared.flightUrl });
      return persist({ id: randomUUID(), requestId: body.requestId, creationFingerprint: fingerprint, profileId: profile.id,
        activityBindings: structuredClone(profile.activityBindings ?? {}), operatorNotes: structuredClone(profile.operatorNotes ?? {}),
        label: `${profile.label}${body.mode === 'rehearsal' ? ' · Rehearsal' : ''}`,
        mode: body.mode, createdAt: new Date().toISOString(), settings: prepared, activities, bindings: {} });
    }),
    prepare: (id, activityId) => serial(async () => {
      if (!['polymind', 'collective-voice', 'puck', 'flight'].includes(activityId)) fail('Choose a preparable activity.');
      const run = get(id), profile = profiles.find(item => item.id === run.profileId);
      if (activityId === 'flight') {
        // Resolve the profile's shared Flight resource through its ordinary API.
        // Refresh on resume so a rotated audience invitation is not reused.
        if (run.settings.flightUrl) {
          const activity = { id: 'current', title: 'Flight', url: run.settings.flightUrl };
          Object.assign(run.activities.find(item => item.id === 'flight'), { status: 'ready', url: activity.url });
          return { run: await persist(run), activity, resumed: false };
        }
        const connection = profile.connections?.flight;
        if (!connection || connection.app !== 'flight' || connection.resourceId !== 'current') fail('The profile has no Flight connection.');
        const activity = appSummary(config, 'flight', await appRequest(config, 'flight', connection.resourceId));
        const resumed = Boolean(run.bindings.flight);
        run.bindings.flight = { id: activity.id };
        Object.assign(run.activities.find(item => item.id === 'flight'), { status: 'ready', url: activity.url });
        return { run: await persist(run), activity, resumed };
      }
      const app = activityId === 'puck' ? 'puck' : 'polymind';
      let binding = run.bindings[activityId];
      if (binding) {
        // A resume only observes resources; never reopen or rewrite a used session.
        const current = appSummary(config, app, await appRequest(config, app, binding.id));
        return { run, activity: current, resumed: true };
      }
      // Reject deterministic installation errors before locking any settings.
      if (!config.appTokens?.[app] || !config.allowedOrigins.has(config.appOrigins[app])) throw new HttpError(503, 'App connection is not configured. Enable its operator token and participant website before preparing it.');
      if (app === 'puck') {
        if (run.settings.puckOptions.length < 2) throw new HttpError(409, 'Collect two to six answer options from the room before preparing Puck.');
        // Freeze options before the request leaves Hub: an uncertain response
        // must be retried with the same settings, including after restart.
        run.puckPreparationStarted = true;
      }
      if (!run.preparationStarted || app === 'puck') { run.preparationStarted = true; await persist(run); }
      const options = app === 'puck' ? { question: run.settings.puckQuestion, options: run.settings.puckOptions, mode: 'baseline' }
        : { title: `${run.label} · ${activityId === 'polymind' ? 'Polymind' : 'Collective Voice'}`, capacity: profile.capacity };
      // Persisted run ID makes retries stable even after a crash between an app
      // committing its resource and Hub receiving or storing the response.
      const created = await appRequest(config, app, undefined, options, `${run.id}-${activityId}`);
      binding = appSummary(config, app, await appRequest(config, app, created.id));
      if (app === 'polymind') await configurePolymind(binding.id, {
        mode: activityId === 'polymind' ? 'bounded' : 'continuous',
        prompt: activityId === 'polymind' ? run.settings.writingQuestion : run.settings.voiceQuestion,
        model: activityId === 'collective-voice' ? run.settings.voiceModel ?? run.settings.model : run.settings.model,
      });
      run.bindings[activityId] = { id: binding.id };
      for (const target of run.activityBindings?.[activityId] ?? [activityId]) {
        Object.assign(run.activities.find(item => item.id === target), { status: 'ready', url: binding.url });
      }
      return { run: await persist(run), activity: binding, resumed: false };
    }),
  };
}
