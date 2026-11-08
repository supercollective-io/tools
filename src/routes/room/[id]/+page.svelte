<script lang="ts">
import { onMount } from 'svelte';
import { page } from '$app/state';
import { request } from '../../../lib/api.ts';
import Arena from '../../../lib/components/Arena.svelte';
import { type Point, terminal } from '../../../lib/core/engine.ts';
import type { RoomView, ServerMessage } from '../../../lib/core/protocol.ts';

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
    if (room.me) connect();
    else connection = 'Not joined';
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
    if (socket?.readyState === WebSocket.OPEN)
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
    await navigator.clipboard.writeText(location.href);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  } catch {
    error = 'Copy the room address from your browser to invite someone.';
  }
}
</script>
<svelte:head><title>{room?.question ?? 'Join a room'} — Puck</title></svelte:head>
{#if !room}
  <section class="empty-state">
    <p>{error || 'Opening your room…'}</p>
    <a href="/">Back to Puck</a>
  </section>
{:else if !room.me}
  <section class="join-panel">
    <p class="eyebrow">YOU’RE INVITED</p>
    <h1>A place at<br>the puck.</h1>
    <p class="lede">{room.question}</p>
    <form onsubmit={join}>
      <label
        >Your name<input
          bind:value={name}
          required
          maxlength="32"
          autocomplete="given-name"
          placeholder="Enter your name"
        ></label
      >
      {#if error}
        <p role="alert" class="error">{error}</p>
      {/if}
      <button type="submit" class="primary" disabled={busy}>
        {busy ? 'Joining…' : 'Join the room'}
        ↗
      </button>
    </form>
    <p class="small muted">
      Your magnet is private during the round. Afterwards, participants can replay everyone’s
      movements.
    </p>
  </section>
{:else}
  <div class="room-top">
    <div>
      <p class="eyebrow">THE QUESTION</p>
      <h1 class="question-title">{room.question}</h1>
    </div>
    <button type="button" class="secondary" onclick={copy}>
      {copied ? 'Link copied ✓' : 'Invite someone ↗'}
    </button>
  </div>
  <div class="room-layout">
    <section class="board-panel">
      <div class="board-top">
        <span class="connection" class:online={connection === 'Connected'}
          ><span></span>{connection}</span
        ><span class="timer" role="timer" aria-label="Seconds remaining"
          >{room.round
            ? `${Math.ceil(Math.max(0, 60000 - room.round.state.elapsedMs) / 1000)}s`
            : '60-second rounds'}</span
        >
      </div>
      <Arena
        options={room.options}
        state={room.round?.state ?? null}
        enabled={connection === 'Connected'}
        {magnet}
        {engaged}
        oninput={input}
      />
      <div class="board-bottom">
        <span><i class="magnet-key"></i>Your magnet</span
        ><span
          >{active
            ? 'Stay close to the puck to keep your pull strong.'
            : 'Hold and drag to practise your magnet.'}</span
        >
      </div>
    </section>
    <aside class="room-sidebar">
      <section class="round-card" aria-live="polite">
        <p class="eyebrow">
          {active ? 'ROUND IN PROGRESS' : status === 'waiting' ? 'YOUR ROOM' : 'ROUND COMPLETE'}
        </p>
        <h2>
          {status === 'selected'
            ? selectedLabel
            : status === 'timed-out'
              ? 'No decision. Yet.'
              : status === 'cancelled'
                ? 'Round cancelled.'
                : status === 'interrupted'
                  ? 'Round interrupted.'
                  : active
                    ? 'Find a direction.'
                    : 'Gather your people.'}
        </h2>
        <p class="muted">
          {status === 'selected'
            ? 'The puck settled here. That doesn’t mean everyone agrees.'
            : status === 'timed-out'
              ? 'The time ran out before the puck settled on an option. You can try another round.'
              : active
                ? 'Pull towards an option. Adjust your direction as the group moves.'
                : status === 'interrupted'
                  ? 'The connection or server was interrupted. Start a fresh round when everyone is back.'
                  : 'Share the room link. Start when at least two people are connected.'}
        </p>
        {#if room.me.host}
          {#if active}
            <button
              type="button"
              class="secondary full"
              disabled={busy}
              onclick={() => action('cancel')}
            >
              Cancel round
            </button>
          {:else}
            <button
              type="button"
              class="primary full"
              disabled={busy || connected < 2 || connection !== 'Connected'}
              onclick={() => action('start')}
            >
              {room.round ? 'Start another round' : 'Start round'} <span aria-hidden="true">→</span>
            </button>
          {/if}
        {:else if !active}
          <p class="small muted">Your host will start the next round.</p>
        {/if}
      </section>
      <section class="people-panel">
        <div class="section-heading">
          <h3>In the room</h3>
          <span class="pill">{connected} online</span>
        </div>
        <ul>
          {#each room.participants as participant}
            <li>
              <span class="avatar">{participant.name.slice(0, 1).toUpperCase()}</span
              ><span
                >{participant.name}{participant.id === room.me.id ? ' (you)' : ''}<small
                  >{participant.id === room.me.id && room.me.host
                    ? 'Host'
                    : participant.connected
                      ? 'Ready'
                      : 'Disconnected'}</small
                ></span
              ><span class="person-dot" class:present={participant.connected}></span>
            </li>
          {/each}
        </ul>
      </section>
      <details class="how-to">
        <summary>How to pull</summary>
        <p>
          Hold and drag your magnet near the puck. A closer magnet pulls harder. Release to stop.
          You can change your mind at any time.
        </p>
        <p>Keyboard: focus the arena, move with arrow keys and hold Space to pull.</p>
        <p>A selection needs 1.5 seconds inside a target. A timeout is not agreement.</p>
      </details>
      {#if room.history.some((r) => r.status !== 'active')}
        <section class="history">
          <h3>Earlier rounds</h3>
          {#each room.history.filter((r) => r.status !== 'active') as round}
            <a href={`/replay/${round.id}`}
              ><span>{round.selectedLabel ?? round.status.replace('-', ' ')}</span
              ><span>Replay ↗</span></a
            >
          {/each}
        </section>
      {/if}
      {#if error}
        <p role="alert" class="error">{error}</p>
      {/if}
    </aside>
  </div>
{/if}
