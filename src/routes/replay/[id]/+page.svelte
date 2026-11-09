<script lang="ts">
import { onMount } from 'svelte';
import { page } from '$app/state';
import { request } from '../../../lib/api.ts';
import Arena from '../../../lib/components/Arena.svelte';
import ModeNotice from '../../../lib/components/ModeNotice.svelte';
import { initialState, type Recording, STEP_MS } from '../../../lib/core/engine.ts';
import { personalised, projectState } from '../../../lib/core/experiments.ts';

let recording = $state<Recording | null>(null),
  error = $state(''),
  index = $state(0),
  playing = $state(false);
let perspective = $state('');
const frame = $derived(recording?.frames[index]);
const puckState = $derived(frame?.state ?? (recording ? initialState(recording.config) : null));
const localOptions = $derived(recording?.participants.find((p) => p.id === perspective)?.layout);
const displayState = $derived(
  puckState && recording && localOptions
    ? projectState(puckState, recording.options, localOptions)
    : puckState,
);
const displayedInputs = $derived(
  perspective
    ? (frame?.localInputs ?? []).filter((i) => i.participantId === perspective)
    : (frame?.inputs ?? []),
);
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
    <ModeNotice mode={recording.config.mode ?? 'baseline'} />
    <div class="toolbar">
      <a href={`/room/${recording.roomId}`}>Back to room</a>
      <a href={`/api/recordings/${recording.id}?download`}>Download recording</a>
    </div>
    <p>
      Replay · {selected ?? recording.result.phase.replace('-', ' ')} ·
      {perspective ? 'Personal view — own magnet' : 'Shared view — all applied pulls'}
    </p>
    {#if personalised(recording.config.mode ?? 'baseline')}
      <label
        >Replay view<select bind:value={perspective}>
          <option value="">Shared simulation</option>
          {#each recording.participants as participant}
            <option value={participant.id}>{participant.name}’s layout</option>
          {/each}
        </select></label
      >
    {/if}
    <Arena
      options={localOptions ?? recording.options}
      state={displayState}
      replayInputs={displayedInputs}
    />
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
