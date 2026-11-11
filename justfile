set positional-arguments

default:
    @just --list

setup:
    pnpm install --frozen-lockfile
    uv sync --project packages/match --frozen --python 3.12.13
    uv sync --project workers/matching --frozen --python 3.12.13

dev: dev-bounded

dev-bounded:
    pnpm --dir apps/polymind bounded

dev-voice:
    pnpm --dir apps/polymind exec node --env-file-if-exists=../../.env src/start.ts

check:
    pnpm check
    uv run --directory packages/match --frozen ruff check .
    uv run --directory packages/match --frozen ruff format --check .

typecheck:
    pnpm typecheck
    uv run --directory packages/match --frozen pyright

test:
    pnpm test
    uv run --directory packages/match --frozen pytest
    uv run --project workers/matching --frozen --no-dev python -m unittest discover -s workers/matching -p "test_*.py"

build:
    pnpm build
    uv build --project packages/match --out-dir packages/match/dist

# Run Match's standalone CLI from its package directory (including relative examples).
match *args:
    uv run --directory packages/match --frozen match "$@"

# Re-resolve only when matching dependency manifests change; never needed for source edits.
lock-matching:
    uv lock --project packages/match
    uv lock --project workers/matching

build-container:
    docker build --file deploy/Dockerfile --tag polymind:local-candidate .

test-matching-container:
    docker run --rm --network none --entrypoint /app/workers/matching/.venv/bin/python polymind:local-candidate -m unittest discover -s workers/matching -p "test_*.py"

verify: check typecheck test build

# Loopback synthetic data only; this does not contact a model provider.
load-polymind participants="140": build
    pnpm --dir apps/polymind exec node scripts/session-load.mjs "$1"

test-browser: build
    pnpm --dir apps/polymind exec node scripts/session-browser.mjs

doctor:
    node --env-file-if-exists=.env scripts/doctor.mjs

backup source destination:
    node scripts/backup.mjs --source "$1" --target "$2"

restore-check backup:
    node scripts/restore-check.mjs --backup "$1"

release-check:
    node scripts/release-check.mjs

rehearse-models request:
    pnpm --dir apps/polymind exec node --env-file-if-exists=../../.env scripts/rehearse-bounded.mjs "$1"

deploy-staging:
    node --env-file-if-exists=.env scripts/deploy-staging.mjs

smoke-staging origin="https://polymind.supercollective.io":
    node scripts/smoke-staging.mjs "$1"
