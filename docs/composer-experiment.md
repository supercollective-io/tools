# Evaluate the performance composer

The composer is the only model intended for the final performance. Human
participants supply the writing. Generated participants are development fixtures;
improve them only when that makes a composer failure easier to investigate.

## Prepare

Complete the [repository setup](../README.md#set-up). Run commands from the
repository root. The local examples require the already installed
`gemma4:12b-mlx` service at `http://127.0.0.1:11434`. Cloud examples require an
explicit model choice and `OPENAI_API_KEY` in the environment or ignored `.env`.
The command does not start services, download models or select a fallback.

Use [model selection](composer-models-2026-11-04.md) for the initial cloud
comparison and cost assumptions. Choose a spending allowance before paid runs.
The application has request token budgets, but no monetary spending limiter.
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

| Criterion      | Evidence to record                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proportion     | Whole-run collective words divided by mean admitted participant words; individual request counts are diagnostics. Read aloud for speaking space.                                                                               |
| Representation | A connection that retains a consequential disagreement, refusal or practical constraint; or the exact distinction lost. Selection is necessary, but omitting a constraint must not turn a conditional proposal into agreement. |
| Development    | What new material changed, qualified or corrected the developing thought; any repetition, disconnected restart or persistence with a contradicted framing.                                                                     |
| Authority      | Whether a desire, proposal, possible coalition and authorised decision remain distinct. Identify invented shared experience or agreement.                                                                                      |
| Live delivery  | Time to first saved text, finish reason, empty output, broken joins, copied prefixes and time spent producing unusable text. Provider latency and artistic pacing are separate judgements.                                     |

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
- Most consequential omission or invented agreement:
- Later correction and response:
- Repetition or facilitator behaviour:
- Delivery observations and cost basis (measured usage or explicit estimate):
- Decision: retain, revise, or reject; next controlled change:
```

Audit output contains complete participant writing. Keep it in ignored `runs/`;
it is rehearsal evidence, not a public export. Published reports can describe
failures and link local journals without reproducing participant material.

## Test feedback after the fixed comparison

First use controlled later contributions to isolate the composer's response:

| Test               | Later input                                                                          | Observable composer behaviour                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Correct a claim    | A participant says an earlier collective statement misrepresented their position.    | The next addition qualifies or corrects that framing without rewriting saved words or claiming everyone agrees with the correction.            |
| Preserve a refusal | A participant supports the aim but refuses the proposed action or use of their name. | The collective retains the refusal while allowing willing participants' proposal to develop.                                                   |
| Change feasibility | A participant adds a care, time, money or access constraint.                         | The proposal changes or its limitation becomes explicit; merely mentioning the constraint beside an unchanged universal claim is insufficient. |

Use `examples/composer-corrections.json` as a separate four-person holdout for
these tests and inspect its actual slice boundaries. It introduces a corrected
Saturday offer, withdrawn permission to use a name, and limits on translation,
maintenance and access work. Run it with each cloud configuration and a fresh
output path. Keep it separate from the primary eight-person comparison.
They test response to specified contributions, not spontaneous human feedback.
If generated participants expose another useful case, save their output and
turn it into a controlled source for composer comparison. Use chunked mode to
exercise feedback delivery; do not optimise personas for their own sake or force
them to agree or disagree. Synthetic convergence can arise in either role and
cannot establish how a human room will respond.

Finally, rehearse with a small group of people. Ask whether they recognise their
contribution, can contest the collective wording, and continue developing their
own positions. This requires actual participants; automated checks and synthetic
rehearsals cannot complete that evaluation.

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
