# Typed phone rehearsal (slice 2)

Run from the repository root:

```sh
mise exec -- pnpm participate
```

The command prints a local operator address, a phone join link and the session
folder. The default is the Luna/C live preset with reasoning off. C is the simplified
artistic prompt selected after the human-recording replay comparison. Model keys stay
in the environment or ignored `.env`. Nothing generates until the operator presses
Start. Use `--config <file>` for another explicit live model configuration.

1. Open the operator address on the Mac. Scan its QR code with phones on the same
   trusted Wi-Fi. The join link also works in a browser.
2. Press Start. People can type before Start or while paused; it remains
   saved and queued until composition resumes.
3. Each phone shows the invitation, their contribution and saving status. Typing
   feeds through automatically, without Send. The collective is on the separate
   projection screen.
4. Use the existing operator Pause, Resume, End and Open projection controls.
   End closes new submissions; an identical retry of an already saved submission
   can still recover its acknowledgement. Start/Resume never reopens an ended run.

The invitation defaults to the agreed question. `--invitation "..."` chooses a
new session's invitation. Reopening a session retains its original invitation,
model and timing configuration.

## Addresses and access

The launcher prefers the Mac's `en0` IPv4 address for phones. When that is not the
right interface, specify it explicitly:

```sh
mise exec -- pnpm participate --origin http://192.168.1.66:3200 --operator-port 3101
```

Substitute the Mac's current LAN address. The participant server listens on port
3200 by default, accepts its configured Host and Origin, and exposes only joining,
contribution updates and the authenticated participant’s own saved text. The separate operator server binds to
127.0.0.1 and checks its Host. No operator controls or source lists are exposed to
phones. This separation implements local operation without adding a remote
operator login. QR joining uses an unguessable session token exchanged for an
HttpOnly, SameSite=Strict, session-scoped cookie; credentials are not sent to the
composer. The token is removed from the browser URL after joining.

This slice uses ordinary HTTP for a trusted local rehearsal network. It does not
provide Internet hosting or HTTPS. Keep the Mac and phones on the same network;
venue client isolation or a firewall may prevent access. Real iOS/Android and
venue-network checks remain necessary. Deployment and speech are later slices.

## Saving, retries and admission

The phone saves its evolving contribution locally on every edit and sends the
latest version once per second, including while the person keeps typing. Text
composition (for example an input method composing a character) completes before
transmission. The text box stays editable during saves and network failures.
There is no Send button or collective output on the phone.

SQLite commits each numbered revision before acknowledging it. The browser keeps
an uncertain revision for automatic retries, then sends any newer local edits.
Reload restores pending work. A conflicting edit in another tab is rejected rather
than silently overwriting it; close the other tab and edit again to continue.
Browser storage must be available for safe retries. Clearing cookies loses the
anonymous identity; clearing local storage loses writing not yet saved remotely.

Admission runs every two seconds, capturing the latest pending revision from
every participant. The controller applies the complete captured snapshot before
preparing another composer request; edits saved during admission wait for the
next tick. The latest revision replaces each person's source text, including edits
and deletions; intermediate queued versions are coalesced. No participant models
are called. The composer sees changes on its next context refresh; already
published collective writing is not retracted. Before the first collective words, at least one participant must have six
whitespace-separated words available. This small opening threshold avoids
generating from an isolated “I”; it is not a semantic completeness check, and
shorter openings wait for more input. Later updates have no minimum word count.
Saving does not guarantee that a contribution will appear in the collective. Paused sessions still save revisions.

The bounds are 100 anonymous identities and 4,000 UTF-16 units of current text per
person. Revision history is retained on disk. These are resource bounds, not a
claim that a 100-person performance has been rehearsed. The existing context guard
pauses composition when capacity is reached. Older explicit submissions remain
readable and their queued slices are admitted before new revisions.

## Reopening and records

```sh
mise exec -- pnpm participate --session runs/typed-SESSION-ID
```

Use the folder printed at creation. Keep the same origin where possible for phone
cookies and browser drafts. Reopening restores saved inputs and the collective,
but always requires explicit Start/Resume. No model work starts automatically.
Pending admission is idempotent across a crash between the journal write and the
SQLite acknowledgement of that write.

The folder contains:

- `participation.sqlite`: anonymous identities, submission IDs, exact submitted
  text, context offsets, timestamps, revision history and the admission queue;
  schema version 2 (automatically upgrades version 1).
- `live.jsonl`: the existing append-only live journal, including participant joins,
  admitted slices and source revisions, exact composer prompts, streamed text, publication and lifecycle.

SQLite uses the pinned Node runtime's built-in driver, WAL and FULL synchronous
mode. This avoids the native driver/ORM migration proposed in the earlier roadmap.
One process owns the journal and database. Existing scripted/simulated runs and
JSONL replay remain compatible. For a simple consistent backup, stop the session
server and copy the entire session folder; do not copy only a live SQLite main
file while ignoring its WAL. These files contain participant writing and join
credentials; they remain in ignored `runs/`, not public exports.

Inspect the collective offline:

```sh
mise exec -- pnpm inspect --run runs/typed-SESSION-ID/live.jsonl
```

The live journal includes admitted input. Acknowledged input still waiting in the
queue is retained in SQLite; journal inspection alone does not show that queue.

## Verification and rehearsal

Automated checks cover eight independent clients, no generation before Start,
participant-scoped deduplication, Unicode slicing, complete admission snapshots, reply
context, closed-session rejection, acknowledgement after closure, sanitised save
failures and recovery across the SQLite/journal boundary. They use model doubles.

Browser rehearsal uses fictional input, not recruited human participants. The
next operator rehearsal should use 5–10 actual people: check QR joining on their
phones, saved acknowledgements and replies after the collective develops. Ask
about particular moments of recognition and disagreement. Working transport does
not establish that the artistic exchange succeeds.

Earlier Send-based browser evidence, 6 November 2026 (before continuous typing): the fictional exchange in
`runs/typed-slice-2-rehearsal/live.jsonl` used one browser participant and two
submissions. Both were committed and admitted once; their captured context offsets
were 0 and 112. The collective developed after the second submission. The saved
journal contains 263 published collective characters, no failure or unfinished
attempt, and an explicit operator pause. A 390 × 844 viewport check covered the
phone layout, and reload preserved an unsent draft. This was not a physical-phone
or multi-human rehearsal. Full verification passed 481 tests across 36 files,
type checking and build.


## Admission load experiments

Use [the 100-participant experiment](live-scale-experiment.md) for the model-double
load command, durability measurements and the planned natural-continuation comparison.
Revision tracking detects equal-length edits, shortened accounts and deletions.
When everyone has deleted their text, the composer waits for non-empty input;
the deletions remain saved and available to the next request. No empty-source
request is generated merely to acknowledge deletion.
