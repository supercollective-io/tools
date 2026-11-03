# Rehearsing We rehearsal score

`score.json` contains eight fictional participants answering questions about collective power. These are prewritten rehearsal contributions, not recordings of real people or responses generated during the run. The participants use ordinary spoken language, with concrete experiences, uncertainty and practical limits.

The shared topic is:

> What would it take for us to have a real say over the things we depend on?

The opening invitation is:

> Think of something you depend on but have little say over. Tell us about one decision you wish you could change.

| Participant | Starting experience                                                     |
| ----------- | ----------------------------------------------------------------------- |
| Sam         | Shift rotas announced too late to arrange childcare.                    |
| Leah        | Damp in a rented flat and discovering neighbours have the same problem. |
| Chris       | Evening bus cuts and a consultation heard about too late.               |
| Nadia       | A change to the school club that makes collection harder.               |
| Ben         | Delivery-app pay changes with nobody to discuss them with.              |
| Rosa        | A housing co-op where having a vote does not settle every problem.      |
| Alex        | Care visits changing and responsibility passed between organisations.   |
| Mo          | A library campaign that became hard to follow or influence.             |

Each participant has one continuous prewritten text, with a different length and internal order. These are original demonstration texts, not the user's actual eight source pieces. The writing starts from different places: a proposal about shift rotas, discovering a shared damp problem, a failed bus petition, a successful school-club change, and other everyday experiences. The texts do not follow a shared sequence of themes.

The score uses `schemaVersion: 2` and `chunkPercent: 20`. At each operator advance, the engine admits the next 20% of the characters of **every** participant's text. Five steps reach 20%, 40%, 60%, 80% and 100% of all eight texts. The cuts are mechanical: a slice can start or end in the middle of a word or sentence. Longer texts contribute more characters per step. The engine does not move the boundaries to make complete thoughts or align topics.

`chunkPercent` accepts an integer from 1 to 100. Characters mean Unicode code points, counted with `Array.from`; original whitespace is preserved. A boundary at `p`% of a text of length `N` uses `floor(N * p / 100)`. The final boundary is 100%, so any remainder is admitted. An interval that contributes no characters from any voice is skipped. If only one voice's slice is empty, that voice still appears with an empty-slice label.

The composer receives the newly admitted slices and a bounded window of recent accepted collective passages. It does not receive future source text or the earlier raw slices again. The terminal shows each named slice before the collective passage. The composer must work with partial, uneven material; it should not invent the missing part of a sentence.

These percentages simulate the gradual availability of finite prerecorded contributions. Stage 1 participants do not hear or respond to the collective passage. Later stages will admit rough sequential text as it becomes available. Live participants' final text lengths are unknown, so live admission cannot depend on a percentage of an eventual total.

The contributions include things that worked, failed attempts, practical proposals, disagreement and limits on participation. They are not a representative survey. The source score and composer settings remain separate from application code so other topics can use the same tool.

## Choose a composer

Both configuration files use the same style instructions: plain, spoken British English; speak as part of the group; stay grounded in what people said, including disagreement; avoid slogans and poetic metaphors. The composer's role supplies the synthesis and speaking-space guidance below.

The application adds synthesis instructions to that style prompt. The collective
has the speaking space of one participant: if eight people each offer a sentence,
it should answer with about one sentence of collective speech. It should find a
connection or tension that carries their concerns together, rather than giving
each speaker a sentence or clause. This is a natural-length aim, with no
word-count enforcement. Provider-reported token cutoffs are still rejected as
unfinished responses, leaving the inputs available for retry.

- In `ollama.json`, replace `REPLACE_WITH_INSTALLED_MODEL` with the exact name of a model already installed in your Ollama service. The default service address is `http://127.0.0.1:11434`; add `composer.baseUrl` if your service uses another address.
- In `openai.json`, replace `REPLACE_WITH_CLOUD_MODEL` with a model available to your OpenAI account. Set `OPENAI_API_KEY` in your environment.

Model names must be chosen explicitly. The application does not download models automatically or fall back to another model or provider. Install any local model separately before running the score.

The local example limits output to 256 tokens and explicitly sets `think: false`; remove that setting to use the model's default thinking behaviour. The cloud example allows 1024 output tokens, including any reasoning tokens. Both allow 120 seconds per request and retain up to six previous passages within a 12,000-character history budget. These bounds control context and request size; they do not guarantee an exact passage length.

Keep credentials out of these files, scores and run records. The examples contain no credentials.

Start a new `run` to use this score. Existing logs preserve their original source material and configuration: replaying or rerunning an earlier session will still use its recorded contributions, including the curated fragments in version-1 logs. Existing logs are not resliced using the current score.
