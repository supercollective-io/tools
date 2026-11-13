# Session resource API

The operator interface and authenticated API clients use the same session resources.
Authenticate with the existing operator browser cookie or `Authorization: Bearer`
using `OPERATOR_TOKEN`. POST requires the application's exact Origin and JSON content
type, including for server clients. Foreign origins are rejected.

| Route                             | Behaviour                                                              |
| --------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/operator/sessions`      | List sessions with metadata, status and destinations                   |
| `POST /api/operator/sessions`     | Create with `{title, capacity}`; capacity defaults to 140, range 2–180 |
| `GET /api/operator/sessions/{id}` | Read one session's metadata, status and destinations                   |

The session metadata includes `status` (`writing-open`, `writing-closed`,
`microphone-open`, `closed`), `participantUrl` and `operatorUrl`. The same metadata
is present in the operator state response and used by the operator interface.
These resource responses do not include participant writing, identities or results.
Existing round and publication actions remain separate and explicitly authorised.

An optional `Idempotency-Key` on creation accepts 16–100 letters, digits, underscores
or hyphens. Retrying the same key and effective title/capacity returns the original
session, including after restart. Changed settings with the same key return 409.
The operator interface sends this header and retains interrupted requests/settings
in browser session storage. New requests are explicit if settings have changed.

Storage adds `session_creation_requests` alongside the existing schema. Resource
creation and its request record commit in one immediate transaction. Back up before
release; do not remove these records while clients may still retry. No historical
contributions or publication state are rewritten.
