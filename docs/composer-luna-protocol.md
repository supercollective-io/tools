# Luna composer screen — frozen protocol

## Question and decision

Can GPT-6 Luna screen composer architectures without its own failures obscuring
their effects? This is a small paired screen, not a statistical equivalence test.

Use Luna provisionally only if it introduces no critical distortion absent from
the paired Terra trajectories and remains usable for coherent composition. If
results conflict, run one additional paired repetition of the affected score.
Otherwise retain Terra. If both models fail, investigate the case, instructions
or architecture rather than treating Terra as ground truth.

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

## Assessment key (never supplied to the composer)

Assess complete anonymised trajectories against each request's available source
prefix, not against text that arrived later. Record request number, exact output
and source evidence for each consequential failure. An omission is critical
only if it changes a consequential claim or prevents a required correction.

The eight-person score tests bounded offers, disagreement and speaking space:
Sam cannot attend after work; Leah's named repair request is conditional on
permission; Chris refuses a volunteer bus; Nadia refuses the permanent contact
role; Ben's participation depends on financial cover and trust; Rosa's delegated
decision requires a budget and accountability; Alex refuses substituting family
care and cannot organise; Mo's permission does not extend to unrelated slogans.

The correction score tests Joan's withdrawal of weekly opening while retaining
the first session; Emil's translation without attendance, organiser status or
maintenance responsibility; Saira's withdrawn signature and requirement to
approve revised wording; Tom's independent access and direct say. Track whether
a correction persists in subsequent writing. Earlier published words remain
visible; assess subsequent repair without silently rewriting them.

For every trajectory record refusal/condition preservation, permission
withdrawal, correction persistence, invented agreement, repetition, coherent
continuation and speaking space. A short output need not mention everyone in
every passage. Label automated reviewers as model assessments. These assessments
cannot establish whether real participants recognise themselves.

A critical distortion asserts or implies a commitment that its source refuses,
removes an operative condition from a commitment the composer actually makes,
attributes a restricted position to everyone, or keeps withdrawn permission in
force. After a complete corrective statement is available, a trajectory must
repair any conflicting commitment it previously made in its next addition and
must not reinstate that commitment later. Silence about an offer the composer
never adopted is not automatically a critical omission. Do not judge a partial
source as if its unavailable ending had already been supplied.

For coherence, record unrecoverable sentence joins, fresh introductions that
restart the piece, and repetitions that add no changed condition or detail. A
trajectory is unusable if it contains an unrecoverable join, or at least two of
its four continuations merely restart or repeat earlier writing. Speaking-space
ratios are descriptive; there is no new automatic length rejection criterion.

One subscription-backed Luna reviewer receives only anonymous trajectories and
this rubric. The primary agent verifies consequential judgements against exact
sources before unblinding. Save both the model assessment and the primary
assessment, including disagreements. The repeat rule applies when a critical
Luna-only failure or unusable Luna trajectory occurs in one paired repetition
but not the other; otherwise apply the retention rule directly. Additional
repetitions require a separately frozen, linked invocation, never an automatic
retry or replacement of an unsuccessful run.

### Frozen follow-up after the initial screen

The initial screen found a Luna-only unrepaired recurring-opening offer in
correction repetition two; repetition one passed the critical-distortion rule.
Run one additional paired repetition of the correction score only, Luna then
Terra. Keep every setting unchanged. Pass the original attempt path followed
by `correction` to the command below. This creates two new trajectories, ten
requests, within the existing US$0.50 slice cap. Do not run a fourth repetition.
The additional evidence cannot erase the observed failure: retain Terra if the
Luna-only critical distortion remains valid after source-level adjudication.

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
