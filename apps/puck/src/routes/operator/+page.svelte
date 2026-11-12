<script lang="ts">
import { onMount } from 'svelte';

let token = $state('');
let signedIn = $state(false);
let busy = $state(false);
let error = $state('');
let rooms = $state<{ id: string; title: string; status: string }[]>([]);
let requested = $state<string | null>(null);
let question = $state('');
let options = $state('');
let creation: { requestId: string; settings: unknown } | undefined;
async function request(path: string, data?: unknown, key?: string) {
  const response = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { 'Idempotency-Key': key } : {}),
          },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Could not complete the request.');
  return result;
}
async function load() {
  rooms = await request('/api/rooms');
  signedIn = true;
  // A linked older room may be outside the recent-room listing.
  if (requested && !rooms.some((room) => room.id === requested)) {
    const room = await request(`/api/rooms/${encodeURIComponent(requested)}`);
    rooms = [
      { id: room.id, title: room.question, status: room.round?.state.phase ?? 'waiting' },
      ...rooms,
    ];
  }
}
async function login(event: SubmitEvent) {
  event.preventDefault();
  busy = true;
  error = '';
  try {
    await request('/api/operator/login', { token });
    token = '';
    await load();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Could not sign in.';
  } finally {
    busy = false;
  }
}
async function control(id: string) {
  busy = true;
  error = '';
  try {
    await request(`/api/rooms/${encodeURIComponent(id)}/host`, {});
    window.location.assign(`/room/${encodeURIComponent(id)}`);
    return true;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Could not open room controls.';
    busy = false;
    return false;
  }
}
async function create(event: SubmitEvent) {
  event.preventDefault();
  busy = true;
  error = '';
  const settings = {
    question: question.trim(),
    options: options
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean),
    mode: 'baseline',
  };
  try {
    creation ??= JSON.parse(sessionStorage.getItem('puck-room-creation') ?? 'null') ?? undefined;
    if (creation && JSON.stringify(creation.settings) !== JSON.stringify(settings))
      throw new Error(
        'Retry the original settings, or reset the creation request after checking the room list.',
      );
    creation ??= { requestId: crypto.randomUUID(), settings };
    sessionStorage.setItem('puck-room-creation', JSON.stringify(creation));
    const room = await request('/api/rooms', settings, creation.requestId);
    if (await control(room.id)) {
      sessionStorage.removeItem('puck-room-creation');
      creation = undefined;
    }
  } catch (cause) {
    error =
      cause instanceof Error
        ? cause.message
        : 'Could not create the room. Retry the same settings.';
  } finally {
    busy = false;
  }
}
onMount(() => {
  requested = new URL(location.href).searchParams.get('room');
  try {
    const pending = JSON.parse(sessionStorage.getItem('puck-room-creation') ?? 'null');
    if (pending?.settings) {
      question = pending.settings.question;
      options = pending.settings.options.join('\n');
    }
  } catch {
    /* Room access must not depend on browser draft storage. */
  }
  void load().catch((cause) => {
    error = signedIn && cause instanceof Error ? cause.message : 'Sign in to open room controls.';
  });
});
</script>

<svelte:head
  ><title>Puck · Operator</title>
  <meta name="referrer" content="no-referrer"></svelte:head
>
<section class="session">
  <h1>Room controls</h1>
  <p>
    Instance operators can open host controls without joining the activity. Existing hosts keep
    their access.
  </p>
  {#if error}
    <p role="alert">{error}</p>
  {/if}
  {#if !signedIn}
    <form onsubmit={login}>
      <label for="operator-token">Operator access token</label>
      <input
        id="operator-token"
        type="password"
        autocomplete="current-password"
        bind:value={token}
        required
      >
      <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p class="muted">Operator access must be enabled by the person managing this installation.</p>
  {:else}
    {#each rooms.filter((room) => !requested || room.id === requested) as room (room.id)}
      <h2>{room.title}</h2>
      <p>{room.status}</p>
      <button type="button" disabled={busy} onclick={() => control(room.id)}>
        Open host controls
      </button>
    {/each}
    {#if !requested}
      <details>
        <summary>Create a room</summary>
        <form onsubmit={create}>
          <label for="question">Question</label>
          <input id="question" maxlength="240" required bind:value={question}>
          <label for="options">Options — one per line (2–6)</label
          ><textarea id="options" rows="4" required bind:value={options}></textarea>
          <button type="submit" disabled={busy}>Create room and open controls</button>
          <button
            type="button"
            disabled={busy}
            onclick={() => {
              if (
                confirm(
                  'Start a new creation request? Check the room list first: the previous request may have succeeded.',
                )
              ) {
                sessionStorage.removeItem('puck-room-creation');
                creation = undefined;
              }
            }}
          >
            Reset creation request
          </button>
        </form>
      </details>
    {/if}
    {#if !rooms.length}
      <p>No rooms yet. Create one from the Puck home page or through the API.</p>
    {/if}
    <button
      type="button"
      disabled={busy}
      onclick={async () => {
        busy = true;
        try {
          await request('/api/operator/logout', {});
          signedIn = false;
        } catch {
          error = 'Could not sign out. Try again.';
        } finally {
          busy = false;
        }
      }}
    >
      Sign out
    </button>
  {/if}
  <p><a href="/operator">All rooms</a> · <a href="/">Puck home</a></p>
</section>
