# Research basis

Puck preserves the closed-loop, shared-puck interaction described for UNU / Swarm AI. Hyperchat is a possible companion, not a dependency. This research was collected with three cheaper-model research subagents and checked against primary sources on 8 November 2026.

## Evidence categories

1. **Product behaviour:** a description of what users see or do.
2. **Disclosed mechanism:** a paper or patent embodiment; not necessarily the deployed algorithm.
3. **Puck choice:** an explicit implementation decision that needs testing.

Patent descriptions may contain several alternatives. A disclosed equation or example constant does not establish that the production service uses it. This document records technical evidence, not a patent clearance assessment.

## Source map

| Source                                                                                                                                                           | Relevant evidence                                                                                   | Baseline treatment                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [UNU FAQ](https://unanimous.ai/unum-f-a-q/)                                                                                                                      | Personal magnet controls direction/strength; only own magnet visible live; replay exposes the group | Preserve this interaction and visibility boundary                              |
| [Human Swarms, 2015](https://unanimous.ai/wp-content/uploads/2014/11/HUMAN-SWARMS-Rosenberg-CI-2015.pdf)                                                         | Shared simulated puck, continuous inputs, synchronised countdown and timed decisions                | Preserve the control loop; tune our constants explicitly                       |
| [Artificial Swarm Intelligence vs Human Experts, 2016](https://unanimous.ai/wp-content/uploads/2016/09/Artificial-Swarm-Intelligence-vs-Human-Experts-IJCNN.pdf) | Maintaining proximity to a moving puck sustains influence; categorical and continuous-scale tasks   | Preserve active repositioning; implement categorical decisions first           |
| [Intuitive interfaces, US9940006B2](https://patents.google.com/patent/US9940006B2/en)                                                                            | Proximity-based magnet input, pooled vectors and dwell selection                                    | Use a bounded distance-based force and continuous target dwell                 |
| [Dynamic systems, US10609124B2](https://patents.google.com/patent/US10609124B2/en)                                                                               | Positional bias and centre-restoring corrections                                                    | A documented candidate for an experimental variant                             |
| [Modifying influence, US10353551B2](https://patents.google.com/patent/US10353551B2/en)                                                                           | Adaptive weights, synchrony measures and behavioural history                                        | Excluded by project decision; keep equal maximum influence                     |
| [Image selection, US10656807B2](https://patents.google.com/patent/US10656807B2/en)                                                                               | Settling thresholds and replay variants                                                             | Do not apply image/continuous selection thresholds blindly to discrete answers |
| [Multi-group selection, US10551999B2](https://patents.google.com/patent/US10551999B2/en)                                                                         | Staged decisions across subgroups                                                                   | Outside the initial product                                                    |
| [Swarm Analytics](https://unanimous.ai/swarm-analytics/)                                                                                                         | Replays and inspection of participant behaviour                                                     | Persist applied inputs and shared state                                        |
| [Company product description](https://unanimous.ai/swarm/)                                                                                                       | Intended forecasting, prioritisation and assessment workflows                                       | Use as product context, not an independent efficacy test                       |

## What remains uncertain

Public sources do not provide one complete, calibrated, current production specification. We do not know the production force curve, exact damping, all weighting logic, latency handling or universal termination rules.

The 2020 [behaviour analysis paper](https://unanimous.ai/wp-content/uploads/2020/01/Swarm-Behavior-Analysis.pdf) includes a visibility description that differs from the FAQ. Puck follows the explicit FAQ and earlier paper behaviour: own magnet live, all inputs in replay.

Historical 60-second limits are useful defaults. The 1.5-second dwell, hold-to-engage interaction, linear force curve, fixed initial-roster normalisation, 20 Hz tick and missing-input expiry are Puck choices. They are recorded in the engine configuration/version, not attributed to Unanimous AI.

## Experimental direction

The physical interaction may be useful despite positional imperfections. Symmetry is not a release condition. Establish an intelligible baseline before comparing layouts, corrective forces or adaptive weights.

Counterbalance option adjacency and opposition across comparable groups. Compare private initial ballots and post-round acceptance. Use accuracy for verifiable questions; use acceptance, retained disagreement and layout sensitivity for subjective choices. Do not equate convergence speed with quality.

A replay of old inputs under new mechanics is a diagnostic, not a behavioural trial: people would react to a different trajectory. Conduct live comparisons before claiming improved decisions. Keep company product claims separate from empirical study results and distinguish creator-authored evidence from independent replication.

## Magnet distance and touch input

Unanimous AI's [UNU FAQ](https://unanimous.ai/unum-f-a-q/) states that closer magnets exert stronger pulls. Its [2019 artificial swarming paper](https://unanimous.ai/wp-content/uploads/2019/02/Artificial-Swarming-Amplifies-Subjective-Jugement-FICC-2019-full.pdf) describes tracking the moving puck’s rim as a way to require continuing engagement. These sources support the proximity interaction, but do not establish Puck’s exact force curve or cutoff as a reproduction of their implementation.

Direct touch can obscure the puck and introduce motor-skill differences. A separate relative touchpad is a candidate experiment that preserves distance-based force while moving the finger away from the arena; it has not been implemented or validated here.

## Implemented experiments and exclusions

See [Experimental modes](experimental-modes.md) for the current correction and proportional personalised mapping, plus the decisions to exclude adaptive participant weights and fictional authority prompts and defer asynchronous representative agents. These are Puck choices, not claims to reproduce Unanimous AI’s current production algorithm.
