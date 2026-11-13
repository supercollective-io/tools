<script lang="ts">
import { onMount, untrack } from 'svelte';
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
import { abbreviateLabel } from '../rendering/labels.ts';
import { approachPoint } from '../rendering/motion.ts';

let {
  options,
  state: puckState,
  enabled = false,
  magnet = { x: 500, y: 580 },
  engaged = false,
  oninput = (_point: Point, _engaged: boolean) => {},
  replayInputs = [],
  contributions = [],
  showMagnet = enabled,
}: {
  options: Option[];
  state: State | null;
  enabled?: boolean;
  magnet?: Point;
  engaged?: boolean;
  oninput?: (point: Point, engaged: boolean) => void;
  replayInputs?: Input[];
  contributions?: Contribution[];
  showMagnet?: boolean;
} = $props();
let arena: HTMLDivElement;
let shown = $state<Point>({ x: 500, y: 500 });
let holding = false;
let reducedMotion = $state(false);
let mounted = $state(false);
let frame: number | undefined;
let lastTick = -1;
let target: Point = { x: 500, y: 500 };
let lastTime = 0;
const indexed = $derived(options.some((option) => abbreviateLabel(option.label) !== option.label));
const selectedLabel = $derived(
  options.find((option) => option.id === puckState?.selectedId)?.label,
);
function stop() {
  if (frame !== undefined) cancelAnimationFrame(frame);
  frame = undefined;
}
function draw(time: number) {
  const next = approachPoint(shown, target, time - lastTime);
  shown = next;
  lastTime = time;
  frame = next === target ? undefined : requestAnimationFrame(draw);
}
onMount(() => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion = query.matches;
  mounted = true;
  const changed = () => (reducedMotion = query.matches);
  query.addEventListener('change', changed);
  return () => {
    stop();
    query.removeEventListener('change', changed);
  };
});
$effect(() => {
  if (!mounted) return;
  const destination = puckState?.position ?? { x: 500, y: 500 };
  const tick = puckState?.tick ?? 0;
  const immediate = reducedMotion || puckState?.phase === 'selected';
  untrack(() => {
    const changed = destination.x !== target.x || destination.y !== target.y;
    const reset = lastTick < 0 || tick < lastTick || (tick === lastTick && changed);
    target = { ...destination };
    lastTick = tick;
    if (immediate || reset) {
      stop();
      shown = target;
    } else if (frame === undefined && (shown.x !== target.x || shown.y !== target.y)) {
      lastTime = performance.now();
      frame = requestAnimationFrame(draw);
    }
  });
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
<div class="arena-assembly">
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
      {#each options as option, i}
        <circle
          cx={option.x}
          cy={option.y}
          r={TARGET_RADIUS}
          class="target"
          class:chosen={puckState?.selectedId === option.id}
          class:dwelling={puckState?.targetId === option.id}
        />
        {#if indexed}
          <text
            x={option.x}
            y={option.y}
            class="target-number"
            class:chosen={puckState?.selectedId === option.id}
            dominant-baseline="central"
            text-anchor="middle"
          >
            {i + 1}
          </text>
        {/if}
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
      {#if showMagnet && engaged}
        <line
          x1={shown.x}
          y1={shown.y}
          x2={magnet.x}
          y2={magnet.y}
          class="pull-line"
          class:pulling={engaged}
        />
      {/if}
      {#if puckState?.correction &&
        Math.hypot(puckState.correction.x, puckState.correction.y) > 0.01}
        <line
          x1={PUCK_RADIUS + 4}
          y1="0"
          x2={PUCK_RADIUS + 4 + Math.hypot(puckState.correction.x, puckState.correction.y)}
          y2="0"
          transform={`translate(${shown.x} ${shown.y}) rotate(${(Math.atan2(puckState.correction.y, puckState.correction.x) * 180) / Math.PI})`}
          class="correction-force"
        />
      {/if}
      <circle cx={shown.x} cy={shown.y} r={PUCK_RADIUS + 5} class="puck-separation" />
      <circle cx={shown.x} cy={shown.y} r={PUCK_RADIUS} class="puck" />
      {#if puckState?.targetId && puckState.dwellMs > 0}
        <circle cx={shown.x} cy={shown.y} r="34" class="dwell-track" />
        <circle
          cx={shown.x}
          cy={shown.y}
          r="34"
          class="dwell-ring"
          pathLength="1"
          stroke-dasharray={`${Math.min(1, puckState.dwellMs / BASELINE.dwellMs)} 1`}
          transform={`rotate(-90 ${shown.x} ${shown.y})`}
        />
      {/if}
      {#if showMagnet}
        <circle cx={magnet.x} cy={magnet.y} r={engaged ? 18 : 14} class="magnet" class:engaged />
        <circle cx={magnet.x} cy={magnet.y} r="4" class="magnet-centre" />
      {/if}
    </svg>
    {#each options as option}
      <div
        class="target-label"
        class:chosen={puckState?.selectedId === option.id}
        class:above={option.y > 700}
        style:left={`${Math.max(16, Math.min(84, option.x / 10))}%`}
        style:top={`${option.y / 10 + (option.y > 700 ? -10 : 10)}%`}
      >
        <span>{abbreviateLabel(option.label)}</span>
      </div>
    {/each}
    {#if puckState?.phase === 'countdown'}
      <div class="countdown-overlay">
        <strong>{Math.ceil(puckState.countdownMs / 1000)}</strong>
      </div>
    {/if}
  </div>

  {#if indexed}
    <ol class="arena-option-key" aria-label="Options">
      {#each options as option, i}
        <li class:chosen={puckState?.selectedId === option.id}>
          <span class="option-index">{i + 1}</span><span>{option.label}</span>
        </li>
      {/each}
    </ol>
  {/if}
  <span class="arena-announcement" role="status"
    >{selectedLabel ? `Selected: ${selectedLabel}` : ''}</span
  >
</div>
