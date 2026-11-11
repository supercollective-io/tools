# Admission and natural-continuation experiment

This slice tests whether 100 concurrently active clients can keep their current
writing available to one composer. It separates admission throughput from model
responsiveness and the artistic quality of the resulting exchange.

## Implemented behaviour

Every two-second admission tick captures the latest pending revision from every
participant. Superseded versions remain in SQLite. The controller serialises the
finite snapshot before preparing another request. Newer revisions remain pending;
acknowledgements refer only to the captured revisions. Legacy submission chunks
retain their per-person order, with one chunk per person in each snapshot.

Typed requests record source revision counters as well as character offsets.
Equal-length edits, shortening and deletion count as changes. Replacement text
is marked explicitly instead of being misrepresented as a new suffix. Older
journals reconstruct revision counters from their existing admissions and request
boundaries. If everyone deletes their text, generation waits for non-empty input.

Live journals now advance through the same validator used for offline replay,
without replaying the entire history on every append. Each append still syncs
before acknowledgement. Failed validation and failed writes cannot change the
last durable in-memory state. Resume and offline inspection still validate the
complete history.

`live.continuationPolicy` is optional and requires `live.mode: "typed"`:

| Value              | Behaviour                                                 |
| ------------------ | --------------------------------------------------------- |
| Absent             | Retain the existing timed refresh/cancellation policy.    |
| `natural-ordinary` | Request approximately 80–120 new words, ending naturally. |
| `natural-short`    | Request approximately 20–35 new words, ending naturally.  |

Both experimental policies queue changed input until natural completion. Pause,
End, timeout and provider failures retain their existing behaviour. Passage
length is a prompt instruction, not an output crop or token limit. Both policies
retain the same cumulative speaking-space guidance. A completed request waits
when no source revision has changed. These settings do not change the default
preset or rewrite saved sessions.

## Reproduce the software load trial

Run from the repository root with local socket access:

```sh
mise exec -- pnpm load-participation --out runs/load-100-new --participants 100 --duration-ms 600000 --schedule burst
mise exec -- pnpm inspect-load-participation runs/load-100-new
```

Choose a new output directory. The load command never loads API credentials or
calls a provider. It uses the production HTTP join and contribution routes,
SQLite queue, journal, controller and deterministic streamed output. The synthetic
texts exercise throughput; they are deliberately unsuitable for judging artistic
quality. `staggered` varies starts and includes periodic pauses. `burst` synchronises
100 continuously active clients at approximately one revision per second.

Text grows towards 4,000 UTF-16 units, including replacements, deletions and exact
retries. An operator pause/resume probe occurs halfway through the load. The test
retains the two-second admission interval, permits five seconds to drain final
input, and records control timings separately. The traffic driver and server run
on one machine; this does not validate physical phones, browser rendering or
venue Wi-Fi. It does not establish real-model latency or quality.

The private directory contains normal session records, `metrics.json` and, for
new runs, a frozen `manifest.json` with configuration and source fingerprints.
The inspection command writes a separate `durability.json` without changing the
original metrics. It refuses to overwrite that report. Reports omit writing and
credentials, but the session directory contains both and remains private.

## Measurements and pass criteria

SQLite `saved_at` is recorded before commit. A journal record's timestamp is
recorded before its write and sync. Subtracting those timestamps is not a durable
admission measurement. The durability inspector instead uses the next journal
record: that record cannot be created before the admission has synced. This
provides a conservative upper bound, which can include unrelated waiting time.
The inspector reports each participant separately and includes superseded
revisions in pending-wait measurements so coalescing cannot hide starvation.

| Measure                                  | Required result                                                    |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Client send to acknowledged response     | 95th percentile ≤1,000 ms                                          |
| Save to durable admission upper bound    | 95th percentile ≤3,000 ms; maximum ≤5,000 ms                       |
| Pending wait, including superseded input | No participant exceeds 5,000 ms                                    |
| Final input                              | All latest revisions admitted within 5,000 ms                      |
| Burst workload offered                   | At least 95% of scheduled unique revision requests attempted       |
| Integrity                                | No missing final acknowledged state or duplicate journal admission |
| Controls                                 | Pause, Resume and End each complete within 5,000 ms                |
| Generation                               | Model-double calls and streamed output actually occur              |

Use `durability.json` for the overall admission decision. Keep failed outcomes.
A passing software trial is not evidence of participant recognition or conversation.

## Real-model comparison: one exploratory pair

Run exactly two serial conditions on one frozen, fictional 100-account schedule:
ordinary natural continuations and short natural continuations. Each receives the
same five minutes of input, including staggered activity and a synchronised burst,
followed by a 30-second observation tail. Each develops its own collective history.
There are no automatic repeats. One pair can identify a useful direction or a
failure; it cannot establish reliability across audiences, material or model runs.

The comparison reuses the production admission queue and live controller through
scripted replay. It does not repeat the HTTP load trial. All 100 accounts remain
eligible throughout. The script cannot respond to the collective writing, so it
measures availability and potential responsiveness, not an actual conversation.

Keep the selected C artistic instructions, model with reasoning off, source
presentation, context allowance, token ceiling and publication interval identical.
Freeze input and configuration fingerprints before dispatch. Never drop
participants to make a prompt fit. Retain failed requests, deadline interruptions
and final unseen input. Do not treat an incomplete run as a successful comparison.

### Prepare and run

Use the authored fixture in `examples/natural-comparison/plan.json`. Preparation
writes both frozen plans and their fingerprints without provider calls:

```sh
mise exec -- pnpm natural-comparison --plan examples/natural-comparison/plan.json --out runs/natural-pair-new --prepare
```

Review the fixture and printed planning estimate. The separate command below
runs the pair with an explicit USD 2.20 cap; this example is not a guarantee that
both runs will fit that amount:

```sh
mise exec -- pnpm natural-comparison --run runs/natural-pair-new --budget-usd 2.20
```

Use a new output directory for each preparation. Read the separate anonymous
reading copy before the condition key and numerical report. The private output
also contains each normal rehearsal journal, arrivals, input snapshots and a
shared usage ledger. Do not publish these directories as participant exports.

### What this pair should tell us

| Question                                        | Evidence and decision                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Did the manipulation work?                      | Compare actual passage lengths and completion reasons. If short passages are not clearly shorter, or either condition routinely truncates, fix the manipulation before interpreting latency.                                                                           |
| Does shorter writing expose fresh input sooner? | Compare save-to-request delay overall and around the shared burst. Inspect pending and superseded revisions, including final unseen input. A reduction of at least 20% and one second in the 95th percentile is a promising exploratory signal, not statistical proof. |
| Does availability become meaningful uptake?     | Link specific source changes to later writing, record delays and non-uptake, and distinguish semantic engagement from a repeated word. Input appearing in a prompt is not evidence of engagement.                                                                      |
| What does the change cost artistically?         | Read anonymised whole trajectories for continuity, development, pauses, repetition, excessive recency and invented shared experience. Retain reviewer disagreement.                                                                                                    |
| What does it cost operationally?                | Compare requests, usage, total words, publication gaps and context growth. Flag word-total differences above 20%; less writing is not automatically an improvement.                                                                                                    |

Read the anonymised trajectories before looking at timing or condition labels.
Review the staggered and burst phases separately, but do not count them as
independent repetitions. Serial order and model variability remain confounds.

If short passages clearly harm the writing, investigate that failure. If they
look promising, repeat the pair with fresh material. If the result is ambiguous,
choose a targeted follow-up based on the uncertainty. Do not expand automatically
to eight runs or select a winner from timing alone.

## Planning cost estimate, 10 November 2026

No real-model comparison has been run for this slice. The previously checked Luna
rates are USD 0.10 per million input tokens and USD 0.50 per million output tokens.
For planning, allow USD 0.125 per million input tokens, with no cache-read savings.
See [official pricing](https://developers.openai.com/api/docs/pricing) and
[the Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna).

| Condition | Runs | Requests per run | Mean input tokens per request | Mean output tokens per request | Estimated USD |
| --------- | ---: | ---------------: | ----------------------------: | -----------------------------: | ------------: |
| Ordinary  |    1 |               50 |                        50,000 |                            160 |        0.3165 |
| Short     |    1 |              125 |                        50,000 |                             50 |        0.7844 |
| Total     |    2 |        175 total |                               |                                |        1.1009 |

At 25,000–100,000 mean input tokens, these assumed request counts cost roughly
USD 0.55–2.20. These are planning scenarios, not measured token or request counts,
and the range is not a guaranteed ceiling. They exclude tax, hosting and paid
review or participant generation. The authored fixture requires no provider calls.

Preparation is offline. The run command requires an explicit budget and uses a
new reservation ledger for this pair; a historical allowance is not reused.
Show the prepared estimate before dispatch. Stop if the next request cannot fit
the budget, retaining incomplete outcomes and any unstarted condition. Actual
usage and trajectory inspection are required before claiming success.

## Observed software trial, 10 November 2026

The ten-minute burst trial is saved in
`runs/admission-load-100-ten-minutes-2026-11-10/`. Its `source-manifest.json`
records the runtime source fingerprints. The original `metrics.json` is retained;
it used admission-event timestamps. The separate `durability.json` supersedes
those latency figures with conservative bounds and participant-level wait checks.

All 60,000 unique revisions and 3,500 exact retries were acknowledged. The trial
made 230 model-double calls and saved 1,257 streamed chunks. All final revisions
were admitted, with no duplicate admissions, missing acknowledged state or HTTP
failures. Every threshold in the durability report passed.

| Measure                                                      | Observed |
| ------------------------------------------------------------ | -------: |
| Send-to-acknowledgement, 95th percentile                     |   368 ms |
| Save-to-durable-admission upper bound, 95th percentile       | 1,496 ms |
| Save-to-durable-admission upper bound, maximum               | 2,469 ms |
| Longest participant pending wait, including superseded edits | 3,491 ms |
| Final drain                                                  | 1,228 ms |
| Operator pause                                               |   229 ms |
| Operator resume                                              |    15 ms |
| Operator end                                                 |    57 ms |

The run included coalescing: 30,015 superseded revisions did not need separate
admission. Per-person pending-wait analysis includes those revisions rather than
silently excluding them. The run proves the specified local HTTP workload with a
streaming double, not model quality, physical-phone capacity or venue networking.

A preliminary 20-batch profile exposed full-history replay on every journal
append: one 100-revision batch grew from about 0.6 seconds to 4.6 seconds. After
incremental validation, the same profile stayed around 0.6–0.8 seconds. This
motivated the journal change; the ten-minute production-path trial supplies the
acceptance evidence.
