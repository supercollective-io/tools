<script lang="ts">
import { onMount } from 'svelte';
import { request } from '../lib/api.ts';

let hydrated = $state(false);
onMount(() => {
  hydrated = true;
});
let question = $state('What should we focus on next?');
let options = $state(['Reliability', 'Accessibility', 'New features', 'Lower costs']);
let busy = $state(false),
  error = $state('');
async function create(event: SubmitEvent) {
  event.preventDefault();
  busy = true;
  error = '';
  try {
    const room = await request<{ id: string }>('/api/rooms', { question, options });
    window.location.assign(`/room/${room.id}`);
  } catch (e) {
    error = (e as Error).message;
    busy = false;
  }
}
</script>
<svelte:head><title>Create a room — Puck</title></svelte:head>
<section class="form-page">
  <h1>Create a room</h1>
  <form onsubmit={create}>
    <label
      >Question<textarea required maxlength="240" rows="2" bind:value={question}></textarea></label
    >
    <fieldset>
      <legend>Options (2–6)</legend>
      <div class="options-list">
        {#each options as _, i}
          <div class="option-input">
            <input aria-label={`Option ${i + 1}`} required maxlength="48" bind:value={options[i]}>
            {#if options.length > 2}
              <button
                type="button"
                aria-label={`Remove option ${i + 1}`}
                onclick={() => (options = options.filter((_, index) => index !== i))}
              >
                ×
              </button>
            {/if}
          </div>
        {/each}
      </div>
      {#if options.length < 6}
        <button type="button" class="text-button" onclick={() => (options = [...options, ''])}>
          Add option
        </button>
      {/if}
    </fieldset>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    <button type="submit" class="primary" disabled={busy || !hydrated}>
      {busy ? 'Creating…' : 'Create room'}
    </button>
  </form>
</section>
