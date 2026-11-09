# Experimental modes

Create a room and open **Advanced settings** to choose its mode. Settings are immutable for that room. Create separate rooms to compare modes. The original distance-based baseline remains the default; existing rooms migrate to baseline.

| Mode                              | Input                                             | Centre correction |
| --------------------------------- | ------------------------------------------------- | ----------------- |
| Baseline                          | Direct magnet vector in the common arena          | None              |
| Positional correction             | Direct magnet vector in the common arena          | Enabled           |
| Personalised layouts              | Proportional option mixture from a personal arena | None              |
| Personalised layouts + correction | Proportional option mixture from a personal arena | Enabled           |

All modes keep equal maximum participant influence, closer-is-stronger input, the fixed starting roster, the countdown and the existing target dwell/timeout rules. This implementation does not introduce adaptive participant weights.

## Disclosed positional correction

For displacement `d` from the centre and the scalar sum `S` of applied participant-force magnitudes:

`correction magnitude = 0.16 × S × min(1, |d| / 370)`

The direction is towards the centre. At the centre or with no applied force, the correction is zero. Apply it after summing participant forces and before the existing velocity update. The orange line starts just outside the puck so small forces are not hidden underneath it. It shows the correction vector, using one display-arena unit per acceleration unit; it is a force indicator, not a prediction of displacement. In personal views, it shows the locally projected vector.

This is a Puck experimental rule inspired by the centre-restoring embodiments in [US10609124B2](https://patents.google.com/patent/US10609124B2/en). It is not a claim to reproduce the production Swarm algorithm. In particular, this version does not detect factions or selectively enable correction by faction count. The cap is not calibrated for every target count or layout; the correction can slow or obstruct selection. Compare live rounds before claiming reduced bias.

The mode is disclosed on setup, joining, the room page and replay. Expand the mode notice for the rule. Settings and the correction vector are saved with each run.

## Personalised layouts: angular-mixture-v1

This mode needs 4–6 options so that permutations can change neighbours, rather than merely rotate or reflect the layout. Every participant receives a stable permutation derived from their room and identity. Pure rotations/reflections of the canonical layout are rejected. Different participants can receive the same permutation; assignments are not an exactly counterbalanced experimental design. Reconnecting preserves the layout.

The server maintains one canonical arena and one outcome. A non-participating host sees that arena. A participant sees its personal projection:

1. Express the canonical puck position in the triangle formed by the centre and two adjacent canonical targets.
2. Use those same barycentric coefficients with the corresponding named targets in the personal layout.
3. For positions beyond the target polygon, clamp the projection to its boundary. This does not change the canonical simulation boundary.

This piecewise-affine projection preserves the centre and named targets. With reordered neighbours it can fold: distinct collective positions can look identical locally, and paths and distances differ. It does not remove every positional bias or provide a faithful invertible view. It is not the later simplex decision model.

### Proportional input

For each accepted local magnet position:

1. Calculate the normal baseline force magnitude using its distance from the local projected puck. This is the available strength.
2. Find the two adjacent option rays that bracket the magnet direction, using rays from the local puck towards local targets.
3. Resolve the direction as a non-negative linear combination of those **unit** rays, then normalise the two coefficients to sum to one. These are directional-vector proportions, not percentages of the angle between the rays.
4. Apply those proportions to unit rays from the canonical puck towards the same named targets, multiplied by the available strength. Do not renormalise the resulting vector.

For example, `30% A + 70% B` locally gives `strength × (0.3 × canonicalDirectionA + 0.7 × canonicalDirectionB)` collectively. If the canonical directions oppose each other, they partly cancel. That cancellation is intentional; the mixture is not snapped to one option. The interface shows the inferred proportions while pulling.

At an exact target centre, its ray uses the centre-to-target direction. A zero-length magnet direction, or an outward boundary direction outside the target-ray cone, transfers no option mixture. Angular ties have a deterministic option ordering. Input magnitude remains bounded by the baseline maximum. Clients cannot submit their own force or weighting fields: the server computes them from validated coordinates.

## Recording and replay

New recordings identify engine `puck-v2`. The run config stores the mode, correction ratio, and (when applicable) mapping version. Each recorded participant includes the exact assigned layout.

Personalised frames contain:

- `localInputs`: the accepted personal coordinates, sequence and engagement after input expiry.
- `inputs`: canonical proxy magnet coordinates for visualisation, exact applied `force`, `optionWeights`, and `availableStrength`.
- `state`: canonical position, velocity and total force, plus the separate `correction` vector when enabled.

The proxy coordinates are not a second input calculation. The engine uses the recorded applied force directly. Re-simulation can reproduce frames from mapped inputs; tests also reconstruct those mappings from the raw local inputs and saved layouts. The terminal cancellation/interruption override remains in `result` as before.

Replay starts in the shared simulation, showing all applied pulls. Personalised runs also offer each participant's layout, showing that person's raw magnet and projected puck. Historical baseline recordings remain viewable without the new fields. No cross-version numerical identity is promised.

## Decisions and future scope

- **Adaptive participant weighting is excluded**, including calibration weights and behaviour-based reductions in influence for changing options or following the group.
- **Fictional expert/AI claims are rejected and are not expected to be implemented.** [US11269502B2](https://patents.google.com/patent/US11269502B2/en) describes fabricated authority-labelled estimates as perturbations for behavioural analysis. Puck will not use that mechanism.
- **Asynchronous representative agents are only a possible future experiment.** [Mindmix](https://unanimous.ai/mindmix/) describes agents representing earlier participants. The project concern is that modelling absent people's reactions gives up genuine simultaneous mutual adaptation, moving towards an interactive form of voting rather than the dynamic collective intelligence sought here. This assessment is our design judgement, not a claim that every asynchronous system is equivalent to a poll.
- **Simplex UI prototypes come later.** They are not implemented by the personal projection above.
- Support analytics, private ballots, readiness/quorum, new answer types, variable shared dynamics and participant-generated options remain outside this slice.
