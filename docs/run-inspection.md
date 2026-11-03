# Inspect a saved run

## Read an outcome

After [repository setup](../README.md#set-up), run these commands from the root:

```sh
# Most recently modified JSONL in runs/; prints the chosen absolute path.
mise exec -- pnpm inspect

# Use an actual saved path for reproducible inspection or comparison.
mise exec -- pnpm inspect --run runs/session.jsonl
mise exec -- pnpm inspect --run runs/session.jsonl --json
mise exec -- pnpm inspect --run runs/session.jsonl --full
```

`--json --full` combines structured output with complete writing. The equivalent
CLI is `pnpm cli inspect`; after building, use
`mise exec -- node dist/cli.js inspect --run runs/session.jsonl --json`.
The `pnpm inspect` shortcut does not load `.env`.

Inspection uses the existing journal validators for current live, scripted,
round-based simulation and historical bounded-turn runs. It neither acquires a
writer lock nor resumes, repairs or writes a journal. It needs no credentials,
Ollama service or external network access. It does read and validate the whole
journal internally; the output is focused, not a streaming index for huge logs.

## Interpret the result

The summary shows identity, model names, last recorded status, progress,
outstanding attempts, recent failure history and saved writing. Read the
collective text alongside participant text to assess composition. For long
writing, use `--full` before making claims about omitted passages.

| Field                                   | Meaning                                                                                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`                         | Summary format version, currently `1`; independent of journal/config versions.                                                                                                   |
| `path`, `runId`, `kind`, `mode`         | Exact source and interpretation of the run.                                                                                                                                      |
| `recordedStatus`                        | Last durable status. Historical formats use `completed` or `incomplete`.                                                                                                         |
| `createdAt`, `updatedAt`, `recordCount` | First/last validated event timestamps and record count; timestamps are UTC ISO strings.                                                                                          |
| `models`                                | Configured provider/model names. Frozen-response simulation reruns do not call the participant model.                                                                            |
| `progress`                              | Accepted scripted steps, completed simulation rounds, composed fixed-source steps, live publications, or historical accepted passages. `total: null` means no fixed denominator. |
| `timing`                                | Live recorded active time and configured ceiling in milliseconds; `null` for other formats. Fixed-source runs can finish before the ceiling.                                     |
| `collective`                            | Saved live text or accepted historical passages; includes character count and excerpt flag. Live `publishedCharacters` distinguishes the published prefix from its saved suffix. |
| `participants`                          | Saved/admitted text by participant, including character counts and excerpt flags. Scripted inspection omits future source input.                                                 |
| `outstandingAttempts`                   | Recorded generation starts without a corresponding finish/recovery.                                                                                                              |
| `pending`                               | Recorded pause reason, unpublished writing, unfinished input or absent completion/end events. These are observations, not automatic repair instructions.                         |
| `failures`                              | Total explicit failure/interruption records and the last five details. Earlier failures remain visible after successful retry.                                                   |
| `incompleteTailBytes`                   | Ignored incomplete final JSONL fragment, in bytes. No repair occurs.                                                                                                             |
| `warnings`                              | Snapshot limitations and incomplete-tail notice.                                                                                                                                 |

An ended fixed-source session can still have uncomposed steps. Those steps are
reported in `pending`, but the ended session cannot be resumed. A
`session.recovered` event counts as one session-level interruption in `failures`,
even after later writing succeeds; it is not a per-writer failure count.

Default text and JSON contain up to 1200 source characters of collective writing
and 240 per participant, taking the beginning and end when truncated. `[…]`
marks the omitted middle; `truncated` is explicit in JSON. `--full` removes
writing limits but retains the five-record recent failure window. Character
counts use Unicode code points, not bytes or JavaScript UTF-16 offsets. Historical
passages, simulation responses and bounded turns are separated by two newlines
in the display; those separators are included in the displayed character count.

Private starting context, prompts, provider endpoints and configuration secrets
are not projected into the summary. Participant and collective writing still
belong to the local rehearsal: this command is not a public-data export.

## Verification and limits

Exit code `0` means inspection succeeded, including when the run is paused,
incomplete or contains recoverable historical failures. Invalid options,
missing files, unsupported formats or corrupt complete records exit with `1`.
An incomplete final fragment is reported while validated earlier records remain
readable. Inspection success does not mean a successful rehearsal.

A `running` journal may belong to a live process or an interrupted process;
offline inspection does not distinguish them. Active time stops at the latest
recorded event, rather than advancing with the inspection clock. A concurrent
writer may append after this snapshot. Inspect again for a later snapshot;
use normal controls or recovery procedures when a state change is intended.

For a focused agent assessment, report:

1. The exact run path, mode and recorded status.
2. What the collective produced and how it relates to the participant writing.
3. Progress, pending work and unresolved failures, distinguishing history from
   the final state.
4. Whether the conclusion comes from stored text, deterministic tests or a new
   real-provider rehearsal. None alone establishes artistic quality.

Use `pnpm cli replay --run <path>` for the chronological rehearsal view. The
separate `src/probe.ts` performs live inference measurements; it is not an
offline inspection tool.
