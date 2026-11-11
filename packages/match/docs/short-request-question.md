# Short directional question experiment — 10 November 2026

## Result

Do not adopt the shorter candidate. It is 76 characters versus 119 for the
current directional question, with identical common instructions, score anchors,
profiles and labels. On the ten ranked human examples, the cached current-question
baseline passed 8/10 in each of three runs. The candidate passed 5/10, 7/10 and
5/10. All candidate runs preserved the three explicit peer controls and five
synthetic sanity rankings; those controls alone do not offset the real-example
regressions.

Candidate: “How well does what Person A offers fulfil what Person B explicitly
asks for?” Reverse A and B for the other direction. Shared inquiry did not change.

## Writer/team comparison

For the hobby writer who asks to join a game-development team, the candidate
still favours the professional writer/editor, and increases Jev's margin against
the human-preferred 3D modeller/writer:

| Run | Current-question human margin | Short-question human margin |
| --- | ---: | ---: |
| 1 | -0.0900 | -0.3150 |
| 2 | -0.1100 | -0.3150 |
| 3 | -0.1575 | -0.3900 |

The candidate removes “what Person B already offers” and “additional help”.
The regressions are consistent with that context being useful, but this experiment
does not isolate which phrase matters. This shorter question does not correct the
observed ranking failure.

The candidate also reverses the human preference on the other direction of the
composer comparison in all three runs (-0.2175, -0.1225, -0.1600 versus baseline
margins +0.2100, +0.1625, +0.1850). Its pass count across the original eight labels is unstable and lower overall
than the cached baseline.

## Other controls

- The unclear writer/programmer comparison becomes less close: absolute margins
  are 0.2100, 0.3425, 0.2650 versus 0.0200, 0.0800, 0.0750 under baseline.
  These are diagnostics, not pass/fail labels.
- All three peer controls pass in every run for both prompts.
- All five reciprocal/asymmetric/unrelated checks pass in every run for both prompts.
- The shared-inquiry question and labels are unchanged. Ordinary variation appears
  in their scores, so the question supplies no evidence about this directional edit.

## Method and artefacts

The baseline is the three already completed `jev-1.14.0` runs in
`runs/explicit-request-v1/`. The experiment script verifies each baseline's
model, full event snapshot, labels and common instructions before use. It then
runs the candidate three times on the same real comparisons, the unchanged
unclear diagnostic, peer controls and sanity checks: 66 new pair assessments.
The candidate prompt replaces both directional questions; no other rubric text,
input, label or score anchor changes.

Per-run results and the aggregated margins are under
`runs/short-request-question-v2/`. An initial, aborted experiment with an incorrect
direction swap is retained separately under `runs/short-request-question-aborted/`
and must not be interpreted as evidence. The corrected script is
`experiments/short_request_question.py`.

These are repeated measurements of small, reused development examples, not
independent validation. Jev does not provide reasoning traces here, so scores show
that the shorter wording does not solve the issue; they do not reveal why Jev
prefers the writer.
