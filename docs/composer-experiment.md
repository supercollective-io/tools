# Evaluate the performance composer

The goal is for each participant to feel both **represented in the collective**
and **in conversation with it**. Evaluate composition in service of both aspects
of that experience. The complementary development perspective is dynamic
representation: participants can continually respond to and reshape the
collective voice that represents them. See the [participant experience](rehearsing-we.md#participant-experience)
for the full framing.

Evaluate these two goals for each person, rather than substituting the quality
of the prose or a room-wide average. Topic mentions are not proof of feeling
represented; rapid input delivery is not proof of feeling in conversation.
Fixed-script comparisons provide partial indicators and failure cases.
Responsive AI-participant rehearsals can provide strong evidence for both
experiential goals; human rehearsal tests transfer to the audience. See the
[pilot assessment](composer-performance-assessment.md) for the revised criteria
and the limits of engineering measures.

Human participants supply the writing in the final performance. During
development, AI participants supply both controlled cases and responsive
experiential evidence. Improve them when this makes the exchange and its
assessment more informative, without instructing them to confirm success.

## Prepare

Complete the [repository setup](../README.md#set-up). Run commands from the
repository root. The local examples require the already installed
`gemma4:12b-mlx` service at `http://127.0.0.1:11434`. Cloud examples require an
explicit model choice and `OPENAI_API_KEY` in the environment or ignored `.env`.
The command does not start services, download models or select a fallback.

Use [model selection](composer-models-2026-11-04.md) for the initial cloud
comparison and cost assumptions. Choose a spending allowance before paid runs.
Ordinary application commands have request token budgets but no monetary spending
limiter. The dedicated [Luna screen](composer-luna-protocol.md) has a persistent
reservation ledger and enforced experiment spending caps.
See the [measured comparison](composer-comparison-2026-11-04.md) for the completed
Terra, Sol and Astra High experiment and its limitations.

## Run the fixed experiment

1. Run the unchanged eight-person score with the baseline instructions:

   ```sh
   mise exec -- pnpm cli compose --score examples/score.json --config examples/composer-baseline.json --out runs/composer-baseline.jsonl
   ```

   `compose` uses the current live, append-only composer. It includes every
   score voice, freezes the score and configuration, and admits the same five
   20% slices used by the browser's prewritten mode. Participant models are
   never called. It ends after the final slice; Ctrl+C pauses. Resume with
   `mise exec -- pnpm cli resume --run runs/composer-baseline.jsonl`.

2. Inspect the outcome and every composer request:

   ```sh
   mise exec -- pnpm inspect --run runs/composer-baseline.jsonl --full
   mise exec -- pnpm inspect --run runs/composer-baseline.jsonl --composer
   mise exec -- pnpm inspect --run runs/composer-baseline.jsonl --composer --json > runs/composer-baseline-audit.json
   ```

   Confirm all five source steps completed. A request can span several publication
   updates; a publication is not a new model request. Assess an addition against
   that request's sources, even if more input arrived while it was generating.
   The audit distinguishes recognised, verified input snapshots from unavailable
   or inconsistent prompt evidence. Do not label an unavailable contribution an
   omission. Read the collective prefix before each addition as well as the addition.

3. Repeat with `examples/composer-candidate.json` and a new output path.
   This candidate changes only the configurable composer instructions. Compare
   input fingerprints to confirm the same request inputs arrived in the same
   order. Check failures and retries: they can add requests and change that order.
   Preserve an unsuccessful run; never trim or repair its writing for assessment.

4. Run a cloud comparison with `examples/composer-terra.json`,
   `examples/composer-sol.json` and `examples/composer-astra.json`, using separate
   output paths and the same score. Astra uses high reasoning effort as the
   frontier reference; Terra uses none and Sol uses low.
   These configurations retain the baseline instructions. Compare models before
   spending several rounds tuning Gemma. To test the candidate prompt in the
   cloud, copy a cloud configuration into `runs/` and replace only its
   `instructions` with the candidate's exact instructions.

5. Repeat promising combinations three times. Review text without model labels
   where practical. Record contrary examples, not just the best output. Matching
   inputs do not make generation deterministic. Try a different source score
   before claiming that an improvement generalises.

The local configurations use a 96-token resource budget per request to reproduce
the existing serial rehearsal conditions. Terra and Sol allow 4096 tokens;
Astra allows 8192 to leave room for high-effort reasoning. These allowances include
reasoning tokens. Fixed mode honours `composer.maxOutputTokens`; chunked
simulation retains its 96-token scheduling budget. These are computation ceilings,
not speaking targets. A `budget` finish means the ceiling intervened: do not count
short output from such a run as evidence of natural proportion. Increase the
budget equally for both configurations and repeat that comparison. New `compose`
runs freeze this allowance in `live.serialRequestTokens`; older journals without
that field retain their original implicit 96-token scheduler ceiling on resume.
Every streamed
prefix remains saved, including a cut-off word. No word quota or output trimming
is applied.

## Record the judgement

Use one row per request, plus a whole-run judgement. A useful note names the
source, the collective wording and the consequence; an unanchored numerical
quality score is insufficient.

Read the criteria below across the developing exchange. This is a theatre
performance: the composer selects and connects material from many voices. It
need not acknowledge every contribution, repeat every refusal or explicitly
correct an earlier passage whenever one person changes their mind. At hundreds
of voices, a single change may or may not shape the collective. Omission by
itself is not a failure. These observations support the experiential goals;
they do not establish how a participant feels.

| Criterion                   | Evidence to record                                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development and continuity  | A developing thought across additions; specific new directions, connections and questions; repeated abstractions, disconnected restarts or broken joins.                                                 |
| Concrete grounding          | Particular experiences, images or details used from the available contributions; generic language that could fit almost any room; invented circumstances presented as shared experience.                 |
| Connections and differences | A meaningful relationship between contributions, including unresolved tensions; differences flattened into one position. Selective use is expected; inspect the meaning of material actually used.       |
| Responsiveness              | How changing input influences the trajectory as a whole. Record possible influences and unexplored material without requiring a reply to every person or treating acknowledgement as semantic influence. |
| Proportion and pacing       | Collective words divided by mean admitted participant words, plus a reading for speaking space and rhythm. Counts are descriptive, not a quota.                                                          |
| Live delivery               | Time to first saved text, response boundaries, empty output, broken joins and copied prefixes. Provider latency, input availability and artistic responsiveness are separate judgements.                 |

Faithfulness concerns the positions and experiences the composer actually uses.
It should not repeatedly turn differences into invented unanimity. This is
different from requiring it to preserve every detail or maintain current offers,
signatures and permissions as if the text authorised group decisions.

Copy this record into local rehearsal notes:

```markdown
# Composer comparison — YYYY-MM-DD

- Run paths and input fingerprints:
- Models, instructions/configuration fingerprints and request budgets:
- Completed source steps, pending work and finish reasons:
- Whole-run speaking-space ratios:

| Request / source offset | Available evidence | Collective addition | Judgement and consequence |
| ----------------------- | ------------------ | ------------------- | ------------------------- |

- Best preserved difference:
- Concrete grounding or generic abstraction:
- Changing input and subsequent development (including material not selected):
- Repetition or facilitator behaviour:
- Delivery observations and cost basis (measured usage or explicit estimate):
- Decision: retain, revise, or reject; next controlled change:
```

Audit output contains complete participant writing. Keep it in ignored `runs/`;
it is rehearsal evidence, not a public export. Published reports can describe
failures and link local journals without reproducing participant material.

## Test feedback after the fixed comparison

Use controlled later contributions to investigate how available material can
change the developing voice. Include new experiences, contrasting images,
connections between previously separate concerns, shifts in emphasis and
individual changes of mind. Record what the composer selects, what it develops
and what it leaves out. Do not prescribe an exact response or require each new
contribution to appear.

`examples/composer-corrections.json` is a narrow four-person diagnostic about
changed offers, permission and practical limits. Its slice boundaries are useful
for tracing available input. It is not a central artistic assessment or a
requirement that every individual change receive explicit uptake. Keep the
frozen score for reproducibility and use other topics and fresh cases before
making performance claims. It is an existing development case, not an unseen
confirmation case for subsequent experiments.

A deliberately targeted change can probe whether a delivery mechanism makes new
context usable. Report whether it appeared, including non-uptake, without
calling every non-uptake a compositional failure. Compare complete trajectories
with the same inputs; separate transport faults from artistic selection.

If generated participants expose another useful case, save their output and
turn it into a controlled source for composer comparison. Use chunked mode to
exercise feedback delivery; do not optimise personas for their own sake or force
them to agree or disagree. Synthetic convergence can arise in either role. Examine it as a possible
simulation bias rather than treating agreement as a successful conversation;
responsive AI-participant evidence remains valuable, with human rehearsal
testing transfer.

Finally, rehearse with a small group of people. Ask each participant about both
aspects of the experience:

1. **Being represented:** Where did they recognise their contribution, and where
   was their position, condition or refusal lost or misrepresented?
2. **Having a conversation:** What did the collective give them to respond to,
   and how did the developing voice relate to their subsequent contributions?
   Did they have room to disagree or develop their own position?

Ask for specific moments, including failures, and compare those accounts with
the saved exchange. Look for patterns of inclusion, exclusion and development;
do not turn an individual missing response into an automatic failure.
Use responsive AI participants as well as human participants for this evaluation.
Keep participant assessments grounded in specific moments, and control for
leading prompts, automatic agreement and shared model biases. Distinguish that
evidence from an external review of fixed scripts. Human rehearsal checks how
the findings transfer to the actual audience.

## Command reference

`compose --score <path> --config <path> [--out <new.jsonl>]` accepts a version-2
continuous-text score and a version-1 composer configuration. It creates a
version-2 live journal, with an invitation taken from the score title and a
64,000-character full-prompt guard. The guard is independent of a provider's
token context limit. The legacy `history` fields are accepted for configuration
compatibility; the live composer receives complete prefixes. Existing output
files are never overwritten. `compose` reports model errors with a non-zero exit
status and preserves saved writing. `inspect --composer` is offline and supports
live journals only; use ordinary `inspect` for historical Stage 1/2A formats.

`composer.reasoningEffort` optionally selects `none`, `low`, `medium` or `high`
for the OpenAI adapter. Omit it for provider defaults. Model support varies;
the selected provider rejects unsupported values. Ollama configurations reject
this field and continue to use `think` where supported.
