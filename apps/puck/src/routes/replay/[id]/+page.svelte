<script lang="ts">
import { onMount } from 'svelte';
import { page } from '$app/state';
import { request } from '../../../lib/api.ts';
import Arena from '../../../lib/components/Arena.svelte';
import ModeNotice from '../../../lib/components/ModeNotice.svelte';
import { initialState, type Recording, STEP_MS } from '../../../lib/core/engine.ts';
import { personalised, projectState } from '../../../lib/core/experiments.ts';
import { contributionsAt } from '../../../lib/core/replay.ts';

let recording = $state<Recording | null>(null),
  error = $state(''),
  index = $state(0),
  playing = $state(false);
let perspective = $state('');
let contributor = $state('');
const contributionView = $derived(perspective === 'contributions');
const allContributions = $derived(
  recording && contributionView ? contributionsAt(recording, index) : [],
);
const contributions = $derived(
  allContributions.filter((c) => !contributor || c.participantId === contributor),
);
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
      {contributionView
        ? 'Option contributions — before cancellation'
        : perspective
          ? 'Personal view — own magnet'
          : personalised(recording.config.mode ?? 'baseline')
            ? 'Shared view — resultant pulls'
            : 'All participants’ magnets'}
    </p>
    {#if personalised(recording.config.mode ?? 'baseline')}
      <label
        >Replay view<select bind:value={perspective}>
          <option value="">Shared simulation — resultant pulls</option>
          <option value="contributions">Option contributions</option>
          {#each recording.participants as participant}
            <option value={participant.id}>{participant.name}’s layout</option>
          {/each}
        </select></label
      >
    {/if}
    {#if contributionView}
      <label
        >Participant<select bind:value={contributor}>
          <option value="">All participants</option>
          {#each recording.participants as participant}
            <option value={participant.id}>{participant.name}</option>
          {/each}
        </select></label
      >
      <p class="muted">
        Arrows show each person’s contribution towards each option before cancellation. Length
        represents force; percentages show the split of that person’s pull. Orange shows the
        separate correction.
      </p>
    {:else if !perspective && personalised(recording.config.mode ?? 'baseline')}
      <p class="muted">
        Synthetic magnets represent resultant forces, not participants’ actual positions.
      </p>
    {/if}
    <Arena
      options={localOptions ?? recording.options}
      state={displayState}
      replayInputs={contributionView ? [] : displayedInputs}
      {contributions}
    />
    {#if contributionView}
      {#if contributions.length}
        <ul class="contribution-legend" aria-label="Option contributions">
          {#each recording.participants.filter((p) =>
            contributions.some((c) => c.participantId === p.id),
          ) as participant}
            {@const parts = contributions.filter((c) => c.participantId === participant.id)}
            <li>
              <span class="contributor-key" style:background={parts[0].colour}></span>
              {participant.name}:
              {parts.map((c) => `${Math.round(c.proportion * 100)}% ${c.label}`).join(' · ')}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No applied option contributions at this moment.</p>
      {/if}
    {/if}
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

<style>
.contribution-legend {
  list-style: none;
  padding: 0;
  font-size: 0.875rem;
}
.contributor-key {
  display: inline-block;
  width: 12px;
  height: 3px;
  vertical-align: middle;
  margin-right: 8px;
}
</style>
