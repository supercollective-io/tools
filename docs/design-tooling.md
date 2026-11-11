# Design tooling

The two skills are installed in the repository's `.agents/skills/` directory.
Use them through the [UI workflow](ui-design.md). They add no application runtime
dependencies and are not installed globally.

## Pinned sources

| Skill | Upstream revision | Installed source |
| --- | --- | --- |
| Impeccable 4.8.2 | `b4bff1626c344067788c2679f048a20057c7cc5a` | [Skill and playbooks](../.agents/skills/impeccable/SKILL.md), from `pbakaus/impeccable` at `.agents/skills/impeccable` |
| Vercel web-design-guidelines 1.0.0 | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | [Review skill](../.agents/skills/web-design-guidelines/SKILL.md), from `vercel-labs/agent-skills` at `skills/web-design-guidelines` |

[The installation manifest](../.agents/design-skills.lock.json) records source
revisions and SHA-256 hashes of installed files. Upstream skill contents are
unchanged; the shell launcher's executable bit is restored after archive extraction.
Impeccable's Apache-2.0 licence is included. Vercel's upstream README declares MIT;
that README is retained because this revision has no standalone licence file.

Codex discovers repository skills from `.agents/skills` from the working directory
up to the repository root; see [official skill discovery documentation](https://learn.chatgpt.com/docs/build-skills).
The skills should be available on the next turn. If the selector has not refreshed,
restart Codex. Direct links above also let an agent read the installed instructions.

## Impeccable context loader

From the repository root, run once at the start of an Impeccable design session,
substituting the actual target source file or route:

```sh
IMPECCABLE_HOME="$PWD/test-results/impeccable-cache" \
  sh .agents/skills/impeccable/scripts/impeccable context \
  --target apps/puck/src/routes/+page.svelte
```

Keep that `IMPECCABLE_HOME` prefix for subsequent launcher commands. This places
the engine cache in the ignored repository `test-results` directory. The launcher
downloads engine version `0.1.22` on first use and verifies it against its bundled
checksum manifest. First use needs network access; ordinary cached context loading
works without downloading the engine again. No hooks or live browser overlay are
enabled by this installation.

If context loading fails, follow the skill's documented fallback: read existing
project context and the relevant playbooks directly. Missing `PRODUCT.md` or
`DESIGN.md` is not permission to invent a brief or replace the existing UI identity.
Use the task brief and app-specific sources in the local workflow. If durable
Impeccable context documents are later created, link the task's decisions there
instead of maintaining contradictory copies.

## Vercel source review

Ask the agent to use `$web-design-guidelines` with explicit source paths, for example
`apps/hub/public/index.html` and `apps/hub/public/style.css`. The skill fetches
`command.md` from `vercel-labs/web-interface-guidelines` for each review. Record the
resolved guideline revision (or retrieved content hash) in the task evidence:
pinning the skill does not pin this separate, changing ruleset.

If fetching fails, report the audit as unavailable or explicitly identify a saved
version used for an offline review. Do not present remembered rules as a completed
current-guideline audit. Source findings supplement browser inspection and the
[independent critic prompt](ui-design-critic.md).

## Browser evidence

Run `mise exec -- just test-browser-puck` for Puck. Its existing round tests now save
successful-state PNGs as Playwright attachments under `apps/puck/test-results/`:
desktop room readiness and replay, and mobile creation, keyboard input and invitation.
These use disposable synthetic data. Open the PNGs for visual review and copy the
relevant evidence before another test run clears the output directory. They are
review artefacts, not pixel-diff baselines or an aesthetic score.

Hub and Polymind retain their existing screenshot flows; see the
[workflow's command table](ui-design.md#4-build-and-inspect).

## Updating

Resolve the desired upstream commit and install into a temporary directory using
the skill-installer helper with explicit `--repo`, `--ref`, `--path` and `--dest`.
Review the complete diff, references, executable launchers and licence information
before replacing the repository copy. Do not run an unpinned installer over it.
Preserve licence material, regenerate the manifest's file hashes, and update the
source revisions and engine version in this document together.

Check local links and run `mise exec -- just check` for instruction-only updates.
For launcher or browser evidence changes, also smoke-test context loading, run the
affected browser checks and `mise exec -- just verify`. Inspect captured images.
Check skill discovery on the next agent turn; successful file installation alone
does not establish that a client has refreshed its skill catalogue.
