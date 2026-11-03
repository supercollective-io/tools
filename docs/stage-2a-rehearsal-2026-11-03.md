# Stage 2A local rehearsal — 3 November 2026

## Final experiment

Ran the actual CLI in automatic mode with eight independent participants for
three rounds. Both roles used the installed `gemma4:12b-mlx` model, `think: false`
and the existing 256-token provider ceiling. Participant concurrency was one.

Each participant contributed once per round, developing their own position with
the previous collective passage available as optional context. No silence
protocol or word-count enforcement was used. The opening invitation appeared
only in the first round; later prompts contained the participant's own history
and the latest collective passage.

The completed local log is:

`runs/af056bb1-3a5e-4dd0-b35f-5a1fa4920dd4.jsonl`

It contains 24 generated participant contributions and three accepted collective
passages, with no failed calls. The log is local and ignored by Git. Replay it:

```sh
mise exec -- pnpm cli replay --run runs/af056bb1-3a5e-4dd0-b35f-5a1fa4920dd4.jsonl
```

## What was observed

All contributions and collective passages were read. The final participant brief
produced a mixture of independent continuation and engagement with the shared
voice. It did not prescribe how often a participant should engage.

- Sam kept his own focus on predictable shifts. In round three he qualified the
  collective's emphasis on responsibility: for him the issue was planning his
  life around work.
- Rosa continued distinguishing the co-op's control over major decisions from
  difficulties with everyday maintenance. She later introduced the successful
  change of cleaning company, preserving a positive experience within a broadly
  frustrated collective account.
- Chris picked up the collective's language about handling a mess, then sharpened
  his own position: he did not want to run a volunteer bus; he wanted those paid
  to manage the budget to explain their decisions.

The collective passages remained short and connected concerns rather than
listing all eight speakers. They concentrated on the burden of dealing with
decisions made elsewhere. That thread did not adequately carry Rosa's positive
experience, and some contributions still used repetitive agreement phrases.
These are limitations of this model/prompt rehearsal, not proof that participants
must interact with the collective in a particular way. Human attention and
engagement remain an open experimental question.

## Verification

Inspected the final run's recorded prompts and state:

- Every participant call contained only that person's private starting context.
- Own-turn history contained only that person's preceding contributions.
- All eight participants in a round received the same previous accepted
  collective passage, or `null` in the first round.
- Every composer call received exactly the eight saved texts from that round.
- Input context links matched the collective passage available at the start of
  the round. They do not assert that the text was a direct reply.
- CLI replay displayed all 24 contributions and three passages without changing
  the journal. No credentials were required for replay.

All 186 automated tests passed using `pnpm test --maxWorkers=1`. An earlier
parallel run hit a transient host disk-space error while creating temporary test
directories; the complete suite passed when rerun with one worker. Tests cover
round barriers, private context, bounded history, concurrent completions,
empty/truncated/failed generations, cancellation, partial-round recovery,
read-only replay, recorded-input reruns and mixed-provider credential recovery.
Existing scripted-mode tests remain included. Biome, type checking and the build
also passed.

Live provider checks used the local model. Cloud and mixed-provider behaviours
were tested with controlled endpoints and mocks, not live cloud calls.

Stage 2B continuous admission and projection were not implemented.
