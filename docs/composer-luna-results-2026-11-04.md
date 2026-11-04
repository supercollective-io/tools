# Luna composer screen — 4 November 2026

## Decision and scope

Retain Terra for the next controlled composer comparisons. Luna completed the
same requests cheaply and coherently, but its two eight-person trajectories
were consistently more abstract than the paired Terra writing. That could
obscure the effects of source representation. This is a provisional judgement
from fixed scripts, not evidence that participants would fail to feel represented
or in conversation with Luna. Responsive AI-participant experiments remain an
important next source of evidence; human rehearsal tests transfer to the audience.

The original correction-after-withdrawal gate is **superseded**. The creator
clarified during the work that one person's change need not appear in a theatre
performance. We retained the old assessments and reassessed the saved writing
under the [revised criteria](composer-performance-assessment.md). This change
was made after observing outputs; these are not preregistered confirmation
results or a statistical equivalence test. Luna was not rejected for failing
to announce a withdrawn Saturday offer.

## Runs and controls

The original screen produced eight complete trajectories, 40 responses. The
permitted follow-up added two correction trajectories, ten responses. Both
models used reasoning `none`, the unchanged baseline instructions, the same
20% source slices, 4,096-token request ceilings and 120,000 ms timeouts. Each
continued its own saved text. Model order alternated across the first two
repetitions; the additional pair was Luna then Terra.

All 50 requests returned usage and provider finish reason `stop`. All ten
journals ended after five reveals. Every recorded source snapshot verified;
there were no interrupted attempts, hidden retries or altered saved outputs.

- Original attempt:
  `runs/composer-pilot/luna-8187bb58-d934-4063-ae4f-c95b1f8827ca/`.
- Linked follow-up:
  `runs/composer-pilot/luna-c197f8a4-3839-4da5-bfac-f0dda66b1d4d/`.
- Shared usage ledger: `runs/composer-pilot/usage.jsonl`.
- Initial anonymous assessment:
  `runs/composer-pilot/assessment-2a382772-69d8-4443-8170-6da092c2c62c/`.
- Reassessment of all ten newly anonymised trajectories:
  `runs/composer-pilot/performance-review-bb2d0c9e-a7a1-48b4-87ba-0df982b29e45/`.

Each attempt contains `manifest.json`, `<score>-<repetition>-<model>.jsonl`,
matching `-audit.json` files and a separate blinding key. Manifests preserve the
original protocol, exact configurations and source fingerprints. All writing,
review bundles and usage records remain in ignored `runs/`.

## All paired outcomes

The two label columns below are the independent Luna reviewer's **textual
potential** assessments, not reports from participating people or AI voices.
Read them with the primary verification notes below; do not aggregate them into
a quality score. Ratios compare collective words with mean participant words.

| Score                 | Repetition | Model | Words | Ratio | Representation potential | Conversation potential |
| --------------------- | ---------- | ----- | ----- | ----- | ------------------------ | ---------------------- |
| Eight-person          | 1          | Luna  | 145   | 1.029 | Weak                     | Weak                   |
| Eight-person          | 1          | Terra | 152   | 1.079 | Clear                    | Clear                  |
| Eight-person          | 2          | Terra | 146   | 1.036 | Mixed                    | Mixed                  |
| Eight-person          | 2          | Luna  | 150   | 1.065 | Weak                     | Mixed                  |
| Correction diagnostic | 1          | Luna  | 144   | 1.134 | Clear                    | Mixed                  |
| Correction diagnostic | 1          | Terra | 145   | 1.142 | Clear                    | Clear                  |
| Correction diagnostic | 2          | Terra | 142   | 1.118 | Clear                    | Clear                  |
| Correction diagnostic | 2          | Luna  | 139   | 1.094 | Mixed                    | Mixed                  |
| Correction diagnostic | 3          | Luna  | 132   | 1.039 | Mixed                    | Mixed                  |
| Correction diagnostic | 3          | Terra | 143   | 1.126 | Clear                    | Clear                  |

## Source-level reading and reviewer limitations

Both Terra eight-person runs open with the contrast between an unsuccessful bus
petition and a housing co-op's ability to change its contract. Their later
writing names logging off and withholding rent as actions with unequal risks.
Luna's corresponding runs more often speak of participation, decisions, time,
care and information without carrying those particular situations. This is
the main evidence for retaining Terra for now. It is not a requirement that
every person or detail appear, and concrete nouns alone do not prove recognition.

All ten trajectories maintain grammatical continuation and remain close to one
participant's speaking space. Both models can sound procedural: successive
statements about what “we need” or should arrange. This may reflect the fixtures
and instructions as well as the models. It deserves investigation with responsive
AI participants, rather than assuming a declarative style cannot feel conversational.

The initial blind reviewer and primary check agreed that Luna's second
correction run left a recurring opening offer unrepaired. The reviewer cited a
full source statement at request four that only became complete at request five;
the primary check corrected that timing. The third Luna run also leaves the
one-session change implicit. These remain narrow observations, not current
artistic failure criteria.

The fresh anonymous review was useful but made factual errors. It assigned
parents/riders wording from Terra repetition two to repetition one, described
the delivery rider as a bus rider, and claimed Terra correction repetition two
omitted fees and checking revised wording even though additions four and five
include them. The primary assessment rejects those claims. Lists of omitted
details and declarative sentences are not by themselves evidence of failed
representation or conversation. Original reviews remain unchanged beside the
primary corrections in `primary-notes.json`.

Only the independent reviewers were fully blinded. The primary agent saw
labelled aggregate metrics before the first assessment and checked the later
review against known run identities. All judgements here are model assessments;
there were no responsive participant reports in this fixed-script screen.

## Cost, timing and verification

| Model | Requests | Input tokens | Output tokens | Accounted USD | Median request duration |
| ----- | -------- | ------------ | ------------- | ------------- | ----------------------- |
| Luna  | 25       | 36,590       | 4,749         | 0.0060335     | 3,705 ms                |
| Terra | 25       | 36,641       | 2,975         | 0.0515160     | 2,812 ms                |
| Total | 50       | 73,231       | 7,724         | **0.0575495** | —                       |

Accounting uses uncached standard rates: Luna US$0.10/US$0.50 and Terra
US$1/US$5 per million input/output tokens, from
[official pricing](https://developers.openai.com/api/docs/pricing).
It does not assume subscription credits or discounts. Luna cost about 8.5 times
less for these actual responses. The original 40 responses cost US$0.047768;
the follow-up cost US$0.0097815. No unresolved reservations remain. The pilot has
US$4.9424505 of its US$5 allowance available before future reservations.

Durations include client processing and persistence. They are descriptive,
serial observations, not isolated network benchmarks or evidence of better
artistic pacing. The extra repetition uses only the shorter score.

`mise exec -- pnpm run verify` passed: formatting, type checking, **401 tests
across 24 files**, and the build. Loopback test sockets required execution
outside the restricted sandbox. Tests validate the implemented software
behaviour; real calls and saved-outcome inspection provide the provider evidence.

The next slice is a timed replay with a traceable shift in source material.
Its assessment must distinguish availability from influence and leave room for
selection. Keep AI-participant experiential evaluation in the subsequent
confirmation work; do not use this fixed-script screen as a substitute for it.
