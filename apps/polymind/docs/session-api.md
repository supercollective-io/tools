# Session resource API

The operator interface and authenticated API clients use the same session resources.
Authenticate with the existing operator browser cookie or `Authorization: Bearer`
using `OPERATOR_TOKEN`. POST requires the application's exact Origin and JSON content
type, including for server clients. Foreign origins are rejected.

| Route                                         | Behaviour                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/operator/sessions`                  | List sessions with metadata, status and destinations                   |
| `POST /api/operator/sessions`                 | Create with `{title, capacity}`; capacity defaults to 140, range 2–180 |
| `GET /api/operator/sessions/{id}`             | Read one session's metadata, status and destinations                   |
| `GET /api/operator/sessions/{id}/preparation` | Read the private draft preparation, or `null` when none is saved       |
| `PUT /api/operator/sessions/{id}/preparation` | Save `{mode, prompt, model}` without opening a round or starting work  |

The session metadata includes `status` (`writing-open`, `writing-closed`,
`microphone-open`, `closed`), `participantUrl` and `operatorUrl`. The same metadata
is present in the operator state response and used by the operator interface.
These resource responses do not include participant writing, identities or results.
Existing round and publication actions remain separate and explicitly authorised.

Preparation is private operator state. The strict `model` object contains
`provider` (`openai` or `ollama`), `model` (1–150 characters),
`maxInputCharacters` (1–1,000,000), `maxOutputTokens` (100–16,000) and
`timeoutMs` (1,000–360,000). `mode` is `bounded` or `continuous`; `prompt` is
1–2,000 characters. Reads and writes require operator authentication. PUT also
requires the application's exact Origin and JSON content type.

Saving preparation only stores this draft. It does not create a round, call a
provider, publish a result or change the projection. A draft can be replaced until
the session has a round. After that, an identical PUT is accepted as an interrupted
request retry; a changed draft returns 409. Preparation survives server restarts and
is not included in participant or projection responses.

An optional `Idempotency-Key` on creation accepts 16–100 letters, digits, underscores
or hyphens. Retrying the same key and effective title/capacity returns the original
session, including after restart. Changed settings with the same key return 409.
The operator interface sends this header and retains interrupted requests/settings
in browser session storage. New requests are explicit if settings have changed.

Storage adds `session_creation_requests` alongside the existing schema. Resource
creation and its request record commit in one immediate transaction. Back up before
release; do not remove these records while clients may still retry. No historical
contributions or publication state are rewritten.
