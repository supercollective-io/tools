# Collective Microphone

Combine many contributions into one evolving collective voice.

The current live rehearsal gives every participant and the collective one
growing text, with context refreshed during writing. A local browser workspace
shows their progress. It supports local Ollama and OpenAI through modular
LangChain integrations. Stage 1 scripts and Stage 2A round-based simulation remain
available; performance projection and live phone speech come later.

The first artistic context is **Rehearsing We**, a participatory performance
exploring collective power. The [piece brief and topic-design proposal](docs/rehearsing-we.md)
describe that context; scores and composer instructions remain configurable for
other topics.

## Set up

Install [mise](https://mise.jdx.dev/), then run from this checkout:

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm hooks:install
```

The repository pins Node 26.13.0 and pnpm 12.16.1. Use `mise exec --` before
commands below if mise is not activated in your shell. Project dependencies
are locked. pnpm policy lives in `pnpm-workspace.yaml`; unknown dependency
build scripts fail installation. Lefthook installation is explicit rather
than an automatic dependency lifecycle script.

## Start

Install [Ollama](https://ollama.com/download), then:

```sh
pnpm start
```

This prepares a separate local model service, downloads Qwen 3B if needed
(about 1.9 GB, once), and opens the browser. Press **Start** to begin the default
one-minute rehearsal with two participants. Ctrl+C stops the app and its model
service; the writing is saved automatically. Your existing Ollama service stays
unchanged. If mise is not activated in your shell, use `mise exec -- pnpm start`.

```sh
pnpm start --all   # Eight participants
pnpm resume       # Latest unfinished rehearsal
pnpm replay       # Read the latest saved rehearsal; no model service needed
```

The small local model is useful for trying the interaction; its composition
quality is still limited, especially with eight participants. See the
[actual rehearsal results](docs/live-rehearsal-2026-11-03.md).

Optional overrides: `--scenario`, `--config`, `--run`, `--port`, `--no-open`.
A custom configuration uses the model services you specify. `pnpm start --help`
lists the options. The [guide](docs/live-rehearsal.md) covers configuration,
feedback and recovery; the historical experiments below remain available.

## Run a scripted Stage 1 rehearsal

1. Start an existing Ollama service and inspect its models with `ollama list`.
   This historical command expects the model to be installed already.
2. Copy the example configuration to the ignored `runs` directory:

   ```sh
   mkdir -p runs
   cp examples/ollama.json runs/local-config.json
   ```

3. Edit `runs/local-config.json`, replacing `REPLACE_WITH_INSTALLED_MODEL`
   with the exact model name. The local integration was exercised with
   `gemma4:12b-mlx`. The example explicitly uses `think: false`; omit that field
   to use your model's default, or set it to `true` for supported thinking models.
4. Run the demonstration score:

   ```sh
   pnpm cli run --score examples/score.json --config runs/local-config.json
   ```

The CLI prints the absolute path of its new JSONL run file. Press Enter or type
`next` to admit and compose the next percentage step. An `INPUTS` block shows
the next character slice of every participant's prewritten text with its
speaker's name, followed by the generated
`COLLECTIVE` passage. Streamed text is labelled provisional;
`[accepted and saved]` confirms it has entered the durable history.

Type `q` to pause at the prompt. Ctrl+C cancels an in-flight generation without
accepting its provisional output. A failed attempt leaves the admitted slices
pending;
press Enter or type `retry` to try those same slices again.

The example score uses eight fictional people speaking about having a say over
things they depend on: shifts, housing, transport, care and other everyday
decisions. Their contributions are prewritten, not real participant recordings.
With `chunkPercent: 20`, five steps each admit the next 20% of every text.
The cuts can fall inside words or sentences; they do not align themes or complete
thoughts. See [the examples](examples/README.md) for the topic and source material.
Start a new run to use the current score; old logs retain their original material.
The format also accepts other topics and voice counts.

## Historical Stage 2A rehearsal

This earlier round-based experiment is retained for comparison. Use the live
workspace above for continuous co-writing.

Stage 2A uses eight independent fictional participants who share and develop
their own positions. The previous accepted collective passage is available
context; engaging with it is optional. Their scenario backgrounds are private
initial context, not prewritten output. Every participant completes one actual
text response per round before the composer runs. This mode does not use Stage 1
percentage cuts.

```sh
cp examples/simulation-ollama.json runs/simulation-config.json
```

Replace both `composer.model` and `simulation.participants.model` placeholders
with installed model names, then run:

```sh
pnpm cli simulate --scenario examples/simulation.json --config runs/simulation-config.json
```

Enter advances a round; `q` pauses. Use `--auto` for automatic rounds. The example
uses three rounds, participant concurrency one and a 1000 ms interval. Empty,
truncated or failed generations leave unfinished work for retry. Ctrl+C retains
completed participant responses for
resume. `resume` and offline `replay` apply to both rehearsal modes; `resume`
also accepts `--auto` for simulation runs.

A simulation `rerun` composes from frozen recorded responses without participant
calls. It includes rounds with a completed text from every participant, including
pending composer work, but excludes unfinished rounds with only some responses.
The original `respondingToPassageId` links identify available collective context,
not proof of a direct reply, and remain intact in the rerun. A configuration
override changes the composer. Start a fresh `simulate` run for new participant
contributions in the context of its own collective history.

Use `examples/simulation-openai.json` for cloud models and provide
`OPENAI_API_KEY` through the environment. See the [Stage 2A procedure](docs/stage-2a.md)
for private context, bounded history, recovery and rehearsal checks. Stage 2A
keeps its complete-round behaviour alongside live co-writing.

## Historical streamed-turn experiment

The earlier bounded-turn Stage 2B design is superseded by the
[live co-writing model](docs/live-rehearsal.md). Existing historical logs remain
readable. Its [design notes](docs/stage-2b.md) are retained for that history;
new `simulate-continuous` runs use schema-version-2 live configuration and the
same continuous writer model as the browser workspace.

## Use a cloud model

Copy `examples/openai.json` to `runs/cloud-config.json` and replace its model
placeholder with a model available to your OpenAI account. Copy `.env.example`
to `.env` and set `OPENAI_API_KEY` there, or export it in your shell.

```sh
pnpm cli run --score examples/score.json --config runs/cloud-config.json
```

The `pnpm cli` command loads `.env` if present. Credentials are never read from
configuration JSON or included in run records. The cloud adapter has automated
mock coverage; a real cloud smoke test requires your account and credentials.

There is no automatic switch between local and cloud providers. Hosted tracing
and verbose provider logging must be disabled; the CLI rejects enabled LangChain
or LangSmith tracing environment variables before creating a run.

## Resume, replay and rerun

Substitute an actual run path for `runs/session.jsonl`:

```sh
pnpm cli resume --run runs/session.jsonl
pnpm cli replay --run runs/session.jsonl
pnpm cli rerun --run runs/session.jsonl --config runs/cloud-config.json
```

| Command               | Behaviour                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `rehearse`            | Open the local live workspace from a scenario or saved live journal.                     |
| `run`                 | Start a scripted run from a score and configuration.                                     |
| `simulate`            | Start independent participant rounds from a scenario and configuration.                  |
| `simulate-continuous` | Continue live co-writing in the terminal.                                                |
| `resume`              | Continue the saved run and frozen configuration; retry unfinished work.                  |
| `replay`              | Print saved writing immediately, without model calls or credentials.                     |
| `rerun`               | Create a separate run from previously admitted steps, optionally changing configuration. |

`run`, `simulate`, `simulate-continuous` and `rerun` accept `--out <new.jsonl>`.
Existing files are never overwritten. A rerun includes admitted steps from the source, including a
pending failed step, but excludes future steps that were never admitted.
It generates its own collective history and links back to the source run.
Live logs support resume and replay, but not frozen rerun.
Use `run` again when comparing the entire score, including unadmitted steps.

For Stage 1 and Stage 2A, replay pairs each accepted passage with its recorded input contributions and
speaker names. Any pending input appears with an explicit indication that it has
no accepted collective passage. Existing version-1 logs retain their original
fragment-based inputs and remain replayable without a model. They are not
resliced from current example files. Retries display the same pending inputs again.

Only one process can own a writable run. After an unclean crash, its lock can
remain for 10 seconds. Resume reconciles an unfinished generation as interrupted
before offering its pending input again. If the final JSONL line was torn,
resume saves the fragment to a neighbouring `.interrupted-<UUID>` file before repairing the
log. Corrupt complete records are reported rather than silently discarded.

Exit status is `0` for completion or an intentional pause, `1` for invalid input,
storage failure or a failed attempt left pending, and `130` for cancellation.

## Scripted input and history settings

Stage 1 inputs are UTF-8 JSON; unknown properties are rejected. Scores use
`schemaVersion: 2`; configuration retains `schemaVersion: 1`. The example files
are complete templates.

- A version-2 score contains `title`, `chunkPercent` and `voices`. Each voice has
  an `id`, `name` and one continuous `text`. `chunkPercent` is an integer from
  1 to 100. Voice IDs are unique. Every step admits the next `chunkPercent` of each text by character position, including
  all voices. Cuts can fall inside words and sentences. The final step admits
  all remaining characters. The example uses 20%, producing five steps.
  Characters are Unicode code points (`Array.from`), preserving original
  whitespace. For a text of length `N`, a percentage boundary `p` falls at
  `floor(N * p / 100)`. The last boundary is 100%, including any remainder.
  Intervals empty for every voice are skipped. Individual empty slices remain
  included and labelled when another voice has new text in that interval.
- Configuration contains `composer`, `instructions` and `history`. Composer
  requires `provider`, explicit `model`, `maxOutputTokens` and `timeoutMs`.
  Optional `baseUrl` and `temperature` allow endpoint and sampling changes.
  `think` is an optional Ollama-only boolean.
- `history.maxPassages` and `history.maxCharacters` jointly bound the most recent
  contiguous complete passages included in the prompt. Passages are not cut in
  the middle. Set either bound to zero to omit previous passages.
- The composer receives only the new character slices and that recent history.
  Earlier raw slices and future source text are not sent to it. Longer source
  texts contribute more characters per percentage step.
- The collective speaks for about as long as one participant, rather than
  taking a separate turn for every voice it hears. The prompt asks for one
  connected thought that preserves a real tension, instead of a catalogue of
  speakers or topics. This is a compositional principle, not a word-count limit:
  passages are not cropped or rejected for their length.

Percentage steps simulate finite prerecorded contributions whose full lengths
are known. Live co-writing uses saved full prefixes and refreshed context, without
assuming a known final length. The live phone interfaces remain future work;
Stage 1 percentage slicing and Stage 2A complete rounds remain available.

Configuration and source material are frozen when a run starts. Changing an
input file does not change an existing run. Use `rerun --config` for changes.
Thinking models may consume their output budget before producing visible text;
increase `maxOutputTokens`, or disable thinking where supported. The composition
instruction controls the voice, emphasis and natural passage length. Context limits vary by
model; reduce `chunkPercent` or the history bounds if a provider rejects the prompt.

In Stage 1 and Stage 2A, provider-reported token-limit cutoffs remain provisional
and are rejected.
Incomplete text never enters accepted history. The same input stays pending for
an explicit retry. The existing token setting is a provider resource ceiling,
not a way to force the collective to stop speaking mid-sentence. Live co-writing
instead retains every saved prefix and continues across inference budgets; see
the live guide for its publication model and full-context capacity.

Stage 1 and Stage 2A run records contain the source snapshot, instructions, exact prompts, ordered
contributions, accepted output, timings, usage when supplied, and sanitised
failures. They do not store raw provider errors or thinking traces. Run data and
local credentials are ignored by Git.

## Develop and verify

```sh
pnpm run check
pnpm run typecheck
pnpm test
pnpm run build
node dist/cli.js --help
```

`pnpm run fmt` applies formatting; `pnpm run lint` runs lint checks. Lefthook
checks staged supported files without rewriting them. CI uses the same toolchain,
a frozen install, checks, type checking, tests and a build; it needs no model keys.

Tests use deterministic model doubles, real temporary journals and local fake
provider endpoints. Real provider tests are explicit rehearsal commands, never
automatic CI calls. Compiled execution reads credentials from the environment;
use `node --env-file=.env dist/cli.js …` when needed.

See [the rehearsal procedure](docs/rehearsal.md) for the Stage 1 gate and
[the implementation plan](docs/plan.md) for later stages. Coolify packaging is
deliberately deferred until performance readiness; the architecture remains a
single persistent Node process with durable storage.
