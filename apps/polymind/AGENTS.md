# Agent guidance

Collective Microphone combines many contributions into an evolving collective
voice. It is being developed for participatory performance. The current
implementation provides a browser workspace and retains earlier CLI modes.

## Commands

Run from `apps/polymind`, or use the root `just` recipes. Use `mise exec --` so an older system Node does
not silently replace the pinned runtime. Follow [setup](README.md#set-up) on a
fresh checkout; dependency installation is `mise exec -- pnpm install --frozen-lockfile`.

- Package checks (root CI also checks Match): `mise exec -- pnpm run verify`.
- Focused tests: `mise exec -- pnpm test tests/workspace.test.ts` (substitute the relevant file).
- Run outcome: `mise exec -- pnpm inspect --run runs/<file>.jsonl`.
  Add `--json` for structured output or `--full` for complete saved writing.
  Without `--run`, inspection selects the most recently modified JSONL in `runs/`.

Tests use model doubles, temporary data and loopback HTTP servers. They need
local socket access, not model keys or a running Ollama service. Use focused checks
during iteration and full verification for code or tooling changes. For prose
alone, run `mise exec -- pnpm run check` and check facts, paths and links;
a full runtime suite is unnecessary.

## Contracts that are easy to break

- Live writing saves every streamed prefix; Stage 1 and Stage 2A accept complete
  passages. Keep these different acceptance rules intact.
- Journals are append-only, with one writer per run. Preserve old log readers,
  offline replay, frozen run configuration and interrupted-prefix recovery.
- Keep private participant context out of composer prompts and public browser
  state. Keep credentials and raw provider errors out of saved run data.
- Model selection is explicit: no cloud fallback or hosted tracing. The local
  launcher owns only services it starts. Real model rehearsals are separate
  from automated verification and may download models or incur provider costs.
- Edit browser assets in `src/web/`; the build copies them into `dist/web/`.

## Read according to the task

- Use [CONTRIBUTING.md](CONTRIBUTING.md) to locate the relevant module and tests.
- For scheduling, continuation, publication or controls, use
  [the live guide](docs/live-rehearsal.md).
- For artistic intent or prompts, use [the piece brief](docs/rehearsing-we.md).
- Treat [the roadmap](docs/plan.md), historical stage notes and dated rehearsal
  reports as context, not authorisation to implement later stages or as proof
  that a model behaves the same today.

Inspect saved outcomes before claiming a rehearsal succeeded. Report the run
path, observed result and unresolved failures. Passing mocks checks the covered
software behaviour; artistic quality and real provider behaviour need separate
evidence. Run summaries contain participant writing and are not public exports.
