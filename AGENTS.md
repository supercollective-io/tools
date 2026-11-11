# Working on Supercollective Tools

Use British English and metric units. Python uses pyproject.toml, uv, Ruff, Pyright with nodejs, pytest and root pre-commit hooks. Run root commands through `mise exec -- just`; `just verify` is the local gate, and `just test-browser` checks browser flows. Providers are fake in ordinary tests. Never run a paid rehearsal implicitly.

Polymind's modules are in `apps/polymind/src/session`; continuous voice and legacy readers remain in the adjacent `live-*` modules. Read `apps/polymind/AGENTS.md` for journal, model and privacy invariants. Browser source is `src/web`, never generated `dist/web`.

Keep credentials, raw provider failures and participant content out of public responses, logs, fixtures and commits. Frozen contribution revisions never change retrospectively. Results require explicit publication; matching returns only the requesting participant's released encounter. Names and badges never authenticate anyone.

One server process owns the event database and continuous journals. Preserve interrupted-operation recovery, retry idempotence and source references. Match's Python source, single lockfile and environment are in `packages/match`; Polymind launches its worker directly. Never depend on a sibling checkout in production. Root verification includes Match's lint, types, tests, package build and worker contracts; dependency changes require the Match lockfile to be checked.

Stage inspected paths. Preserve unrelated source changes and private records. Keep migration, dependencies and capabilities in separate lower-case Conventional Commits. Never claim synthetic tests prove human usefulness or venue readiness.


## Choose the workflow

Run commands below from the repository root with `mise exec --`.

| Task | Start here | Completion evidence |
| --- | --- | --- |
| Session, browser or continuous voice changes | [Polymind instructions](apps/polymind/AGENTS.md), then [contributor map](apps/polymind/CONTRIBUTING.md) | Focused tests, root verification; browser changes also need `just test-browser` |
| Matching or worker integration | [Match README](packages/match/README.md) and [worker contract](packages/match/docs/worker.md) | Root verification includes Python and worker contracts; container changes also need the container recipes |
| Prompt or artistic evaluation | [Piece brief](apps/polymind/docs/rehearsing-we.md) and the relevant protocol linked from [Polymind README](apps/polymind/README.md) | Inspect saved outcomes against the protocol; mocks cannot establish model quality |
| Event operation or recovery | [Operations](docs/operations.md) and [backup/restore](docs/ops-backup.md) | Explicit publication review or isolated restore evidence, as applicable |
| Deployment | [Deployment guide](deploy/README.md) | Release checks and authorised staging smoke evidence; preparation alone does not authorise deployment |

## Development loop

- Bootstrap: follow [root setup](README.md#run), then `mise exec -- just doctor`.
  Tests do not require an operator token, provider credentials or a running model.
- Focused TypeScript test: `mise exec -- pnpm --dir apps/polymind test tests/workspace.test.ts`.
- Focused Python test: `mise exec -- uv run --directory packages/match --frozen pytest tests/test_contract.py`.
  Substitute the relevant test file in either command.
- Full gate: `mise exec -- just verify` (also exposed as root `pnpm verify`).
  Package-local verification covers only that package.
- Browser prerequisites: `mise exec -- pnpm --dir apps/polymind exec playwright install chromium`;
  then `mise exec -- just test-browser`. CI installs Chromium system dependencies too.
- For prose-only edits, check facts and local links and run `mise exec -- just check`.
  Update affected guidance when commands or boundaries change.

Use temporary synthetic data for trials. Do not point development servers or
recovery experiments at private event directories. Report skipped checks and
infrastructure failures separately from passing checks.
