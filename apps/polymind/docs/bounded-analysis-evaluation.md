# Comparing bounded analysis prompts

Use this small comparison to review the concise `analysis-v2` overview against
the existing `bounded-v1` analysis. The
[corpus](../examples/bounded-analysis/evaluation.json) contains five entirely
fictional frozen rounds. No provider calls or human rehearsal outcomes accompany
the corpus.

## Conditions and evidence

The variants use the exact application prompts at the selected Git revision:

| Variant       | Canonical implementation                                          | Output                                                                                         |
| ------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bounded-v1`  | `modelExecutor` in [jobs.ts](../src/session/jobs.ts)              | Themes, similarities, tensions, conflicts, outlying concerns and questions                     |
| `analysis-v2` | `analysisV2Messages` in [analysis.ts](../src/session/analysis.ts) | At most four common-ground findings, three differences, three questions and two other concerns |

Keep the provider, model, token ceiling, timeout and frozen snapshot identical
within each pair. Save the Git revision and copies of both source files with
the review. Do not substitute a live collective-voice prompt or a topic-specific
prompt. Both variants receive complete contribution text and the actual round
question. The v2 request uses compact source and contributor aliases; validated
results retain the exact frozen source references.

The corpus covers shared concrete intentions, different emphasis without
disagreement, expressed contradiction, an isolated concern, and unequal writing
lengths. The last round uses another question to expose dependence on an assumed
topic. `reviewFocus` contains reviewer notes. Send only each round's `snapshot`
to the rehearsal script; never send the reviewer notes.

## Prepare requests offline

Preparation requires the repository's installed dependencies and a private
directory outside event data. Run these commands from the repository root.
Create an operation configuration JSON file with an explicitly selected provider
and model, plus `maxOutputTokens`, `timeoutMs`, `promptVersion` and
`maxInputCharacters`; see [operationConfigSchema](../src/session/contracts.ts).
A ceiling of 4,096 output tokens and 200,000 input characters is a starting
configuration to review, rather than evidence that either model completes within
those limits.

Set `EVALUATION_CONFIG` to the configuration's absolute path and `EVALUATION_OUT`
to a new absolute directory. The following command validates all snapshots and
writes ten request files without contacting a provider:

```sh
mise exec -- node --input-type=module <<'JS'
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { operationConfigSchema, snapshotSchema } from './apps/polymind/src/session/contracts.ts';

const directory = process.env.EVALUATION_OUT;
const configFile = process.env.EVALUATION_CONFIG;
if (!directory || !configFile || !isAbsolute(directory) || !isAbsolute(configFile))
  throw new Error('Set absolute EVALUATION_OUT and EVALUATION_CONFIG paths.');
const corpus = JSON.parse(await readFile('apps/polymind/examples/bounded-analysis/evaluation.json', 'utf8'));
const supplied = JSON.parse(await readFile(configFile, 'utf8'));
const rounds = corpus.rounds.map(round => ({ ...round, snapshot: snapshotSchema.parse(round.snapshot) }));
const variants = ['bounded-v1', 'analysis-v2'].map(promptVersion =>
  operationConfigSchema.parse({ ...supplied, promptVersion, autoPublish: false }));
await mkdir(directory, { mode: 0o700 });
for (const round of rounds) for (const config of variants) {
  const label = `${round.id}-${config.promptVersion}`;
  await writeFile(join(directory, `${label}.json`), JSON.stringify({
    authorisation: 'run-provider-rehearsal', kind: 'analysis',
    snapshot: round.snapshot, config, maxProviderCalls: 1,
    outputDirectory: join(directory, `${label}-result`)
  }, null, 2), { mode: 0o600, flag: 'wx' });
}
console.log(`Prepared ${rounds.length * variants.length} requests; no provider calls made.`);
JS
```

Review the ten files before dispatch. Each pair must contain identical snapshot
data and model settings. Every `outputDirectory` must be new. Preparation and
the request's `authorisation` field do not replace the user's permission to
spend money.

## Run only after explicit authorisation

Obtain authorisation for the provider, model and total call budget before running
any prepared request. One pass through five rounds and two variants uses ten
analysis calls. A second pass uses another ten. The per-request call limit does
not reserve money or impose an aggregate spending limit.

The existing [rehearsal script](../scripts/rehearse-bounded.mjs) accepts one
request at a time through the root recipe:

```sh
mise exec -- just rehearse-models /absolute/private/shared-intention-analysis-v2.json
```

Substitute the actual prepared request path. Alternate which variant runs first
across rounds. The script saves private `request.json` and either `result.json`
or `failure.json` in the requested output directory. It does not publish to a
session. Inspect both outputs in each pair before continuing. Record validation
failures and timeouts as outcomes; do not retry, repair or shorten an output
silently. Any authorised retry needs a new output directory.

## Human review

Read each complete snapshot before reading its outputs. Give the two outputs
anonymous labels for the first comparison, then reveal the variants to inspect
their different schemas. Preserve examples and disagreements between reviewers
instead of reducing the comparison to one automatic score.

| Criterion              | Review question                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fidelity               | Does each selected finding preserve the contributing person's intention, refusal and uncertainty?                                                  |
| Concrete common ground | Does a connection name a shared intention, need or possibility, supported by distinct contributors?                                                |
| Differences            | Does the output distinguish emphasis, tension and incompatible expressed positions without inventing conflict or smoothing it away?                |
| Questions              | Does a question arise from the accounts and matter to their inquiry?                                                                               |
| Isolated concerns      | Does the selection preserve a specific isolated concern without claiming that everyone shares it?                                                  |
| Concision              | Can a person read the overview quickly and recognise useful content without generic headings or repetitive findings?                               |
| Unequal lengths        | Does selection use the short and long accounts without treating length or source order as importance?                                              |
| Provenance and privacy | Do references support the finding, do excerpts match exactly, and do public projections omit private references and evidence?                      |
| Personal perspective   | Does the released view select only existing findings linked to that person's frozen contribution, with only that person's references and excerpts? |

For each round, record the source reference, the relevant output passage, the
reviewer's judgement and a reason. Record beneficial omissions as well as harmful
distortions. Empty sections are valid. Neither exhaustive coverage nor forced
agreement is a success criterion. Compare the public v2 projection for
readability and the full private result for provenance; personal views need no
additional model call.

Finish with a decision for each observed weakness: accept the trade-off, change
one coherent prompt element, or gather more evidence. Preserve the original
outputs before another comparison. Synthetic examples and passing validation
tests establish covered software behaviour. They do not establish that people
feel represented, find the overview useful, or can use it in a venue. Those
claims require a separate human rehearsal and participant feedback.
