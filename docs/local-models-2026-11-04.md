# Local model shortlist — 4 November 2026

## Recommendation

The subsequent [laptop comparison](composer-comparison-2026-11-04.md#laptop-comparison-gemma-qwen-4b-and-qwen-9b)
tested all three composer candidates. Both Qwen pilots completed but produced
over four times one person's speaking space, with substantive representation
failures. Gemma was paused under memory pressure after four completed requests.
None is promoted as the performance composer. The shortlist below records the
research rationale before those measurements.

Keep `gemma4:12b-mlx` as the local composer incumbent. Compare it with
`qwen3.5:9b-q4_K_M` and `qwen3.5:4b-q4_K_M` on the same fixed score. The 9B model is
the strongest new local challenger that fits the laptop's reported 16 GB
unified memory with plausible single-request headroom. The 4B model is a
smaller speed and memory comparison. Use `qwen3.5:2b-q4_K_M` only as an optional
synthetic-participant fixture; keep `qwen2.5:3b-instruct-q4_K_M` as the known
concurrency fixture until the replacement has passed a local smoke check.

Do not change the composer default on catalogue or general benchmark evidence.
The current run reports show that the local composer choices have not passed
the performance's tests for proportion and faithful representation.

## Candidate shortlist

Ollama reports model artefact sizes, not total process memory. The artefact
column below is download size. Context cache, runtime buffers, macOS, the
browser and other applications also use the laptop's unified memory. Treat
headroom descriptions as estimates until measured on the laptop at the chosen
context and concurrency.

| Role                          | Exact Ollama ID     | Published artefact size                                 | Fit and reason to test                                                                                                                                                                                   |
| ----------------------------- | ------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composer incumbent            | `gemma4:12b-mlx`    | 7.7 GB MLX package; the Ollama Q4_K_M package is 8.0 GB | Already installed and exercised locally. Use it as the same-family incumbent; existing reports show useful connections but inconsistent speaking-space results. It is a serial choice in this workspace. |
| Composer challenger           | `qwen3.5:9b-q4_K_M` | 6.6 GB                                                  | Best first new challenger. Its weights are about 8.95B parameters. One 8,192-token request should leave more room than the incumbent, but actual memory and latency are unmeasured on this M1 Pro.       |
| Composer challenger           | `qwen3.5:4b-q4_K_M` | 3.3 GB                                                  | Smaller comparison with more expected memory and throughput headroom. It may lose synthesis quality; the model card's general benchmarks cannot settle that question.                                    |
| Synthetic participant fixture | `qwen3.5:2b-q4_K_M` | 1.9 GB                                                  | Optional variation for development scenarios. Eight synthetic voices do not need performance-quality writing. Test nine-slot memory and throughput before replacing the existing 3B fixture.             |

Ollama's catalogue currently lists Qwen 3.8 as a 27B family, with a Q4_K_M
artefact of about 18 GB. That is larger than the laptop's reported 16 GB before
context or macOS, so it is not a local candidate here. This shortlist uses the
smaller Qwen 3.5 releases rather than treating the newest family name as an
automatic fit. [Qwen 3.8 Ollama catalogue](https://ollama.com/library/qwen3.8),
[Qwen 3.8 tags](https://ollama.com/library/qwen3.8/tags).

## Evidence and limits

Qwen's official 4B model card reports 4B parameters, a 262,144-token native
context, and a hybrid Gated DeltaNet / gated-attention architecture. It lists
Qwen 3.5 9B and 4B scores including IFEval 91.5 and 89.8, LongBench v2 55.2
and 50.0, and MultiChallenge 54.5 and 49.0 respectively. These vendor-reported
results support testing both sizes; they do not assess this piece's spoken
voice, disagreement, correction, proportion or invented consensus. The 4B
card also documents use with Ollama-compatible quantisations.
[Qwen 3.5 4B model card](https://huggingface.co/Qwen/Qwen3.5-4B),
[Ollama Qwen 3.5 tags](https://ollama.com/library/qwen3.5/tags).

The installed Gemma package is a relevant comparison because it already runs
on this laptop. The official Gemma 4 catalogue identifies the 12B model as
dense, lists its 11.9B-parameter Q4_K_M artefact at 8.0 GB, and lists
`gemma4:12b-mlx` at 7.7 GB. The package can fit as a single-request model, but
that artefact size is not a guarantee that a full 256K context will fit. Keep
the application's 8,192-token request context for the first comparison.
[Gemma 4 Ollama catalogue](https://ollama.com/library/gemma4),
[Gemma 4 tags](https://ollama.com/library/gemma4/tags),
[Gemma 4 12B package](https://ollama.com/library/gemma4:12b).

Do not choose Gemma 4 26B A4B because of its active-parameter count. The
catalogue reports 25.2B total parameters and 3.8B active parameters; its Q4
artefact is 16 GB before context. Active parameters describe computation per
token, not the weights that must be stored. The same caution applies to the
Gemma E2B/E4B effective-parameter labels: the catalogue lists packages from
4.6 GB to 9.5 GB. [Gemma 4 model details](https://ollama.com/library/gemma4).

Ollama documents that concurrent request memory grows with
`OLLAMA_NUM_PARALLEL * OLLAMA_CONTEXT_LENGTH`. Nine writers at 8,192 tokens
therefore reserve up to 73,728 aggregate token positions, plus model weights
and runtime memory. The repository's Qwen 2.5 3B nine-slot probe reported
about 4.8 GB in Ollama, while host swap use was already about 6.5 GB. That is
useful local evidence for the existing fixture, but it does not predict memory
for a different model or a clean-memory laptop. Measure `ollama ps`, memory
pressure and swap for each candidate. [Ollama concurrency FAQ](https://docs.ollama.com/faq#how-does-ollama-handle-concurrent-requests).

## Why Qwen 2.5 3B remains the default

The launcher selects `qwen2.5:3b-instruct-q4_K_M` as its fast local model and
starts an Ollama service it owns on port 11435. The 3B model was selected for
the local development and concurrency demonstration: nine streams produced
first text in 3.82–5.12 seconds in the recorded probe. That supports using it
to exercise streaming and feedback. It does not establish it as the best
composer. The eight-person runs drifted into metaphor or a catalogue, and the
same-input fixed comparison reported repetition, copying and too much
collective text. The separately installed `gemma4:12b-mlx` service on port
11434 is offered for serial modes. These roles explain why the smaller Qwen
remained the quick default after its composition limits were observed.
[Live co-writing audit](live-rehearsal-2026-11-03.md),
[workspace mode rehearsal](workspace-modes-2026-11-03.md).

Synthetic participants are development fixtures, not performance models. The
automated suite uses model doubles; it does not establish that a new local
model produces useful fictional voices, uses less memory, or handles nine
parallel requests. Real local calls are needed to measure those behaviours.

## Local comparison procedure

Use the existing [composer experiment](composer-experiment.md) with
`examples/score.json`. It runs only the composer, freezes each configuration
and input, and saves an inspectable journal. Do not call participant models
for this comparison.

1. Keep the score, instructions, source slices, 8,192-token context and
   request budget identical. Compare `gemma4:12b-mlx`,
   `qwen3.5:9b-q4_K_M`, and `qwen3.5:4b-q4_K_M` in separate runs.
2. The recent local baseline and candidate both hit the 96-token request
   budget. Set the same higher resource budget for every candidate before
   comparing proportion. The budget limits computation; it is not a word
   target. Record any budget-limited finish as inconclusive for natural length.
3. Run each configuration three times with a new output path. Use the
   `compose` command and audit each run with `mise exec -- pnpm inspect --run
   runs/<file>.jsonl --composer`. Keep full journals in ignored `runs/`.
4. Compare the same criteria in every run: time to first saved text, total
   active time, memory and swap, finish reasons, broken or repeated joins,
   whole-run speaking-space ratio, retained disagreements and constraints,
   invented agreement, facilitator behaviour, and response to later
   corrections.
5. Before any nine-slot fixture comparison, measure a short 8,192-token
   request at nine parallel slots. Compare only the existing 3B fixture and
   `qwen3.5:2b-q4_K_M` first. Do not infer parallel capacity from overlapping client
   requests; confirm streamed output overlaps.

The local service and exact model continuation behaviour still need a real
request check. In particular, confirm that each model resumes an unfinished
assistant prefix and appends after a natural stop without copying saved text.
No local laptop measurements of Qwen 3.5, and no model downloads or generation
calls, were made for this report.
