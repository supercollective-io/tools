<script lang="ts">
import { onMount } from 'svelte';
import { page } from '$app/state';
import { request } from '../../../lib/api.ts';
import Arena from '../../../lib/components/Arena.svelte';
import { initialState, type Recording, STEP_MS } from '../../../lib/core/engine.ts';

let recording = $state<Recording | null>(null),
  error = $state(''),
  index = $state(0),
  playing = $state(false);
const frame = $derived(recording?.frames[index]);
const puckState = $derived(frame?.state ?? (recording ? initialState(recording.config) : null));
const selected = $derived(
  recording?.options.find((o) => o.id === recording?.result.selectedId)?.label,
);
onMount(() => {
  let disposed = false;
  void request<Recording>(`/api/recordings/${page.params.id}`)
    .then((r) => {
      if (!disposed) recording = r;
    })
    .catch((e) => (error = e.message));
  const timer = setInterval(() => {
    if (playing && recording) {
      if (index < recording.frames.length - 1) index++;
      else playing = false;
    }
  }, STEP_MS);
  return () => {
    disposed = true;
    clearInterval(timer);
  };
});
</script>
<svelte:head><title>Round replay — Puck</title></svelte:head>
{#if error}
  <section class="empty-state">
    <h1>No replay available.</h1>
    <p role="alert">{error}</p>
    <a href="/">Back to Puck</a>
  </section>
{:else if !recording}
  <p class="empty-state">Loading the round…</p>
{:else}
  <div class="room-top">
    <div>
      <p class="eyebrow">ROUND REPLAY</p>
      <h1 class="question-title">{recording.question}</h1>
    </div>
    <a class="secondary" href={`/room/${recording.roomId}`}>Back to room ↗</a>
  </div>
  <div class="room-layout">
    <section class="board-panel">
      <div class="board-top">
        <span>All magnets visible</span
        ><span class="timer">{((index * STEP_MS) / 1000).toFixed(1)}s</span>
      </div>
      <Arena options={recording.options} state={puckState} replayInputs={frame?.inputs ?? []} />
      <div class="replay-controls">
        <button
          type="button"
          class="primary"
          onclick={() => {
            if (recording && index >= recording.frames.length - 1) index = 0;
            playing = !playing;
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button><label class="replay-scrubber"
          >Round timeline<input
            aria-label="Round timeline"
            type="range"
            min="0"
            max={Math.max(0, recording.frames.length - 1)}
            step="1"
            bind:value={index}
            oninput={() => (playing = false)}
          ></label
        >
      </div>
    </section>
    <aside class="room-sidebar">
      <section class="round-card">
        <p class="eyebrow">THE OUTCOME</p>
        <h2>{selected ?? recording.result.phase.replace('-', ' ')}</h2>
        <p class="muted">
          A record of how the group moved. This outcome does not imply unanimous agreement.
        </p>
        <a class="secondary full" href={`/api/recordings/${recording.id}?download`}
          >Download recording ↓</a
        >
      </section>
      <section>
        <h3>About this round</h3>
        <dl class="round-details">
          <div>
            <dt>Participants</dt>
            <dd>{recording.participants.length}</dd>
          </div>
          <div>
            <dt>Mechanics</dt>
            <dd>{recording.engineVersion}</dd>
          </div>
          <div>
            <dt>Recorded</dt>
            <dd>{new Date(recording.startedAt).toLocaleString('en-GB')}</dd>
          </div>
        </dl>
        <p class="small muted">
          The download includes the applied inputs, authoritative states and parameters used for
          this round.
        </p>
      </section>
    </aside>
  </div>
{/if}
