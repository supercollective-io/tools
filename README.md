# Supercollective Tools

Tools for collective understanding, coordination and action. **Polymind** combines event-scoped contributions, bounded analysis, matching and **Collective Microphone**, its continuous collective-voice mode.

For agent task routes and focused checks, start with [AGENTS.md](AGENTS.md).

## Run

Install the versions in `mise.toml`, then:

```sh
mise trust
mise install
mise exec -- just setup
cp .env.example .env
# Set a private OPERATOR_TOKEN of at least 32 characters in .env.
mise exec -- just dev
```

Open `http://127.0.0.1:3000/operator`, sign in and create a session. Open a bounded or continuous round and share its participant entrance. People keep their guest identity across rounds in the same browser; the private recovery code works on another browser. Names and badges are not credentials.

Bounded drafts autosave, but only confirmed contributions enter a frozen snapshot. Matching additionally requires the participant's opt-in. Select an explicit model and input/output budget before starting an operation. Review results before revealing analysis or releasing encounters. Similarity uses embeddings; collaboration retains Match's rubric. Neither is an implemented nemesis detector. Assign verified meeting locations and review seated arrangements and trios before release.

`just dev-voice` retains the original local microphone workspace and CLI behaviour. The session operator also starts continuous voice explicitly; opening or joining an event makes no model calls. One continuous stream runs per process.

Audio recording is enabled only with `TRANSCRIPTION_MODEL` and provider credentials. Participants review and correct transcripts before confirmation. Typed input always remains available. Physical iOS/Android and venue-noise validation is still a release gate.

## Verify and deploy

`mise exec -- just verify` runs checks, types, synthetic tests, packaged-worker contracts and builds. `just test-browser` exercises a production build in Chromium. `just load-polymind 140` measures synthetic HTTP/storage load without provider calls. `just doctor` reports tool and configuration names, never secret values.

Match's Python source, CLI, review tools and experiments live in [`packages/match`](packages/match/README.md). The matching worker uses that package's single lockfile and environment directly; there is no separate worker project or vendored wheel to refresh. Root setup and verification include Polymind, Puck and Match. Python uses uv, Ruff, Pyright and pytest; `mise exec -- just hooks-install` installs the root pre-commit hooks, and `just hooks-check` runs the configured checks across tracked files, for all three packages. Run `mise exec -- just match --help` for the standalone CLI, or `mise exec -- just build-container` followed by `mise exec -- just test-matching-container` to check the production package.

Polymind’s image is defined in [`apps/polymind/Dockerfile`](apps/polymind/Dockerfile). Production import templates are `.env.template` (Polymind) and `.env.sample` (Puck); `.env.example` remains local-only.

See [Coolify settings](deploy/README.md), [implementation status](docs/implementation-status.md) and the [remaining work](IMPLEMENTATION_PLAN.md). Puck lives in [`apps/puck`](apps/puck/README.md) and retains its own server, database and deployment. Run `mise exec -- just dev-puck` (port 3000 by default; use `PORT=3001` alongside Polymind). Root verification and browser checks include both apps. Flight and the Rehearsing We hub remain separate repositories and deployments.
