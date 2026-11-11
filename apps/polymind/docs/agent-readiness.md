# Agent-readiness research and decisions

Reviewed on 2026-11-03. This note records the rationale for repository guidance;
it is not an extra instruction file that agents must read for every task.

## Evidence

The [AGENTS.md format](https://agents.md/) uses ordinary Markdown and supports
root guidance with more local files where a subtree needs different rules.
It avoids requiring a proprietary configuration format. Discovery still depends
on the agent: [Codex documents its own discovery order and size limit](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
including global instructions and the repository-root-to-working-directory
chain. A shared filename does not guarantee identical loading across clients.

OpenAI's [current advice on skills and AGENTS.md](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
recommends pruning stale instructions and linking documents by task, rather than
requiring broad reading before each edit. That is vendor guidance, not proof
that a particular file improves this repository's results.

[OpenAI's customisation guidance](https://learn.chatgpt.com/docs/customization/overview)
distinguishes personal communication preferences in global instructions from
shared codebase rules in repository files. A language convention can be a
project rule, but a personal preference alone is not a reason to copy it into
this repository's AGENTS.md. The project description should state the purpose;
the present browser workspace and rehearsal workflow describe implementation
status, not the limits of that purpose.

Empirical evidence is mixed:

- [Gloaguen et al., _Evaluating AGENTS.md_ (v3)](https://arxiv.org/abs/2602.11988v3)
  found no general improvement in task success and increased inference cost
  across their benchmark settings. Their findings favour non-standard,
  necessary guidance over generic generated repository overviews. The evaluated
  Python repositories, tasks and agent configurations limit generalisation.
- [Lulla et al., _On the Impact of AGENTS.md Files_ (v2)](https://arxiv.org/abs/2601.20404v2)
  found lower median runtime and output-token usage in paired runs across ten
  repositories and 124 tasks. This smaller efficiency study did not establish
  comprehensive semantic correctness. It is a preprint, not evidence that any
  instruction file will improve outcomes.

The practical conclusion here is to minimise always-loaded instructions and
make useful actions executable. Improvements to agent efficiency remain a
hypothesis until measured on this repository.

## Repository findings and changes

| Finding                                                                                              | Focused improvement                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| No root AGENTS.md; a shell can expose an older Node than the pinned toolchain.                       | Add a short entry point with `mise exec --` commands and links to setup.                                     |
| Four checking commands were repeated across CI and README.                                           | Add `pnpm run verify`; CI and documentation use that sequence.                                               |
| Current `live-*` and historical `continuous-*` names can mislead discovery.                          | Explain that distinction in the contributor task map and preserve old readers.                               |
| Roadmap wording implied Svelte tooling and prohibited the launcher's implemented model preparation.  | Correct these statements and identify current versus historical/future documentation.                        |
| Important behaviour crosses storage, scheduling, providers and public state.                         | Keep the non-obvious durability, acceptance and privacy contracts in AGENTS.md.                              |
| Raw journals contain prompts and many streamed events; replay alone does not give a focused outcome. | Add offline `inspect`, bounded text/JSON summaries, explicit run identity, pending work and failure history. |

Package scripts and CI define the executable checks; tests check the behaviours
they cover. Passing those checks does not establish browser rendering, real
provider behaviour or artistic quality. The instructions do
not duplicate Biome rules, TypeScript flags, dependency versions or an exhaustive
file tree. Detailed source navigation belongs in the optional contributor guide.

## Deliberately deferred

- Nested AGENTS.md files: this is one small package; there are no distinct
  subprojects needing separate working rules yet.
- Duplicate CLAUDE.md/Cursor instructions: avoid competing copies without a
  demonstrated client need. Add a thin reference only after verifying that
  client's loading behaviour.
- Repository-specific skills, mandatory plans and automatic commits: current
  workflows do not justify the additional process or always-loaded context.
- Browser-test framework and full environment containers: useful candidates
  when browser regressions or setup failures recur, but larger than this change.
- Automated artistic scoring: a completed run and passing mocks do not measure
  whether the collective voice represents participants well.

## Keep the guidance useful

When a recurring agent mistake appears, first consider an executable check or
clearer API. Add prose when it captures a non-obvious convention or constraint
that code cannot express. Update linked guidance alongside changed commands and
contracts, and remove advice that has become redundant.

Historical plans must not impose old branch choices or authorise automatic
commits on new tasks. Keep those actions governed by the current task's
instructions. The roadmap's previous `main` and automatic-commit instructions
have been removed for that reason.

To evaluate future instruction changes, use the same repository snapshot and
model on representative tasks: a live scheduling fix, a historical replay fix,
a browser edit and a documentation correction. Compare with/without the changed
instruction. Review correctness and omitted checks alongside runtime, token
usage and unnecessary exploration. Repeat runs to account for variability.
No such agent-performance experiment was performed as part of this change;
the validation here checks the commands and implemented behaviour.

A follow-up review added regression coverage for early-ended fixed-source
sessions and recovered live interruptions. Inspection now explicitly reports
uncomposed source steps and retains recovery events in interruption history.
Format detection reads only the opening line through a buffered stream, then
the existing validating reader performs the full journal read. This avoids a
duplicate whole-file read without changing journal validation.
