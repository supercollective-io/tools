<script lang="ts">
import { onMount } from 'svelte';
import { page } from '$app/state';
import { request } from '../../../lib/api.ts';
import Arena from '../../../lib/components/Arena.svelte';
import InviteQr from '../../../lib/components/InviteQr.svelte';
import ModeNotice from '../../../lib/components/ModeNotice.svelte';
import { type Point, terminal } from '../../../lib/core/engine.ts';
import { optionMixture, personalised, projectState } from '../../../lib/core/experiments.ts';
import type { RoomView, ServerMessage } from '../../../lib/core/protocol.ts';

let inviteUrl = $state('');
let room = $state<RoomView | null>(null),
  error = $state(''),
  name = $state(''),
  busy = $state(false);
let connection = $state('Connecting'),
  copied = $state(false),
  magnet = $state<Point>({ x: 500, y: 580 }),
  engaged = $state(false);
let socket: WebSocket | undefined,
  reconnect: ReturnType<typeof setTimeout>,
  sequence = 0,
  disposed = false,
  blocked = false;
const roomId = page.params.id;
const active = $derived(room?.round && !terminal(room.round.state.phase));
const status = $derived(room?.round?.state.phase ?? 'waiting');
const connected = $derived(room?.participants.filter((p) => p.connected).length ?? 0);
const selectedLabel = $derived(
  room?.options.find((o) => o.id === room?.round?.state.selectedId)?.label,
);
const localView = $derived(Boolean(room?.me?.participating && personalised(room.mode)));
const displayState = $derived(
  room?.round
    ? localView
      ? projectState(room.round.state, room.options, room.localOptions)
      : room.round.state
    : null,
);
const mixture = $derived(
  room && localView && engaged
    ? optionMixture(displayState?.position ?? { x: 500, y: 500 }, magnet, room.localOptions)
    : {},
);
const mixtureLabel = $derived(
  room
    ? Object.entries(mixture)
        .filter(([, weight]) => weight > 0.005)
        .map(
          ([id, weight]) =>
            `${Math.round(weight * 100)}% ${room?.options.find((o) => o.id === id)?.label}`,
        )
        .join(' · ')
    : '',
);
function connect() {
  if (disposed || blocked) return;
  connection = 'Connecting';
  sequence = 0;
  socket = new WebSocket(
    `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/rooms/${roomId}`,
  );
  socket.onopen = () => {
    connection = 'Connected';
    error = '';
  };
  socket.onmessage = (event) => {
    const message: ServerMessage = JSON.parse(event.data);
    if (message.type === 'state') room = message.room;
    else error = message.message;
  };
  socket.onclose = (event) => {
    engaged = false;
    connection = 'Disconnected';
    if (event.code === 4001 || event.code === 1008) {
      blocked = true;
      error = event.reason || 'This connection was closed. Reload to reconnect.';
      return;
    }
    if (!disposed) reconnect = setTimeout(connect, 1500);
  };
}
async function load() {
  try {
    room = await request<RoomView>(`/api/rooms/${roomId}`);
    const invite = await request<{ origin: string }>('/api/invite-origin');
    inviteUrl = new URL(`/room/${roomId}`, invite.origin).href;
    if (room.me) {
      if (!socket) connect();
    } else connection = 'Not joined';
  } catch (e) {
    error = (e as Error).message;
  }
}
function input(point: Point, pulling: boolean) {
  magnet = point;
  engaged = pulling;
}
onMount(() => {
  void load();
  const interval = setInterval(() => {
    if (room?.me?.participating && socket?.readyState === WebSocket.OPEN)
      socket.send(
        JSON.stringify({
          type: 'input',
          sequence: sequence++,
          ...magnet,
          engaged: engaged && document.visibilityState === 'visible',
        }),
      );
  }, 50);
  const release = () => {
    engaged = false;
  };
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', release);
  return () => {
    disposed = true;
    clearTimeout(reconnect);
    clearInterval(interval);
    socket?.close();
    window.removeEventListener('blur', release);
    document.removeEventListener('visibilitychange', release);
  };
});
async function join(event: SubmitEvent) {
  event.preventDefault();
  busy = true;
  error = '';
  try {
    await request(`/api/rooms/${roomId}/join`, { name });
    await load();
  } catch (e) {
    error = (e as Error).message;
  } finally {
    busy = false;
  }
}
async function action(type: 'start' | 'cancel') {
  busy = true;
  error = '';
  try {
    room = await request<RoomView>(`/api/rooms/${roomId}/${type}`, {});
  } catch (e) {
    error = (e as Error).message;
  } finally {
    busy = false;
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(inviteUrl);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  } catch {
    error = `Copy this invite link: ${inviteUrl}`;
  }
}
</script>
<svelte:head><title>{room?.question ?? 'Join a room'} — Puck</title></svelte:head>
{#if !room}
  <p role="status">{error || 'Opening room…'}</p>
{:else if !room.me}
  <section class="form-page">
    <h1>{room.question}</h1>
    <ModeNotice mode={room.mode} />
    <form onsubmit={join}>
      <label
        >Your name<input bind:value={name} required maxlength="32" autocomplete="given-name"></label
      >
      {#if error}
        <p role="alert" class="error">{error}</p>
      {/if}
      <button type="submit" class="primary" disabled={busy}>
        {busy ? 'Joining…' : 'Join the room'}
      </button>
    </form>
    <p class="muted">
      Your magnet is private during the round. Afterwards, participants can replay everyone’s
      movements.
    </p>
  </section>
{:else}
  <section class="session">
    <h1>{room.question}</h1>
    <ModeNotice mode={room.mode} />
    <div class="toolbar">
      <button type="button" onclick={copy}>{copied ? 'Link copied' : 'Copy invite link'}</button>
      <InviteQr url={inviteUrl} />
      {#if room.me.host}
        {#if active}
          <button type="button" disabled={busy} onclick={() => action('cancel')}>
            Cancel round
          </button>
        {:else}
          <button
            type="button"
            class="primary"
            disabled={busy || connected < 2 || connection !== 'Connected'}
            onclick={() => action('start')}
          >
            {room.round ? 'Start another round' : 'Start round'}
          </button>
        {/if}
      {/if}
      <span class="muted" role="status">{connection}</span>
      {#if active}
        <span class="timer" role="timer" aria-label="Seconds remaining"
          >{Math.ceil(Math.max(0, 60000 - (room.round?.state.elapsedMs ?? 0)) / 1000)}s</span
        >
      {/if}
    </div>
    <div class="round-status" aria-live="polite">
      {#if active}
        <p>Round in progress</p>
      {:else if status === 'waiting'}
        <p class="muted">
          {room.me.host
            ? 'At least two people must be connected to start.'
            : 'Waiting for the host to start.'}
        </p>
      {:else}
        <h2>
          {status === 'selected'
            ? selectedLabel
            : status === 'timed-out'
              ? 'Time ran out. No selection.'
              : status === 'cancelled'
                ? 'Round cancelled.'
                : 'Round interrupted.'}
        </h2>
      {/if}
    </div>
    {#if error}
      <p role="alert" class="error">{error}</p>
    {/if}
    {#if !room.me.participating && !active}
      <details>
        <summary>Join as a participant</summary>
        <form onsubmit={join}>
          <label
            >Your name<input
              bind:value={name}
              required
              maxlength="32"
              autocomplete="given-name"
            ></label
          >
          <button type="submit" disabled={busy}>Join the room</button>
        </form>
      </details>
    {/if}
    <Arena
      options={localView ? room.localOptions : room.options}
      state={displayState}
      enabled={connection === 'Connected' && room.me.participating}
      {magnet}
      {engaged}
      oninput={input}
    />
    {#if localView}
      <p class="muted">
        {mixtureLabel || 'Pull between option directions to split your influence.'}
      </p>
    {/if}
    {#if room.me.participating}
      <p class="arena-hint">
        <span class="magnet-key"></span>Hold and drag near the puck to pull. Release to stop.
      </p>
    {/if}
    <div class="support">
      <details>
        <summary>{connected} online</summary>
        <ul>
          {#each room.participants as participant}
            <li>
              {participant.name}{participant.id === room.me.id
                ? ' (you)'
                : ''}{!participant.connected ? ' — disconnected' : ''}
            </li>
          {/each}
        </ul>
      </details>
      <details>
        <summary>How to play</summary>
        <p>
          A closer magnet pulls harder. Keyboard: focus the arena, move with arrow keys and hold
          Space to pull.
        </p>
        <p>
          A round lasts 60 seconds. The puck selects an option after 1.5 seconds inside its target;
          this does not mean everyone agrees.
        </p>
        <p>Your magnet is private live. Participants can replay everyone’s movements afterwards.</p>
      </details>
      {#if room.history.some((r) => r.status !== 'active')}
        <details open>
          <summary>Replays</summary>
          <ul>
            {#each room.history.filter((r) => r.status !== 'active') as round}
              <li>
                <a href={`/replay/${round.id}`}
                  >{round.selectedLabel ?? round.status.replace('-', ' ')}
                  — Replay</a
                >
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </div>
  </section>
{/if}
