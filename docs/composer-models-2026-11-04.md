# Composer model selection — 4 November 2026

## Recommendation

The assessment framing was revised after the creator clarified that individual
corrections need not appear in a theatre performance. Use the current
[performance criteria](composer-experiment.md#record-the-judgement). The model
research and observations below remain dated evidence, not a requirement for
explicit uptake of each change.

The [subsequent measured comparison](composer-comparison-2026-11-04.md) now
includes Terra, Sol and Astra High, with three repetitions per prompt and a
correction holdout. It supports using Terra for fast development, with Sol as an
alternative and Astra as the frontier reference. A fresh blind review modestly
preferred the Terra and Sol candidate prompts; retain the baseline as a control
for further comparison. The research and planning assumptions below preceded
those calls.

Start with **GPT-6.1 Terra at `none` reasoning effort** and **GPT-6.1 Sol at
`low` effort**. Terra tests whether fast, inexpensive writing is sufficient;
Sol tests whether additional reasoning improves selection, connections and
coherent development. Both fit the existing OpenAI adapter. These are experimental
candidates, not established artistic winners.

Use Claude Opus 5.5 as a cross-provider quality challenger and Gemini 3.8 Flash
as a cost/latency challenger if the first comparison leaves material failures.
Their continuation semantics need adapter work and testing. Astra is an optional
higher-cost comparison, not the default for every iteration.

For development participants, start with fixed writing and deterministic model
doubles. Use the existing local Qwen when generated variation helps expose a
composer failure. Eight stronger synthetic participants would not improve the
final human-participant deployment directly.
For current laptop candidates and the reason the older Qwen remains a test
fixture, see the [local-model research](local-models-2026-11-04.md).

## What the roles require

These priorities follow from the [piece brief](rehearsing-we.md), current
[live-writing contract](live-rehearsal.md), and the decision that only the
composer will be a model in the performance.

| Priority    | Composer requirement                                                                   | Evidence needed                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Essential   | Make grounded connections while retaining meaningful differences in the material used. | Available sources beside the writing; distinguish selective omission from altered meaning.       |
| Essential   | Develop a coherent spoken contribution with concrete detail and evolving tensions.     | Complete sequence, not isolated attractive passages.                                             |
| Essential   | Take about one person's speaking space without facilitating or enumerating everyone.   | Whole-run proportion and reading aloud; distinguish purposeful recurrence from empty repetition. |
| Essential   | Continue saved text across refreshes, natural stops and interruptions.                 | Real-provider joins and empty/repeated-prefix failures.                                          |
| Essential   | Deliver useful text while the room continues speaking.                                 | First visible text and useful continuation latency at growing input sizes.                       |
| Operational | Supply selected source material within context and cost limits, with provenance.       | Long-duration rehearsals, aggregate usage, cache hits and explicit capacity failures.            |

Synthetic participants serve two purposes: controlled source cases and
responsive rehearsals of the participant experience. For the latter, preserve
distinct perspectives and independent responses, and inspect participants’
assessments alongside the exchange. These can provide strong evidence about
representation and conversation. Control for leading prompts and shared model
bias; human rehearsal tests transfer to the audience.

## Official model and price evidence

Prices are USD per million text tokens for standard synchronous API processing,
checked on 4 November 2026. They exclude tax, audio, tools, cache writes/storage
and faster service tiers. Input prices assume the short-context price band.
Reasoning tokens can add to billed output. Speed descriptions are vendor claims;
none of these sources measures this performance's artistic criteria.

| Candidate / API ID                                | Input / output | Cached input | Selection rationale and limitation                                                                                |
| ------------------------------------------------- | -------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| GPT-6.1 Terra / `gpt-6.1-terra`                   | $1 / $5        | $0.05        | Positioned for efficient, natural writing; `none` reasoning is available. Useful latency baseline.                |
| GPT-6.1 Sol / `gpt-6.1-sol`                       | $2 / $10       | $0.10        | More demanding reasoning/work candidate; supports `low` through `max`, but not `none`.                            |
| GPT-6 Astra / `gpt-6-astra`                       | $10 / $50      | $1           | Higher-cost capability comparison; artistic benefit over cheaper candidates is unproven.                          |
| Claude Opus 5.5 / `claude-opus-5-5`               | $4 / $20       | $0.20        | Quality challenger; adaptive thinking is always enabled. No assistant prefill.                                    |
| Gemini 3.8 Flash / `gemini-3.8-flash`             | $0.75 / $3.75  | $0.075       | Lower-cost challenger. Introductory prices end 31 December 2026.                                                  |
| Gemini 3.1 Pro Preview / `gemini-3.1-pro-preview` | $2 / $12       | $0.20        | Reasoning comparator; preview status adds a deployment-stability concern. Prices rise above 200,000 input tokens. |

OpenAI specifications and prices:
[Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra),
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
[model directory](https://developers.openai.com/api/docs/models),
[pricing](https://developers.openai.com/api/docs/pricing).
Terra and Sol document streaming and Chat Completions support, with
1,050,000-token contexts. Capacity does not prove attention to minority positions.

Anthropic documents a 1,000,000-token context, 128,000-token output ceiling,
effort controls and the lack of assistant-prefill support in the
[Opus 5.5 overview](https://platform.claude.com/docs/en/models/opus-5-5/overview).
Its [pricing](https://platform.claude.com/docs/en/about-claude/pricing) distinguishes
cache writes from reads. Continuation needs provider-specific handling: the
live engine now supplies saved text as data for OpenAI and can use an assistant
prefix for Ollama. A new provider adapter still needs real continuation tests.

Google's [pricing](https://ai.google.dev/gemini-api/docs/pricing) lists the rates
and future change: Flash 3.8 becomes $1.50 input / $7.50 output per million
tokens on 1 January 2027, with $0.15 cached input. Its
[model card](https://deepmind.google/models/model-cards/gemini-3-8-flash/) and
[Pro 3.1 specifications](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview)
describe approximately one-million-token input contexts. Google's native API
and compatibility layer are not exercised by this repository's current tests.

Vendor coding, reasoning and knowledge-work benchmarks justify including a
candidate. They do not establish faithful synthesis of disagreement, natural
speaking space or freedom from facilitator behaviour. No comparable published
measurement for those criteria was found in the reviewed official sources.
The fixed-score comparison must supply that evidence. No numerical latency
ranking across these providers is established here either.

## Cost in this application

The current eight-person score contains 1,127 whitespace-separated words,
averaging 140.875 per person. Character-to-token estimates help planning, but
actual tokenisation and reasoning usage depend on the provider. Request audits
report input characters, not bills.

Historical local journals illustrate why publications must not count as requests:

| Journal                                   | Composer requests | Publications | Sum of prompt-content characters | Rough input tokens at 4 characters/token |
| ----------------------------------------- | ----------------- | ------------ | -------------------------------- | ---------------------------------------- |
| `runs/live-eight-2026-11-03.jsonl`        | 12                | 23           | 57,023                           | 14,256                                   |
| `runs/live-eight-slower-2026-11-03.jsonl` | 5                 | 19           | 45,457                           | 11,364                                   |

These are observed local counts, not cloud invoices. Repeated prompt content is
counted each time. The adapter can receive provider usage, but the live journal
does not persist it as billing evidence. Collect actual provider usage before
reporting measured spend or cache savings.

For a **planning stress case**, assume eight humans each speak continuously at
100 words/min for 30 minutes, one composer speaks at that individual rate, and
English uses about 1.5 tokens/word. This produces 36,000 source tokens and 4,500
collective tokens. Final context is approximately 40,500 tokens before
instructions, JSON framing and duplicated new-text suffixes.

Resending full history every 5 s means 360 requests see an average of roughly
half the final context: about **7.3 million input tokens**. At 10 s, this falls
to about **3.6 million**. These are assumed request cadences, not publication
intervals or a guarantee that inference keeps up. At 5 s, one person's output
share averages only about 8 words per request.

| Model                         | Approximate cost: 7.3M input + 4,500 visible output tokens |
| ----------------------------- | ---------------------------------------------------------- |
| Terra                         | $7.32                                                      |
| Sol                           | $14.65                                                     |
| Astra                         | $73.23                                                     |
| Opus 5.5                      | $29.29                                                     |
| Flash 3.8, introductory rates | $5.49                                                      |
| Pro 3.1 Preview               | $14.65                                                     |

These estimates exclude fixed prompt overhead, hidden reasoning, retries and
cache effects. Human pauses can reduce workload substantially. The current
rehearsal context guards would stop before this 30-minute case; this table does
not claim that the current configuration can run it unchanged.

At fixed request cadence, resending growing history makes cumulative input
scale approximately with the square of session duration. Input dominates visible
output cost in this example. Cache savings require matching prefixes; inserting
new text into earlier participant fields can break reuse for later fields.
See [OpenAI caching](https://developers.openai.com/api/docs/guides/prompt-caching)
and [Google caching](https://ai.google.dev/gemini-api/docs/caching).

## First comparison and spending allowance

Use two models × two instruction variants × three repetitions: 12 fixed-score
runs, 60 requests without retries. Start with **a $5 planning allowance** and
inspect provider usage after the first run of each model. At 4096 completion
tokens per request, using the entire output budget every time costs approximately
$1.84 across 30 Terra and 30 Sol requests, plus input charges. Visible output
should be much smaller. Retries and account charges still need monitoring;
the application does not enforce a dollar ceiling.

Use the same 4096-token request budget for both cloud models so Sol can reason
before producing visible writing. This budget is not a speaking target. Record
`budget` finishes and empty outputs as limitations, not evidence of concision.

Prepared configurations: [Terra](../examples/composer-terra.json),
[Sol](../examples/composer-sol.json) and [Astra High](../examples/composer-astra.json).
All retain baseline instructions. Astra allows 8192 completion tokens to leave
room for high-effort reasoning. Use the
[experiment procedure](composer-experiment.md) to change only the instructions
for the candidate comparison. The linked measured report records real-provider
continuation, latency, usage and source-level writing assessments; human reception
and full-duration performance behaviour remain unverified.
