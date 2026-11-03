# Natural speaking-space rehearsal — 3 November 2026

## What was tested

Two complete five-step runs of `examples/score.json`, using the same controller,
provider adapter and journal as the CLI, with the updated `runs/local-config.json`.
The local model was `gemma4:12b-mlx`, with `think: false`, a 256-token provider
ceiling and the existing history window. Only the style instructions changed in
the local configuration; model and history settings remained unchanged.

The composer was asked to take one participant's speaking space and express one
connection or tension. There was no numeric word target, word-count rejection,
cropping, shortening pass or automatic retry. Counts below are measurements of
the resulting text, not acceptance thresholds.

## Observed lengths

| Step | Mean words per participant's new slice | Collective A | Collective B |
| ---- | -------------------------------------- | ------------ | ------------ |
| 1    | 28.8                                   | 29           | 24           |
| 2    | 28.8                                   | 36           | 31           |
| 3    | 27.9                                   | 35           | 24           |
| 4    | 29.6                                   | 25           | 27           |
| 5    | 28.8                                   | 31           | 26           |

All ten generations completed normally. Full collective texts were 156 and 132
words respectively. The mean accumulated input per participant was about 144
words when counting the admitted slices separately. Mechanical cuts inside words
can make that count slightly higher than counting each original text as a whole.

Local logs, including frozen source material, configuration, exact prompts and
all accepted output:

- A: `runs/rehearsal-brief-75231026-0e67-4f25-b542-59b0104235f4.jsonl`
- B: `runs/rehearsal-brief-915df608-3dfe-40f7-b5b0-a739c090084f.jsonl`

These logs remain local and are ignored by Git.

## Reading the output

All ten passages were read alongside their inputs. They express a shared concern
instead of concatenating the eight contributions. For example, run A opens:

> It's frustrating when we put in the effort to organise something, like the signatures or the library work, only to have the communication drop off or nothing actually happen.

The amount of speaking is now close to that of one participant without an
enforced length limit. This does not establish faithful synthesis in every case.
The model still sometimes generalises individual situations into an overly broad
collective claim. In run B, step 3, the council/company care dispute becomes
“our actual work just stops”, which the inputs do not establish for the group.
Later passages also tend to return to the burden of participation. These remain
limitations of the local model's synthesis, distinct from the corrected
concatenation and output-completion behaviour.

## Completion checks

An actual local generation with an eight-token ceiling was deliberately forced
to stop early. The adapter reported `truncated` and rejected the unfinished text.
A separate reasoning-mode trial also exhausted its 2,048-token allowance and was
rejected; reasoning mode was not enabled in the local configuration.

The 127 automated tests passed, including provider cutoff metadata, pending-input
recovery, offline replay, identical-input retry and accepting a complete passage
longer than its inputs without trimming. Biome, type checking and the build also
passed. Cloud behaviour was tested with mocks; no live cloud-model calls were made.
