<script lang="ts">
import { onMount } from 'svelte';
import {
  BASELINE,
  type Input,
  type Option,
  type Point,
  PUCK_RADIUS,
  type State,
  TARGET_RADIUS,
} from '../core/engine.ts';
import type { Contribution } from '../core/replay.ts';

let {
  options,
  state: puckState,
  enabled = false,
  magnet = { x: 500, y: 580 },
  engaged = false,
  oninput = (_point: Point, _engaged: boolean) => {},
  replayInputs = [],
  contributions = [],
}: {
  options: Option[];
  state: State | null;
  enabled?: boolean;
  magnet?: Point;
  engaged?: boolean;
  oninput?: (point: Point, engaged: boolean) => void;
  replayInputs?: Input[];
  contributions?: Contribution[];
} = $props();
let arena: HTMLDivElement;
let shown = $state<Point>({ x: 500, y: 500 });
let holding = false;
let reducedMotion = false;
let lastTick = -1;
onMount(() => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion = query.matches;
  const changed = () => (reducedMotion = query.matches);
  query.addEventListener('change', changed);
  let frame: number;
  const draw = () => {
    const target = puckState?.position ?? { x: 500, y: 500 };
    if (reducedMotion || (puckState?.tick ?? 0) < lastTick) shown = { ...target };
    else
      shown = {
        x: shown.x + (target.x - shown.x) * 0.35,
        y: shown.y + (target.y - shown.y) * 0.35,
      };
    lastTick = puckState?.tick ?? 0;
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(frame);
    query.removeEventListener('change', changed);
  };
});
function point(event: PointerEvent) {
  const r = arena.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1000, ((event.clientX - r.left) / r.width) * 1000)),
    y: Math.max(0, Math.min(1000, ((event.clientY - r.top) / r.height) * 1000)),
  };
}
function down(event: PointerEvent) {
  if (!enabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  arena.focus();
  arena.setPointerCapture(event.pointerId);
  holding = true;
  oninput(point(event), true);
}
function move(event: PointerEvent) {
  if (enabled && holding) oninput(point(event), true);
}
function release() {
  holding = false;
  oninput(magnet, false);
}
function key(event: KeyboardEvent) {
  if (!enabled) return;
  const moves: Record<string, Point> = {
    ArrowUp: { x: 0, y: -18 },
    ArrowDown: { x: 0, y: 18 },
    ArrowLeft: { x: -18, y: 0 },
    ArrowRight: { x: 18, y: 0 },
  };
  if (event.key in moves) {
    event.preventDefault();
    const d = moves[event.key];
    oninput(
      {
        x: Math.max(0, Math.min(1000, magnet.x + d.x)),
        y: Math.max(0, Math.min(1000, magnet.y + d.y)),
      },
      engaged,
    );
  }
  if (event.code === 'Space') {
    event.preventDefault();
    oninput(magnet, true);
  }
  if (event.key === 'Escape') release();
}
</script>
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (This is a two-dimensional application surface with arrow-key and Space controls.) -->
<div
  bind:this={arena}
  class="arena"
  class:interactive={enabled}
  role="application"
  tabindex={enabled ? 0 : -1}
  aria-label={enabled
    ? 'Shared puck arena. Hold and drag near the puck to pull. Keyboard: arrow keys move your magnet; hold Space to pull; release to stop.'
    : 'Shared puck arena'}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={release}
  onpointercancel={release}
  onlostpointercapture={release}
  onkeydown={key}
  onkeyup={(event) => {
    if (event.code === 'Space') {
      event.preventDefault();
      release();
    }
  }}
  onblur={release}
>
  <svg viewBox="0 0 1000 1000" aria-hidden="true">
    {#each options as option}
      <circle
        cx={option.x}
        cy={option.y}
        r={TARGET_RADIUS}
        class="target"
        class:chosen={puckState?.selectedId === option.id}
        class:dwelling={puckState?.targetId === option.id}
      />
    {/each}
    {#each replayInputs.filter((i) => i.engaged) as input}
      <line x1={shown.x} y1={shown.y} x2={input.x} y2={input.y} class="replay-pull" />
      <circle cx={input.x} cy={input.y} r="9" class="replay-magnet" />
    {/each}
    {#each contributions as contribution}
      <g
        class="contribution-arrow"
        data-participant={contribution.participantId}
        data-option={contribution.optionId}
        data-force={contribution.force}
        data-proportion={contribution.proportion}
        transform={`translate(${shown.x} ${shown.y}) rotate(${(Math.atan2(contribution.direction.y, contribution.direction.x) * 180) / Math.PI}) translate(${PUCK_RADIUS + 5} ${contribution.lane})`}
        style:color={contribution.colour}
      >
        <line
          x1="0"
          y1="0"
          x2={contribution.length}
          y2="0"
          stroke="currentColor"
          stroke-width="3"
        />
        <path
          d={`M${contribution.length - 7} -5 L${contribution.length} 0 L${contribution.length - 7} 5`}
          fill="none"
          stroke="currentColor"
          stroke-width="3"
        />
      </g>
    {/each}
    {#if enabled}
      <line
        x1={shown.x}
        y1={shown.y}
        x2={magnet.x}
        y2={magnet.y}
        class="pull-line"
        class:pulling={engaged}
      />
    {/if}
    {#if puckState?.correction && Math.hypot(puckState.correction.x, puckState.correction.y) > 0.01}
      <line
        x1={PUCK_RADIUS + 4}
        y1="0"
        x2={PUCK_RADIUS + 4 + Math.hypot(puckState.correction.x, puckState.correction.y)}
        y2="0"
        transform={`translate(${shown.x} ${shown.y}) rotate(${(Math.atan2(puckState.correction.y, puckState.correction.x) * 180) / Math.PI})`}
        class="correction-force"
      />
    {/if}
    <circle cx={shown.x} cy={shown.y} r={PUCK_RADIUS} class="puck" />
    {#if puckState?.targetId && puckState.dwellMs > 0}
      <circle
        cx={shown.x}
        cy={shown.y}
        r="31"
        class="dwell-ring"
        stroke-dasharray={`${(puckState.dwellMs / BASELINE.dwellMs) * 195} 195`}
        transform={`rotate(-90 ${shown.x} ${shown.y})`}
      />
    {/if}
    {#if enabled}
      <circle cx={magnet.x} cy={magnet.y} r={engaged ? 13 : 10} class="magnet" />
    {/if}
  </svg>
  {#each options as option}
    <div class="target-label" style:left={`${option.x / 10}%`} style:top={`${option.y / 10}%`}>
      <span>{option.label}</span>
    </div>
  {/each}
  {#if puckState?.phase === 'countdown'}
    <div class="countdown-overlay">
      <strong>{Math.ceil(puckState.countdownMs / 1000)}</strong>
    </div>
  {/if}
</div>
