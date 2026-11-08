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
  <p role="alert">{error}</p>
{:else if !recording}
  <p role="status">Loading replay…</p>
{:else}
  <section class="session">
    <h1>{recording.question}</h1>
    <div class="toolbar">
      <a href={`/room/${recording.roomId}`}>Back to room</a>
      <a href={`/api/recordings/${recording.id}?download`}>Download recording</a>
    </div>
    <p>Replay · {selected ?? recording.result.phase.replace('-', ' ')} · All magnets visible</p>
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
      </button>
      <input
        aria-label="Round timeline"
        type="range"
        min="0"
        max={Math.max(0, recording.frames.length - 1)}
        step="1"
        bind:value={index}
        oninput={() => (playing = false)}
      >
      <span class="timer">{((index * STEP_MS) / 1000).toFixed(1)}s</span>
    </div>
  </section>
{/if}
