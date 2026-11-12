<script lang="ts">
import { onMount } from 'svelte';
import Arena from '../../lib/components/Arena.svelte';
import {
  BASELINE,
  initialState,
  layout,
  type Point,
  STEP_MS,
  type State,
  step,
  terminal,
} from '../../lib/core/engine.ts';

const config = { ...BASELINE, participantCount: 1 };
let demanding = $state(false);
const options = $derived(
  layout(
    demanding
      ? [
          'Reliability over the next twelve months',
          'Access for people using older devices',
          'Lower running costs',
          'More time for experimentation',
          'Support for new participants',
          'Keeping the work independent',
        ]
      : ['Reliability', 'Accessibility', 'New features', 'Lower costs'],
  ),
);
let demoState = $state<State>({ ...initialState(config), phase: 'active' });
let magnet = $state<Point>({ x: 500, y: 580 });
let engaged = $state(false);
let running = $state(true);
let scenario = $state('interactive');
const result = $derived(options.find((option) => option.id === demoState.selectedId)?.label);
function reset() {
  demoState = { ...initialState(config), phase: 'active' };
  magnet = { x: 500, y: 580 };
  engaged = false;
  running = true;
  scenario = 'interactive';
}
function preview(value: string) {
  scenario = value;
  if (value === 'interactive') {
    reset();
    return;
  }
  running = false;
  const target = options[0];
  demoState = {
    ...initialState(config),
    phase: value === 'selected' ? 'selected' : 'active',
    position: { x: target.x, y: target.y },
    targetId: target.id,
    dwellMs: value === 'selected' ? BASELINE.dwellMs : 750,
    selectedId: value === 'selected' ? target.id : null,
  };
  magnet = { x: target.x + 85, y: target.y + 50 };
  engaged = value === 'holding';
}
onMount(() => {
  const timer = setInterval(() => {
    if (running)
      demoState = step(
        demoState,
        [{ ...magnet, participantId: 'study', sequence: demoState.tick, engaged }],
        options,
        config,
      );
  }, STEP_MS);
  return () => clearInterval(timer);
});
</script>

<svelte:head><title>Outline preview — Puck</title></svelte:head>
<section class="studies">
  <header class="study-heading">
    <h1>Outline preview</h1>
    <p>
      The selected Outline treatment. Synthetic local simulation; no room or recording is created.
    </p>
  </header>
  <div class="study-layout">
    <aside class="study-controls" aria-label="Study controls">
      <label
        >State<select value={scenario} onchange={(event) => preview(event.currentTarget.value)}>
          <option value="interactive">Interactive</option>
          <option value="holding">Holding · halfway</option>
          <option value="selected">Selected</option>
        </select></label
      >
      <label class="study-checkbox"
        ><input type="checkbox" bind:checked={demanding} onchange={() => reset()}>Six longer
        options</label
      >
      <button type="button" onclick={reset}>Reset puck</button>
      <p class="muted">
        Hold near the puck and move slowly to pull. Keyboard: focus the field, move with arrow keys
        and hold Space.
      </p>
    </aside>
    <div class="study-stage">
      <h2>What should we focus on next?</h2>
      <Arena
        {options}
        state={demoState}
        {magnet}
        {engaged}
        showMagnet={demoState.phase !== 'selected'}
        enabled={running && !terminal(demoState.phase)}
        oninput={(point, pulling) => {
          magnet = point;
          engaged = pulling;
        }}
      />
      <p class="study-status" role="status">
        {result
          ? `Selected: ${result}`
          : demoState.phase === 'timed-out'
            ? 'Time ran out. Reset to try again.'
            : scenario === 'holding'
              ? 'Holding preview · 0.75 / 1.5 seconds'
              : 'Move the shared puck towards an option.'}
      </p>
    </div>
  </div>
</section>

<style>
.studies {
  max-width: 1040px;
  margin-inline: auto;
}
.study-heading {
  border-bottom: 3px solid #191919;
  padding-bottom: 24px;
  margin-bottom: 32px;
}
.study-heading h1 {
  font-size: clamp(2rem, 5vw, 3.5rem);
  max-width: 750px;
  margin-bottom: 16px;
}
.study-heading p {
  max-width: 580px;
  margin: 0;
  color: #555650;
}
.study-layout {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr);
  gap: 64px;
  align-items: start;
}
.study-controls {
  display: grid;
  gap: 24px;
}
.study-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
.study-checkbox input {
  width: 18px;
  height: 18px;
  accent-color: #191919;
}
.study-controls .muted {
  margin: 0;
}
.study-stage h2 {
  max-width: 560px;
  margin: 0 auto 24px;
  font-size: 1.5rem;
  letter-spacing: -0.025em;
}
.study-status {
  max-width: 560px;
  margin: 20px auto 0;
  font-size: 14px;
}
@media (max-width: 760px) {
  .study-heading {
    padding-bottom: 20px;
    margin-bottom: 24px;
  }
  .study-layout {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .study-controls {
    display: contents;
  }
  .study-controls > * {
    width: 100%;
    order: 2;
  }
  .study-stage {
    order: 1;
    width: 100%;
  }
  .study-stage h2 {
    font-size: 1.25rem;
    margin-bottom: 16px;
  }
}
</style>
