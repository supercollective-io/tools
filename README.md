# Collective Microphone

Combine many contributions into one evolving collective voice.

Stage 1 is a terminal rehearsal tool: feed scored fragments from eight voices,
advance one batch at a time, stream a collective passage, and save the run.
It supports local Ollama and OpenAI through modular LangChain integrations.
The browser, simulated participants and live speech come in later stages.

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

## Run a local rehearsal

1. Start an existing Ollama service and inspect its models with `ollama list`.
   The application never downloads a model.
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
`next` to admit and compose the next batch. An `INPUTS` block shows each
prewritten contribution with its speaker's name, followed by the generated
`COLLECTIVE` passage. Streamed text is labelled provisional;
`[accepted and saved]` confirms it has entered the durable history.

Type `q` to pause at the prompt. Ctrl+C cancels an in-flight generation without
accepting its provisional output. A failed attempt leaves the batch pending;
press Enter or type `retry` to try that same batch again.

The example score is original demonstration writing, not the theatre piece's
actual source material. See [the examples](examples/README.md) and replace them
with your own eight voices when ready. The format also accepts other voice counts.

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

| Command  | Behaviour                                                                                  |
| -------- | ------------------------------------------------------------------------------------------ |
| `run`    | Start a new run from a score and configuration.                                            |
| `resume` | Continue the same score and frozen configuration; retry pending input.                     |
| `replay` | Print accepted passages immediately, without model calls or credentials.                   |
| `rerun`  | Create a separate run from previously admitted batches, optionally changing configuration. |

Both `run` and `rerun` accept `--out <new.jsonl>`. Existing files are never
overwritten. A rerun includes admitted batches from the source, including a
pending failed batch, but excludes future batches that were never admitted.
It generates its own collective history and links back to the source run.
Use `run` again when comparing the entire score, including unadmitted batches.

Replay pairs each accepted passage with its recorded input contributions and
speaker names. Any pending batch appears with an explicit indication that it has
no accepted collective passage. This works with existing Stage 1 logs and does
not contact a model. Retries display the same pending inputs again.

Only one process can own a writable run. After an unclean crash, its lock can
remain for 10 seconds. Resume reconciles an unfinished generation as interrupted
before offering its batch again. If the final JSONL line was torn, resume saves
the fragment to a neighbouring `.interrupted-<UUID>` file before repairing the
log. Corrupt complete records are reported rather than silently discarded.

Exit status is `0` for completion or an intentional pause, `1` for invalid input,
storage failure or a failed attempt left pending, and `130` for cancellation.

## Input and history settings

Inputs are UTF-8 JSON with `schemaVersion: 1`; unknown properties are rejected.
The example files are complete templates.

- A score contains `title`, `voices` and ordered `batches`. Each voice has an
  `id`, `name` and `fragments` of `{ id, text }`. Each batch has an `id` and ordered
  `{ voiceId, fragmentId }` references. References must exist and cannot repeat.
- Configuration contains `composer`, `instructions` and `history`. Composer
  requires `provider`, explicit `model`, `maxOutputTokens` and `timeoutMs`.
  Optional `baseUrl` and `temperature` allow endpoint and sampling changes.
  `think` is an optional Ollama-only boolean.
- `history.maxPassages` and `history.maxCharacters` jointly bound the most recent
  contiguous complete passages included in the prompt. Passages are not cut in
  the middle. Set either bound to zero to omit previous passages.
- The composer receives only admitted contributions and that recent history.
  Future fragments, names and private source material are not sent to it.

Configuration and source material are frozen when a run starts. Changing an
input file does not change an existing run. Use `rerun --config` for changes.
Thinking models may consume their output budget before producing visible text;
increase `maxOutputTokens`, or disable thinking where supported. The composition
instruction still controls the requested passage length. Context limits vary by
model; reduce the batch or history bounds if a provider rejects the prompt.

Run records contain the source snapshot, instructions, exact prompts, ordered
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
