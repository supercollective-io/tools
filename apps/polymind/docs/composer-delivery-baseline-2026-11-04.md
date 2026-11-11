# Timed composer baseline — 4 November 2026

## Result

The timed measurement chain reconciles. Four original voices received all five
20% reveals, all five composer requests completed, and every saved collective
character was eventually published. No future source text reached a request.
This completes the instrumentation baseline and permits the controlled delivery
comparison. It does not establish superiority of the current delivery method.

Run: `runs/composer-pilot/timed-ca875476-6c81-4d8c-a1c6-c629950af642/`.
The directory contains `frozen-inputs.json`, `run.jsonl`, `experiment.jsonl`,
`composer-audit.json` and `measurement-check.json`. The frozen manifest includes
the protocol, exact configuration, source events and fingerprints. Writing
remains in ignored `runs/`; the ordinary composer inspection command reads the
unchanged live journal.

## Conditions and measurements

At the creator's request, the fixture uses unchanged Chris, Rosa, Alex and Mo
text from `examples/score.json`. It preserves their original five source slices
and reveals each group at 0, 4,000, 8,000, 12,000 and 16,000 ms. It runs for
24,000 ms. The separately drafted belonging fixture was not used. Four voices
suffice to exercise this timing chain, but this is not directly equivalent to
the earlier eight-person screen or a capacity test.

Terra used the unchanged baseline instructions, reasoning `none`, 4,096 output
tokens and 120,000 ms timeout. The existing continuous controller used a 2,000 ms
refresh interval and 500 ms publication interval. Participant streams were
deterministic source replay, not model generations or responsive participants.

| Request | Supplied after clock start | First saved text after request | Finish | Words appended |
| ------- | -------------------------- | ------------------------------ | ------ | -------------- |
| 1       | 2,126 ms                   | 2,034 ms                       | EOS    | 30             |
| 2       | 4,888 ms                   | 4,324 ms                       | EOS    | 27             |
| 3       | 9,575 ms                   | 1,781 ms                       | EOS    | 26             |
| 4       | 12,037 ms                  | 3,659 ms                       | EOS    | 27             |
| 5       | 16,032 ms                  | 1,297 ms                       | EOS    | 30             |

All 20 arrival events were recorded in stable fixture order; scheduling jitter
was 0–1 ms. Exact participant text reconstructed from the live journal matches
the original selected source text. Supplied source offsets and prefixes verify.
Raw composer fragments concatenate to the same 812 UTF-16 characters saved in
the journal. Twelve publication events culminate at offset 812. The collective
has 140 words against a mean participant contribution of 138.5 words: 1.011×.
These are technical measurements and descriptive proportions, not participant
experience ratings or isolated network latency measurements.

## One traceable later connection

Chris's fifth source event, UTF-16 span `[616, 770)`, arrived at
`15:55:59.361 UTC`. It includes wanting figures that can be questioned and not
being dismissed as unconstructive for being angry. Request five supplied that
source at `15:55:59.384 UTC`.

The addition connects figures and understandable accounts, then says that being
angry about a decision should not mean being dismissed as unconstructive. The
complete relevant sentence was published at `15:56:01.754 UTC`, 2,393 ms after
the recorded arrival. Rosa's accounts also supply part of this connection. This
is an inspected relationship between source and output, not an inference from
transport acknowledgement or proof of a participant's felt experience.

The run does not explicitly carry every late detail, including Alex's mother's
own say. Record that selection without treating it as an automatic failure.
Responsive participant evaluation can investigate how such choices affect the
two experiential goals.

## Limitations and next comparison

There were **no composer cancellations** in this run. Some source arrived before
the current request's first text; the controller's existing starvation guard
allowed generation to begin, and these short responses ended naturally before
the refresh interval could cancel them. This run therefore does not test the
quality of an interrupted join or show that cancellation is unnecessary.

The Chat adapter does not expose native steering acknowledgement or item
boundaries. Those fields are unobserved here. The next slice must explicitly
probe arrival before output, during output and after completion on a common
transport, retaining this run as the existing-adapter reference. Compare complete
writing and continuity; an individual change need not be explicitly acknowledged.

## Cost and verification

The five requests cost **US$0.009085**, using provider-reported usage at uncached
rates. All usage settled; no aborted-request reservations remain. Total pilot
accounting is **US$0.0666345**, leaving US$4.9333655 before future reservations.

Full verification passed before the trial: **404 tests across 25 files**, type
checking, formatting and the build. Focused tests cover original-slice parity,
arrival ordering, exclusion of future text, exact prefixes through participant
refresh and inspectable provider failure. Source-level review fixed a replay
cursor bug before paid execution. The real trial and saved-outcome checks
provide separate evidence from those deterministic tests.
