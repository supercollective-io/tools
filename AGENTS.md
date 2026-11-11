# Working on Supercollective Tools

Use British English and metric units. Python uses pyproject.toml, uv, Ruff, Pyright with nodejs, pytest and root pre-commit hooks. Run root commands through `mise exec -- just`; `just verify` is the local gate, and `just test-browser` checks browser flows. Providers are fake in ordinary tests. Never run a paid rehearsal implicitly.

Polymind's modules are in `apps/polymind/src/session`; continuous voice and legacy readers remain in the adjacent `live-*` modules. Read `apps/polymind/AGENTS.md` for journal, model and privacy invariants. Browser source is `src/web`, never generated `dist/web`.

Keep credentials, raw provider failures and participant content out of public responses, logs, fixtures and commits. Frozen contribution revisions never change retrospectively. Results require explicit publication; matching returns only the requesting participant's released encounter. Names and badges never authenticate anyone.

One server process owns the event database and continuous journals. Preserve interrupted-operation recovery, retry idempotence and source references. Match's Python source, single lockfile and environment are in `packages/match`; Polymind launches its worker directly. Never depend on a sibling checkout in production. Root verification includes Match's lint, types, tests, package build and worker contracts; dependency changes require the Match lockfile to be checked.

Stage inspected paths. Preserve unrelated source changes and private records. Keep migration, dependencies and capabilities in separate lower-case Conventional Commits. Never claim synthetic tests prove human usefulness or venue readiness.
