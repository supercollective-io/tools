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

Each participant has three contributions. Six batches admit four contributions each; every contribution appears exactly once. This score introduces everyone's first fragment before anyone's second, then introduces the third fragments. The composer never sees future fragments or a participant's complete source text. Previous raw fragments are not resent; recent collective passages provide continuity. The engine follows the batch order in the score, so other scores can choose a different sequence.

The score moves through three invitations:

1. **Batches 1–2 — experience:** the opening invitation above.
2. **Batches 3–4 — acting together:** what have people tried, or what might they do together? What could make a difference, and what gets in the way?
3. **Batches 5–6 — terms of participation:** what would you need before joining in or letting someone act for you? Who should decide, do the work and account for the result?

These invitations explain how the fixed material was written. Stage 1 admits the next batch when the operator advances it; the scripted participants do not hear or respond to the collective passage. The composer receives only the admitted contributions and its configured recent history. The CLI shows the overall topic and named inputs; these rehearsal notes explain the progression.

The contributions include things that worked, failed attempts, practical proposals, disagreement and limits on participation. They are not a representative survey, and each participant has more than one concern. The source score and composer settings remain separate from application code so other topics can use the same tool.

## Choose a composer

Both configuration files use the same instructions: write one or two sentences in plain, spoken British English; keep concrete experiences, proposals and limits; preserve disagreement; let new input move the conversation on; avoid poetic metaphors, slogans and detached commentary.

- In `ollama.json`, replace `REPLACE_WITH_INSTALLED_MODEL` with the exact name of a model already installed in your Ollama service. The default service address is `http://127.0.0.1:11434`; add `composer.baseUrl` if your service uses another address.
- In `openai.json`, replace `REPLACE_WITH_CLOUD_MODEL` with a model available to your OpenAI account. Set `OPENAI_API_KEY` in your environment.

Model names must be chosen explicitly. The application does not download models automatically or fall back to another model or provider. Install any local model separately before running the score.

The local example limits output to 256 tokens and explicitly sets `think: false`; remove that setting to use the model's default thinking behaviour. The cloud example allows 1024 output tokens, including any reasoning tokens. Both allow 120 seconds per request and retain up to six previous passages within a 12,000-character history budget. These bounds control context and request size; they do not guarantee an exact passage length.

Keep credentials out of these files, scores and run records. The examples contain no credentials.

Start a new `run` to use this score. Existing logs preserve their original source material and configuration: replaying or rerunning an earlier hall session will still use its recorded hall contributions.
