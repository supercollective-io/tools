<script lang="ts">
import { corrected, MODES, type Mode, personalised } from '../core/experiments.ts';

let { mode }: { mode: Mode } = $props();
</script>
{#if mode !== 'baseline'}
  <details class="mode-notice">
    <summary>Experimental: {MODES[mode]}</summary>
    {#if corrected(mode)}
      <p>
        A centre-restoring force opposes positional bias. It grows with distance from the centre, up
        to 16% of the sum of applied participant-force magnitudes. The orange line shows this
        correction. This is an experimental rule, not a guarantee of unbiased results.
      </p>
    {/if}
    {#if personalised(mode)}
      <p>
        Option positions differ between participants. Pulls between two option directions are split
        proportionally between those options in the shared simulation. Closer magnets still pull
        harder. Your puck is a projection of that simulation; paths and distances can differ between
        screens.
      </p>
    {/if}
    <p>
      Everyone has the same maximum influence. Settings are fixed for this room and saved with each
      round.
    </p>
  </details>
{/if}
<style>
.mode-notice {
  margin-block: 12px;
  font-size: 0.875rem;
}
</style>
