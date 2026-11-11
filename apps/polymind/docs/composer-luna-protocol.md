# Luna composer screen — recorded design and revised assessment

## Status and current decision rule

The initial 40-response screen and ten-response follow-up are complete. Their
original frozen protocols and assessments remain in the ignored run manifests
and Git history (`cc9b686` and `71bd1af`). The original rule required explicit
correction of a withdrawn offer in the next addition. The creator rejected that
emphasis: individual changes may or may not appear in this theatre performance.
That rule is superseded, including its proposed automatic rejection of Luna.

Use the [revised performance assessment](composer-performance-assessment.md) to
reassess the saved trajectories and guide subsequent slices. This is a
post-observation change of assessment purpose, not statistical equivalence or
fresh confirmation. The implementation below reproduces the historical source
schedule; it does not define an artistic acceptance gate.

The [screening results](composer-luna-results-2026-11-04.md) record all paired
outcomes, costs, reviewer corrections and the provisional decision.

## Frozen design

- Development and confirmation cases for later slices remain separate. These
  two existing scores are screening cases, not unseen confirmation material.
- Use `examples/score.json` (eight voices) and
  `examples/composer-corrections.json` (four voices), unchanged, at five 20%
  source reveals. Do not repair incomplete statements at reveal boundaries.
- Use `examples/composer-luna.json` and `examples/composer-terra.json`. The
  model identifier is the only configuration difference: reasoning `none`,
  4,096 output tokens and 120,000 ms timeout for each request.
- Run two repetitions per score and model: eight complete trajectories,
  40 responses. Run Luna then Terra in repetition one, Terra then Luna in
  repetition two. Each model continues its own exact saved writing.
- Use the existing fixed experiment, live controller and composer audit.
  Save configuration and source SHA-256 fingerprints before dispatch. Save
  per-request usage, finish reasons and elapsed time beside the journals.
- Run serially. No hidden retries. Retain full reservations when usage is
  missing. The slice allowance is US$0.50 within the US$5 pilot allowance.
  Existing provider credits, if applicable, do not increase either ceiling.
- Interrupted trials remain inspectable. A replacement uses a new attempt
  directory and records the previous attempt; never overwrite or resume an
  experimental trajectory. The shared ledger includes all attempts.

## Assessment and historical follow-up

Assess coherent development, concrete grounding, connections and differences,
responsiveness across the exchange, and speaking space. Use the revised rubric
linked above. Keep assessment material out of composer inputs and assess each
addition against its actual available source prefix.

The initial screen included an eight-person score about collective power and a
four-person score dominated by changed offers and permissions. Preserve both
for reproducibility. The latter is a narrow diagnostic, not an equally weighted
artistic requirement or an unseen confirmation case. Future cases must broaden
beyond that administrative emphasis.

The original anonymous review and source check recorded one unrepaired recurring
Saturday-opening offer in Luna's second correction trajectory. A third paired
correction repetition was then completed under the original protocol. Missing
explicit correction remains an observation; it no longer disqualifies a model.
Do not run another repetition merely to satisfy the superseded rule.

Reviewers receive only anonymous source/trajectory bundles. Preserve model
assessments, primary checks and disagreements. The primary agent saw labelled
aggregate metrics during the original screen, so only the independent model
reviewer was fully blinded. Model assessments cannot establish participant
recognition or the quality of a theatre experience.

## Verification and record

Run focused tests and `mise exec -- pnpm run verify` before paid trials. Inspect
every saved journal with the existing composer audit. Preserve all paired
outcomes, including failures. Commit aggregate findings and ignored run paths;
keep full writing and anonymised assessment bundles in `runs/`.

Run the frozen screen with:

```sh
mise exec -- node --env-file-if-exists=.env src/luna-screen.ts
```

It creates a new `runs/composer-pilot/luna-<uuid>/` directory and uses
`runs/composer-pilot/usage.jsonl` across all attempts. To link a replacement,
pass the preceding attempt directory as the sole argument. The command does
not resume or overwrite earlier writing. Use the existing `pnpm inspect --run
<journal> --composer --json` command for each saved journal. Keep
`blinding-key.json` away from reviewers until their assessments are saved.

The expected charge is approximately US$0.17, not a guaranteed quote. Rates used
for conservative accounting are Luna US$0.10 input / US$0.50 output and Terra
US$1 input / US$5 output per million tokens, without cache discounts. Verify
against [official pricing](https://developers.openai.com/api/docs/pricing)
before dispatch. The full output ceiling is reserved even when expected output
is short.
