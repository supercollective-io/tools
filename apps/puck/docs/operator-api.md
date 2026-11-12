# Room API and instance operators

The standalone participant/host interface, instance operator interface and API
clients share `/api/rooms`. There are no client-specific resource endpoints.

Optional `PUCK_OPERATOR_TOKEN` (a private token of at least 32 characters) enables
instance operator access. Without it, existing room creation, guest identities and
host cookies work as before. The token authorises access to all rooms on this
installation; keep it server-side in API clients.

The `/operator` page signs in using this token. A `?room=<id>` link selects the
intended room; an unknown room does not fall back to another. Operators can create
rooms or explicitly open host controls without joining the participant roster.
No token is placed in the URL. Host access is granted to the current browser through
an HttpOnly cookie, not transferred from an API client's cookie jar.

| Route                                            | Permission and behaviour                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/operator/login`                       | `{token}` establishes an HttpOnly operator cookie                                                                                          |
| `POST /api/operator/logout`                      | Clears that cookie and revokes operator-granted host roles represented by this browser's room cookies; original creator hosts remain hosts |
| `GET /api/rooms`                                 | Operator cookie or Bearer token; lists the 200 most recent rooms with id, title and status                                                 |
| `POST /api/rooms`                                | Existing `{question, options, mode}` creation; ordinary browsers receive the host cookie                                                   |
| `GET /api/rooms/{id}`                            | Existing public/participant view; includes canonical status and participant destination, never operator credentials or control URLs        |
| `POST /api/rooms/{id}/host`                      | Operator cookie or Bearer token; grants host access without changing participant identity or a frozen roster                               |
| `POST /api/rooms/{id}/join`, `/start`, `/cancel` | Existing participant/host authority and lifecycle checks                                                                                   |

All POST requests require the exact configured Origin and JSON content type;
server clients send Origin too. Operator API clients authenticate with
`Authorization: Bearer <PUCK_OPERATOR_TOKEN>`. A browser operator uses the cookie.

An operator may supply `Idempotency-Key` on room creation (16–100 letters, digits,
underscores or hyphens). The operator page uses this same path/header. Repeating
identical settings returns the same room after restart; changing settings returns
409. Keyed creation returns `{id}`; use the explicit host action to control it from
a browser. Unauthenticated ordinary creation retains its established behaviour.

Storage adds `room_creation_requests` and `operator_host_grants` tables without
rewriting recordings. Creation keys commit with their rooms. Host grants persist
across restart and signing out revokes only operator-derived roles for the browser's
present credentials, preserving participant membership and original host authority.
Back up before release; preserve creation records while clients can retry.
