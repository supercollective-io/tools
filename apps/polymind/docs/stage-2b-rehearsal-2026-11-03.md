# Stage 2B rehearsal — 3 November 2026

## Scope and configuration

Completed a continuous rehearsal with the eight fictional participants in
`examples/simulation.json`, using the installed local Ollama-compatible
`gemma4:12b-mlx` model for both roles. No cloud model was invoked.

The ignored local configuration is `runs/continuous-config.json`. It uses
three turns per participant, eight participant request slots, a separate composer
request, a 3000 ms composer interval, 240 characters per participant per batch,
and 12,000 pending characters per participant. Both model roles use
`think: false`, 256 output tokens and a 120-second request timeout.

The run is saved locally as `runs/stage-2b-live-2026-11-03.jsonl`. The audit is
`runs/stage-2b-audit-2026-11-03.json`; its script is `runs/audit-stage-2b.py`.
These rehearsal artefacts are ignored by Git. They are observations from one
model run, not committed fixtures or a claim about human behaviour.

## Observed execution

The run completed in 316.71 seconds, with:

- 24 completed participant turns and no failed participant generations;
- 1,722 durably saved text chunks;
- eight admitted batches and eight accepted collective passages;
- no failed composer attempts and no unconsumed text at completion.

The first batch used Ben's prefix while his generation was still active. It
ended with `You just see the notification and have to do what it`. The composer
started without waiting for Ben to finish or for the other seven people to
produce a complete turn. Subsequent admissions included mechanical mid-word
continuations such as `as to deal with` after an earlier prefix ending in `h`.

Three batches were admitted while participant requests were still active. Only
one participant's own text was admitted before that specific turn finished.
The service delivered participant streams largely in sequence despite eight
open requests. The first three composer requests took 66.37, 52.53 and 88.57
seconds respectively. Those timings include waiting at the model service.

Seven of the 24 participant turns started with an accepted collective passage
available; the other 17 started before any collective passage had been accepted.
A later turn therefore does not necessarily receive new feedback. This is the
specified continuous behaviour, but the observed service queue makes feedback
much slower than the application's admission interval suggests.

The application can overlap generation and composition. This particular local
service does not establish venue-ready parallel throughput. A service with more
parallel capacity, or a separate composer service, needs its own timed rehearsal.
Reducing participant request concurrency changes the balance between participant
coverage and feedback delay; it is not equivalent to simultaneous human speech.

## Saved-input and context audit

The audit checked the actual journal and stored prompts:

1. Each admitted slice matched the saved source text at admission, with exact
   Unicode code-point offsets. No future or unsaved suffix was admitted.
2. Each turn's next slice began where its preceding slice ended. At completion,
   every saved character had been admitted exactly once.
3. Each participant start recorded the latest accepted collective passage at
   that moment. The corresponding prompt contained that same passage.
4. Participant prompts included only that participant's private background and
   perspective. Their recorded history contained only their own earlier text.
5. Composer prompts contained the exact admitted contributions and collective
   history, without private participant backgrounds.
6. Offline CLI replay displayed all eight named voices and all eight accepted
   passages with an empty `OPENAI_API_KEY`. The journal's SHA-256 was unchanged.

## Writing observations

The collective did not concatenate participant contributions. Each passage was
23–38 words. Across the full run, the collective spoke 241 words; individual
participants spoke 137–234 words, averaging 169.5. The collective was therefore
about 42% longer than the average participant. Natural brevity is approximate;
there is no output word-count rejection, cropping or automatic rewrite.

The writing still repeatedly returned to a generic complaint about “the
system”. In batch six, Rosa distinguished an internal difficulty taking a
decision from having choices imposed externally. The collective merged that
with other speakers' imposed decisions and said the system would not let the
group take the lead. It lost an important difference rather than preserving
that tension. The small final continuation also triggered another restatement.

Some simulated participant detail went beyond the supplied background, such
as Mo's specific Tuesday use of library computers. Private prompt isolation
does not guarantee faithful simulation of the supplied circumstances.

The independent-position prompt did allow qualification: Rosa's third turn
explicitly redirected the collective's framing towards her co-op's own decision
process. That is evidence of optional engagement in this run, not proof of a
stable participant disposition or an empirical model of audience behaviour.

## Deterministic verification

The final full suite passed **246 tests across 11 files**, using
`mise exec -- pnpm test --maxWorkers=1`. Biome, TypeScript checking and the build
also passed. Both continuous example configurations passed schema validation
after replacing their model placeholders.

New tests cover actual streamed input through a localhost provider double,
composition before participant completion, bounded concurrent calls, private
prompts, frozen turn-start context, fair participant scheduling, Unicode slices,
full-buffer backpressure, timeout while waiting for buffer space, interrupted
prefix recovery, identical composer retries, whitespace drainage, storage
failures and offline replay. Existing Stage 1 and Stage 2A tests remain green.

The concurrent tests exposed two races, which were fixed: a queued collective
acceptance could survive cancellation, and an empty failed final participant
turn could be mistaken for normal completion before failure propagation.
Backpressure notifications now occur only after actual journal changes, avoiding
mutual wake-ups between full producer buffers. Cancellation and failure fixes
were verified with deterministic tests; the real-provider run had no failures.

Stage 2B's continuous protocol is implemented and exercised. Writing quality
and local service throughput remain rehearsal limitations. Projection, real
phone contributions, speech and Coolify deployment remain later stages.
