# Stage 1 rehearsal

See the [3 November local rehearsal results](rehearsal-2026-11-03.md) for the
natural speaking-space check, saved run references and observed limitations.

## Before starting

Complete the README setup. Select an installed Ollama model and, for a cloud
comparison, an available OpenAI model and API key. Replace both configuration
placeholders. The example contains eight continuous texts and uses
`chunkPercent: 20`: five percentage steps, each admitting the next 20% of every
participant's text.

The topic is **what would it take for us to have a real say over the things we
depend on?** Read the [participant texts and score guide](../examples/README.md).
The texts have different lengths and internal sequences. Their boundaries are
mechanical character cuts, including cuts inside words or sentences; steps have
no shared theme. The contributions are fictional and prewritten throughout.

## Rehearse

1. Run the example score locally. Advance each percentage step and read each
   passage aloud.
   Compare the named `INPUTS` with the generated `COLLECTIVE` passage. Note
   passages that preserve a disagreement, erase a voice or repeat themselves.
2. Pause after a few steps, then resume the printed run path. Confirm accepted
   passages remain unchanged and the next step continues every source text
   from its saved character position.
3. Replay the saved run. This must work with the model service stopped and without
   an API key. Replay shows the recorded inputs and collective text together;
   pending inputs are labelled separately from accepted output.
4. Run the same full score with a cloud configuration. Compare writing, pacing
   and retained tensions. Do not compare exact wording as a correctness test.
5. Change one variable at a time: instructions, history bounds or `chunkPercent`.
   Use a new run, or rerun recorded admitted steps with another configuration.
6. Interrupt a generation with Ctrl+C. Resume and retry it. The abandoned partial
   passage must not appear among accepted passages or become subsequent history.
7. Verify all five steps together: each named participant's admitted slices must
   reconstruct their complete source text in order. Confirm the composer receives
   only the new slices and bounded recent collective history. Test replay with
   an existing version-1 log too; its recorded fragments must remain unchanged.

## Record the decision

Before handing a composition change back for artistic rehearsal, run the whole
score with the actual local configuration. Read every accepted passage alongside
its inputs. Check that the collective speaks about as much as one individual,
connects concerns rather than concatenating them, and develops across the run.
Reject generic repetition and invented connections between different people's
experiences. Mocked tests alone cannot establish these properties.

The automated acceptance checks reject provider-reported token cutoffs. Confirm that rejected output never becomes
accepted history, and that a retry keeps the same inputs. These checks protect against accepting
known-incomplete responses; they do not judge length, quality or faithfulness.
Judge the amount of speaking over whole runs, rather than imposing a hard word
limit on individual passages.

Record the run paths, model identifiers, the settings you changed and a few
observations about voice, contradiction and continuity. Decide whether scripted
composition is worth developing and what the responsive participants should test.

Stop here for feedback. Stage 2 adds independent AI participants only after this
rehearsal; projection, phone input, speech and Coolify follow later. Percentages
simulate prerecorded finite texts. Later stages will admit rough sequential text
as it becomes available, without assuming known final lengths or waiting for
complete thematic thoughts. Live participation is not implemented in Stage 1.

The [Rehearsing We design notes](rehearsing-we.md) explain the topic criteria and
possible later invitations. The current example uses the selected topic and a
plain-language composer instruction. Start a new run for this material; replay
and rerun preserve the source contributions of the selected existing session.
