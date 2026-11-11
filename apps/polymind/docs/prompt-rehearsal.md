# Iterating live prompts from recorded inputs

The default arrangement starts every recording at zero. Timestamped transcript
cues become cumulative text revisions at their **end** times. This is a coarse
simulation of arriving text, not streaming speech recognition. Original audio is
not uploaded or transcribed. A staggered arrangement sets individual `startMs`
values; keep simultaneous starts as the main development case.

## Prepare and run

Preparation is offline, validates inputs and prints the complete frozen plan:

```sh
mise exec -- pnpm rehearse-prompts --plan examples/prompt-rehearsal/plan.json --prepare
```

The example contains fictional material. The private human-six plan prepared for
this workspace is `runs/human-six-prompt-plan.json`. Its English text matches the
existing human-six working set. Corrections retain the original cue boundaries;
the existing translation of h01 is aligned to its three Spanish cues, with an
explicit approximation note. SRT endpoints can extend past measured audio
length; they are retained as supplied, not presented as precise audio timings.

To run the human case with the explicit Luna/G live preset:

```sh
mise exec -- pnpm rehearse-prompts --plan runs/human-six-prompt-plan.json --out runs/human-six-prompt-v1
mise exec -- pnpm inspect-prompts --run runs/human-six-prompt-v1 --json
```

The first command makes real composer calls using the configured provider and
credentials. It never calls participant models. The second is read-only and
requires no keys. Both print JSON. Use a new output directory for every run;
existing directories are refused. Parent directories must already exist.

Plan paths resolve relative to the plan file. `config` selects a version-2 live
configuration; optional `prompt` points to a UTF-8 artistic prompt override.
`hypothesis` describes the intended change. Each track has a unique `id`, an
optional non-negative `startMs` (default zero), a `timingNote`, and either `srt`
or explicit `cues` containing `endMs` and `text`. Inline cues allow reviewed
corrections or translations without rewriting original transcripts. Cue endpoints
must strictly increase; each complete contribution fits the existing 4,000 UTF-16
unit phone limit. Up to 100 tracks are accepted, not a claim of performance at
that scale. No automatic timing interpolation or playback acceleration occurs.

## Timing and stopping

The runner uses the existing SQLite revision queue and live controller. As in
phone participation, admission happens every two seconds, captures the latest
pending revision from every participant and coalesces superseded revisions.
Both paths use the same admission operation. The replay directly supplies
cue revisions; it does not emulate the browser's one-second network saves.
Inputs and model generation overlap. All tracks are registered before the start;
empty contributions are excluded from composer prompts.

The run ends at the last scheduled cue plus `tailMs` (default ten seconds).
This is a fixed time allowance, not a promise that the composer finishes a
sentence or consumes all input. Ending cancels active generation and preserves
every streamed prefix. Compare variants with the same allowance; increase it
explicitly if the report shows unread final input. Maximum total duration plus
the one-second controller guard is one hour. Provider request token budgets and
timeouts come from the live configuration; this command has no monetary budget
reservation. It uses the normal live adapter without fallback.

Ctrl+C or SIGTERM pauses safely and saves an interrupted outcome. A provider
failure pauses the controller and retains the sanitised journal failure. The CLI
returns non-zero for interruption, failed attempts, or final inputs not admitted
or not seen by a request. A deadline can still interrupt an in-flight request;
inspect finish reasons before judging completion. Automated resumption of the
input timeline is not implemented: start a fresh comparison run. Offline
inspection remains available after a crash, including incomplete journal tails.

## Evidence and editorial review

Each private run directory contains:

- `plan.json`: frozen sources, schedule, effective configuration and fingerprints.
- `live.jsonl`: the normal append-only live journal, with exact effective prompts,
  streamed prefixes, admissions, publications and lifecycle events.
- `participation.sqlite`: the normal input revision queue, including unadmitted
  revisions. It contains join credentials; do not publish the directory.
- `participants.json`: stable track names mapped to this run's participant IDs.
- `outcome.json`: stopping reason and scheduled versus actual saved arrival times.
- `inspection.json`: the completed inspection snapshot; `inspect-prompts` rebuilds
  it read-only from saved evidence.
- `review.json`: separate editable assessment, initially empty except for the
  hypothesis. Add moments referring to attempt IDs or timeline milliseconds,
  distinguish creator comments from assistant interpretations, and record the
  decision and next change. The inspector does not overwrite this file.

Inspection includes final and published text, scheduled inputs, actual admissions,
exact request messages, collective text before each request and its addition,
first-text waits, finish reasons and publication offsets. `available` means
admitted source state at that request; `messages` is what the model was actually
sent. Pending and unseen final tracks are reported separately. Timing is journal
and local replay timing, not an isolated network latency measure.

First watch/read the whole developing thought, then identify one promising
moment and one consequential weakness. Record one hypothesis, alter one coherent
part of the prompt and replay the same schedule. Repeat promising comparisons
before checking staggered starts. Compare input fingerprints across runs and
hold model, refresh and stopping settings fixed. Random generation and request
latency can change request boundaries even with the same input timeline.

Ask where the thought develops, becomes generic or repetitive, distorts a
consequential meaning, or gives someone something worth answering. Keep those
judgements in `review.json`; do not convert transport measures into an artistic
score. Recorded voice notes cannot establish that people feel represented or in
conversation. A subsequent human rehearsal supplies that evidence.

## Prompt and recency comparison batch

`pnpm prompt-experiments` prepares and runs a small controlled batch. It compares:

| Variant | Artistic prompt                                                         | Source presentation                                              |
| ------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A       | Current G-derived live baseline                                         | Complete current text plus new-text markers                      |
| B       | A without the final qualification paragraph                             | Same as A                                                        |
| C       | B with the movement paragraph reduced to direct voice and relationships | Same as A                                                        |
| D       | Exactly C                                                               | Complete current text only; no `newFrom` or duplicated `newText` |

D tests the extra emphasis created by explicitly repeating the latest words. It
still receives every participant's complete current account, the existing
collective, and the same cumulative speaking-space figures. Inputs continue to
arrive on the same schedule. It does not hide new contributions or force the voice
to look backwards. `live.sourcePresentation: "complete"` opts into this input
format; an absent setting retains the default presentation. Compare C with D to
isolate presentation, A with B for the qualification paragraph, and B with C for
the prescribed movement. Do not attribute all differences between A and D to
recency alone.

Two repetitions of each variant on two input sequences produce 16 runs. Jobs
are shuffled once during offline preparation; the frozen batch records their
order and anonymous reading labels. Two runs execute concurrently. The batch
stops dispatching after a failure or interruption, pauses active jobs, preserves
all prefixes and lists unstarted jobs. There are no automatic retries, model
fallbacks or monetary budget reservations. Duration and per-request token limits
are frozen in each job; request counts and actual costs depend on the model.

The prepared private batch in this workspace uses the first minute of the latest
three-person trial (21 exact admitted revisions) and the simultaneous human-six
recordings. Both use the same baseline model and artistic prompt. It takes roughly
15 minutes at concurrency two, plus provider and filesystem overhead:

```sh
mise exec -- pnpm prompt-experiments \
  --plan runs/prompt-experiments-batch-v1.json \
  --out runs/prompt-experiments-v1
```

This command makes real provider calls. Preparation alone is offline:

```sh
mise exec -- pnpm prompt-experiments --prepare \
  --live-plan runs/prompt-experiments-live-minute.json \
  --recorded-plan runs/human-six-prompt-plan.json \
  --out runs/prompt-experiments-batch-v2.json
```

Preparation requires the expected four-paragraph baseline so a changed prompt
cannot silently produce a different deletion experiment. It embeds all source
texts, timing, configs and variant instructions; subsequent source-file edits do
not change that batch. Runtime continuation code is shared with the live engine;
run comparisons on the same code revision. Each actual request is journalled.

A replay cue with `replace: true` replaces the person's current source with its
exact `text`, including edits and empty-string deletions. Ordinary cues append
text as before. Recorded trial times are admission times; replaying through the
queue may shift actual admission by a tick. Recorded replies are responses to the
original collective and cannot establish how people would respond to a variant.

Read `reading-copy.txt` or `reading-copy.json` before `key.json`. The JSON includes
chronological output additions and completion diagnostics but omits conditions,
hypotheses and source text. This conceals labels, not the recognisable subject
matter. The individual run directories retain exact inputs, prompts and
`review.json` for comments. No automatic artistic ranking is produced.

Assess whole-trajectory development, fidelity to the accounts' character, and
unsolicited caution. For recency, look for connections that use earlier material
without ignoring meaningful new developments. Mere mention of an old topic is
not success. Retain specific moments and disagreements; two repetitions are
exploration, not a reliability estimate. Crossing a request boundary mid-sentence
is allowed but is not itself a quality criterion.

To rebuild reading copies offline after a crash:

```sh
mise exec -- pnpm prompt-experiments --inspect runs/prompt-experiments-v1
```

Existing batch files and run directories are never overwritten by preparation or
execution. Inspection only rebuilds the reading copies. Incomplete runs retain
their prefixes and are marked in the reading JSON; do not treat them as completed
comparisons. A new execution requires a fresh output directory.

## Selected working prompt

The creator approved the recorded human-input outputs text-015 and text-016
from `runs/prompt-experiments-v1`, both variant C. C is now the artistic prompt
in `examples/live-projection.json`, also used by default for new phone sessions.
The model and source presentation remain unchanged: Luna with reasoning off,
complete current accounts plus new-text markers. Saved sessions retain their
frozen artistic instructions. Restart the server and create a new session to
use the selected prompt. No scheduling change is part of this selection.

The original four-paragraph baseline is preserved in
`examples/prompt-rehearsal/baseline-g.txt`; the fictional experiment plan selects
it explicitly so the A–D comparison remains reproducible. Existing frozen batch
files and outputs remain unchanged. To prepare that historical comparison from
other plans, explicitly select this baseline with their `prompt` field; the
current C preset intentionally does not pass the old four-paragraph check.
