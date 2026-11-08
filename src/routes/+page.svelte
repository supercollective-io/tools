<script lang="ts">
import { request } from '../lib/api.ts';

let name = $state('');
let question = $state('What should we focus on next?');
let options = $state(['Reliability', 'Accessibility', 'New features', 'Lower costs']);
let busy = $state(false),
  error = $state('');
async function create(event: SubmitEvent) {
  event.preventDefault();
  busy = true;
  error = '';
  try {
    const room = await request<{ id: string }>('/api/rooms', { name, question, options });
    window.location.assign(`/room/${room.id}`);
  } catch (e) {
    error = (e as Error).message;
    busy = false;
  }
}
</script>
<svelte:head><title>Puck — find a direction together</title></svelte:head>
<div class="landing">
  <section class="intro">
    <p class="eyebrow"><span class="tiny-dot"></span> THINK TOGETHER. MOVE TOGETHER.</p>
    <h1>Find your<br>common pull.</h1>
    <p class="lede">
      One question. A few possibilities. A shared puck that moves with everyone’s input.
    </p>
    <div class="mini-arena" aria-hidden="true">
      <span class="orbit orbit-one"></span><span class="orbit orbit-two"></span
      ><span class="mini-puck"></span><span class="mini-magnet"></span
      ><span class="mini-label">Room for a change of mind.</span>
    </div>
    <div class="intro-steps">
      <span><b>01</b> Share a question</span><span><b>02</b> Invite your people</span
      ><span><b>03</b> Find a direction</span>
    </div>
  </section>
  <section class="create-panel">
    <div class="section-heading">
      <h2>Start a room</h2>
      <span class="pill">2–32 people</span>
    </div>
    <p class="muted">No account needed. You’ll get a link to share.</p>
    <form onsubmit={create}>
      <label
        >Your name<input
          required
          maxlength="32"
          autocomplete="given-name"
          bind:value={name}
          placeholder="How should we call you?"
        ></label
      >
      <label
        >The question<textarea
          required
          maxlength="240"
          rows="2"
          bind:value={question}
        ></textarea></label
      >
      <fieldset>
        <legend>The possibilities <span class="muted">2–6 options</span></legend>
        <div class="options-list">
          {#each options as _, i}
            <div class="option-input">
              <span class="option-letter">{String.fromCharCode(65 + i)}</span>
              <input aria-label={`Option ${i + 1}`} required maxlength="48" bind:value={options[i]}>
              {#if options.length > 2}
                <button
                  type="button"
                  class="icon-button"
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
            + Add a possibility
          </button>
        {/if}
      </fieldset>
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
      <button type="submit" class="primary full" disabled={busy}>
        {busy ? 'Creating your room…' : 'Create room'} <span aria-hidden="true">↗</span>
      </button>
      <p class="small muted">A 60-second round. Everyone can change their mind.</p>
    </form>
  </section>
</div>
