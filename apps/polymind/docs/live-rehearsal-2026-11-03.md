# Live co-writing audit — 3 November 2026

## Outcome

The continuous-writing mechanism works with actual local inference. Every writer
keeps one text across requests; participants and composer deliver text during
overlapping intervals, and later requests receive the latest published feedback.
There are no participant rounds or fixed short responses.

The small local model is useful for testing that mechanism, but its collective
writing is not ready for the performance. In particular, the eight-participant
runs drifted into metaphor or a catalogue of named speakers. Passing the timing
and persistence checks does not establish faithful composition.

## Environment and inference checks

Apple M1 Pro, 16 GiB memory; Ollama 0.40.13. The existing Gemma MLX service on
port 11434 was left unchanged. A separate local-only service on 11435 used
`qwen2.5:3b-instruct-q4_K_M`, 8192-token contexts and three parallel slots for
the pair, then nine for eight participants plus composer. No cloud provider was
called. See the [reproduction instructions](live-rehearsal.md#isolated-local-pair-setup).

A native streaming probe recorded individual non-empty response chunks, rather
than counting simultaneous HTTP requests:

| Probe                          | First text   | Shared delivery interval | 250 ms windows with every stream delivering |
| ------------------------------ | ------------ | ------------------------ | ------------------------------------------- |
| Three streams, 384 tokens each | about 2.54 s | 12.64 s                  | 49                                          |
| Nine streams, 256 tokens each  | 3.82–5.12 s  | 12.84 s                  | 50                                          |

The nine-slot model occupied about 4.8 GB according to Ollama. Host swap use was
about 6.5 GB; memory pressure predated the probe, so it cannot all be attributed
to this service. Short probe throughput is not a promise of rehearsal throughput:
refreshing requests with growing prompts costs additional time.

## Actual rehearsals

All used a 2 s collective publication interval. The composer was given every
participant's complete saved text at each request. The pair and first eight-person
journals were independently audited: every continuation prefix matched the saved
writer text, every composer source matched that participant's saved prefix, and
all append offsets matched exactly.

| Rehearsal          | Active duration | Refresh interval | Participant word counts | Collective words | Published updates | Windows with all writers delivering |
| ------------------ | --------------- | ---------------- | ----------------------- | ---------------- | ----------------- | ----------------------------------- |
| Chris and Rosa     | 49.45 s         | 2 s              | 235, 236                | 181              | 22                | 40                                  |
| Eight participants | 60.08 s         | 2 s              | 63–76                   | 50               | 23                | 8                                   |
| Eight participants | 60.16 s         | 5 s              | 176–203                 | 88               | 19                | 11                                  |

The pair used a 12,000-character prompt capacity; the eight-person runs used
24,000. These are capacity guards, not writing length targets. None of these
runs stopped at the capacity guard or used an output word cap. The eight-person
runs ended at the configured one-minute session duration.

The pair was exercised through the browser: Start, growing text, Pause, reload,
Resume and End. Pausing preserved unfinished sentences; resuming extended the
same texts. End disabled further writing. The browser displayed receiving and
waiting states, published collective updates, and participant text not yet sent
to the composer. The full eight-person runs used the same server API and the live
terminal runner respectively; they were not a second browser-control audit.

All eight participants received later collective versions in both full runs.
In the 5 s run, their last requests received versions 16 or 18. This proves
context delivery, not that a model attended to or meaningfully answered it.
The longer refresh interval increased participant output substantially in this
single comparison; it is not a controlled model-quality comparison.

## Writing assessment

The pair's collective occupied roughly one participant's speaking space and did
not concatenate both accounts. However, it claimed shared co-op experience and
blurred the difference between public-service accountability and internal co-op
decision-making. Participants also added details beyond their starting contexts.

At eight participants, the 2 s run introduced an unhelpful water metaphor. The
5 s run named speakers in sequence despite explicit instructions against doing
so. The better throughput did not repair that compositional failure. The local
3B model therefore passes a transport and feedback demonstration, but fails a
stronger artistic test of combining positions faithfully. Use the pair as the
initial local demonstration; compare a stronger composer before judging the
collective-voice design or moving to performance projection.

## Fixes discovered during verification

An initial 1.5B browser run produced a facilitator-style invitation and then an
empty composer continuation. Two separate fixes were needed: allow initial
participant writing before the first composer request, and distinguish an
interrupted assistant prefix from a response that already reached EOS.

Interrupted or budget-limited writing uses its exact assistant prefix. After
natural EOS, a clean append request carries the full saved contribution as
`existingText`, without a final assistant prefill. An empty prefill can try that
append form once; another empty result remains a visible error. Actual 3B probes
verified both a natural mid-word continuation and new text after EOS without
repeating the prefix. A mechanical space may join an EOS continuation; generated
words are never deleted or rewritten.

Code review also found and covered storage-failure shutdown and resuming an
interrupted composer while participants were waiting. Storage errors require
reopening the saved journal after checking storage, rather than an apparently
ready Start button.

## Automated checks

All 302 tests across 15 files passed, including journal recovery, exact prefix
preservation, bounded EOS recovery, feedback refresh, cancellation, server
controls and terminal storage-failure cleanup. Biome, TypeScript and the build
also passed. The build includes the browser assets. These checks are separate
from the real-provider and writing assessments above.

## Local evidence

Run journals contain complete prompts and texts and remain ignored in `runs/`:

- `live-pair-corrected-2026-11-03.jsonl` and its `-audit.json` summary.
- `live-eight-2026-11-03.jsonl` and its `-audit.json` summary.
- `live-eight-slower-2026-11-03.jsonl`.
- `local-parallel-probe-3b-8192.json` and `local-parallel-probe-9-3b-8192.json`.
- `local-clean-append-probe-3b.json` and `local-natural-prefill-probe-3b.json`.
- `live-rehearsal-pair.png`, captured during the browser rehearsal.

Offline `pnpm cli replay --run <journal>` reads saved writing without model calls.
The timing probe is reproducible with `mise exec -- node src/probe.ts --model
qwen2.5:3b-instruct-q4_K_M --base-url http://127.0.0.1:11435 --count 3 --tokens
384 --context 8192 --out runs/new-probe.json` after starting the matching service.
