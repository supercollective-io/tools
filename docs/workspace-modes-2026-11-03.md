# Workspace modes rehearsal — 3 November 2026

## Scope and setup

Exercised the actual browser workspace with two participants, Chris and Rosa,
using the repository's collective-power topic. Tested installed
`gemma4:12b-mlx` on the existing Ollama service (0.40.14, port 11434) and
`qwen2.5:3b-instruct-q4_K_M` on a launcher-owned service at port 11436.
The alternate port avoided a separately running user rehearsal on 11435.
No cloud calls were made. Both models used an 8192-token context.

The browser now opens before model preparation. Mode, model and participant
count are selected there. Continuous mode retains independent writers;
chunked mode schedules their continuations in sequence; fixed-text mode admits
five 20% slices of the same complete contributions and generates only the
collective. Fixed sessions finish after the final slice, without an elapsed-time
cut-off. Saved sessions can be reopened in the browser.

## Failures found through real generation

The first Gemma fixed run, `c40188e8-2d72-4290-84a2-f2094fbb4e1e.jsonl`,
opened with “nt”. Rosa's admitted text ended “I wouldn”, while the empty composer
was told to continue writing. The model completed a source fragment instead of
beginning its own contribution. Initial prompts now explicitly distinguish
beginning one's own text from continuing somebody else's partial input.

That run also exposed missing spaces at later joins. The installed Gemma chat
renderer closes a supplied assistant message and opens a new model turn; it did
not preserve an unfinished assistant prefix as required. The Gemma preset now
uses Ollama's canonical render-only template followed by raw generation with
the exact saved prefix. Direct checks joined `even` + ` in the same building`
and `organ` + `ising our shifts` correctly. This is a provider-specific path,
not a speculative repair of generated words. Unsupported render-only services
fail explicitly.

The second run, `d22958ca-ce36-4743-aef9-55c9d25a4a4e.jsonl`, had a clean
opening but still completed other source fragments after natural end markers.
Append prompts now put the writer's `existingText` after all source inputs and
explicitly identify it as the only text to continue.

The third run, `f2943fe8-20d9-4c3c-b4a5-e20a64d7b5b3.jsonl`, completed in
67 s with a clean opening and no glued word joins. It produced 245 collective
words, still too much for the intended average individual speaking share.
It also appended dependent clauses after full stops. The append prompt now
requires a capitalised, independent sentence after sentence-ending punctuation,
while retaining exact continuation instructions for unfinished writing.
No saved output from these runs was changed.

The final corrected run, `1c35375c-983d-4f31-a39a-596733bdbfbc.jsonl`,
completed all five slices in 64 s. It began “We're feeling the difference” and
had no mid-word opening, glued joins or dependent-clause starts after full stops.
It produced 278 words against about 142 words per participant on average. The prompt
fixes address the observed boundary bugs; they do not establish reliable
proportion or composition quality across future runs.

## Model comparison

Qwen's same-input fixed run, `be8ac384-6eae-4fad-a9c2-97e5a6aaf4b3.jsonl`,
finished in 26 s. It produced 333 words, copied Rosa's account, addressed Chris
by name and repeated earlier passages. Its speed is useful for exercising
concurrency, but this run did not meet the artistic requirements.

Gemma made more useful connections between direct control, delegated decisions
and access to information. It still flattened some distinctions and used too
much speaking space. Neither model has passed a composition-quality gate.
The prompt gives proportional guidance using average new participant words;
there is no hard word quota, trimming or retrospective rewriting.

## Chunked recovery

The real Gemma session `9d4a9256-5349-44b0-978e-636bfa85a2a0.jsonl`
ran Chris → Rosa → collective, then began the next Chris continuation with
collective version 1. Pausing, returning to New, reopening through Open saved
and resuming preserved every saved prefix. Chris continued `I could` with
` call a taxi`; Rosa then continued her own unfinished text. The scheduler
retained its place and new participant calls received the published collective.
The session was left paused after 100 s of active time.

## Verification

The full suite passed: 365 tests across 19 files. Biome, TypeScript, production
build and whitespace checks passed. Deterministic tests cover serial ordering,
source percentages, participant isolation, saved cursors, crash recovery,
provider cancellation, exact raw prefixes, malformed streams and model-service
ownership. Launcher tests use fake services on ephemeral ports.

Real browser checks cover starting both serial modes, viewing all source text,
ending fixed sessions, and returning to setup. The local journals above remain
in ignored `runs/` for inspection; they are not distributed as fixtures.
