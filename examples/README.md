# Demonstration score

`score.json` contains original demonstration writing created for this repository. It does **not** contain the user's actual eight source pieces. Replace it with your authorised source material when preparing a production score.

The eight fictional voices speak about a shared theatre and community hall. Each voice has three short fragments. Six batches admit four fragments each, and every fragment appears exactly once. The order places different needs alongside one another without resolving their disagreements.

## Choose a composer

Both configuration files use the same instructions: write in British English, produce one or two sentences in a collective voice, hold contradictions, preserve dissent and avoid claiming consensus.

- In `ollama.json`, replace `REPLACE_WITH_INSTALLED_MODEL` with the exact name of a model already installed in your Ollama service. The default service address is `http://127.0.0.1:11434`; add `composer.baseUrl` if your service uses another address.
- In `openai.json`, replace `REPLACE_WITH_CLOUD_MODEL` with a model available to your OpenAI account. Set `OPENAI_API_KEY` in your environment.

Model names must be chosen explicitly. The application does not download models automatically or fall back to another model or provider. Install any local model separately before running the score.

The local example limits output to 256 tokens and explicitly sets `think: false`; remove that setting to use the model's default thinking behaviour. The cloud example allows 1024 output tokens, including any reasoning tokens. Both allow 120 seconds per request and retain up to six previous passages within a 12,000-character history budget. These bounds control context and request size; they do not guarantee an exact passage length.

Keep credentials out of these files, scores and run records. The examples contain no credentials.
