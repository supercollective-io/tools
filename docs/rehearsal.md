# Stage 1 rehearsal

## Before starting

Complete the README setup. Select an installed Ollama model and, for a cloud
comparison, an available OpenAI model and API key. Replace both configuration
placeholders. The example contains eight voices, 24 fragments and six batches.

## Rehearse

1. Run the example score locally. Advance each batch and read each passage aloud.
   Note passages that preserve a disagreement, erase a voice or repeat themselves.
2. Pause after a few batches, then resume the printed run path. Confirm accepted
   passages remain unchanged and the next batch follows the score.
3. Replay the saved run. This must work with the model service stopped and without
   an API key. Replay displays recorded text, not a fresh interpretation.
4. Run the same full score with a cloud configuration. Compare writing, pacing
   and retained tensions. Do not compare exact wording as a correctness test.
5. Change one variable at a time: instructions, history bounds or fragment order.
   Use a new run, or rerun recorded admitted batches with another configuration.
6. Interrupt a generation with Ctrl+C. Resume and retry it. The abandoned partial
   passage must not appear among accepted passages or become subsequent history.

## Record the decision

Record the run paths, model identifiers, the settings you changed and a few
observations about voice, contradiction and continuity. Decide whether scripted
composition is worth developing and what the responsive participants should test.

Stop here for feedback. Stage 2 adds independent AI participants only after this
rehearsal; projection, phone input, speech and Coolify follow later.
