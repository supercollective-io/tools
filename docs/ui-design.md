# UI design workflow

Use this workflow when designing, refining or reviewing Hub, Polymind or Puck.
The target is an interface suited to the people and collective activity it serves.
Visual novelty alone is not evidence of improvement.

## Scale the work

- For a small correction, record the intended behaviour and inspect the affected
  states before and after. A new concept study or separate design document is unnecessary.
- For an extension, preserve established components and visual conventions.
  Record any deliberate departure and its reason.
- For a new surface or substantial redesign, use the six stages below and the
  [brief template](ui-design-brief.md). Keep durable decisions in
  `docs/design/<task-name>.md`; keep temporary screenshots and studies in
  `test-results/design/<task-name>/`. These directories are created as needed.

Keep one implementation owner. Ask for user input where audience, artistic intent
or a major direction is unresolved; continue independent work while awaiting it.
Existing authorisation is sufficient for routine implementation decisions.

## 1. Establish the brief

Record the audience, primary task, setting, real interface copy, available assets,
accessibility needs, cultural context and constraints. Separate known facts from
assumptions. Annotate references with what to borrow and what to avoid. Replace
vague aspirations such as “premium” with observable decisions.

Use synthetic participant content of realistic length. Do not copy private event
writing, credentials or operator links into references, screenshots or prompts.

| Surface | Starting points | Design constraints |
| --- | --- | --- |
| Hub | [Instructions](../apps/hub/AGENTS.md), [guide](../apps/hub/README.md), `apps/hub/public/` | One current invitation; full-page navigation; distinguish participant and private operator views; support putting the phone away. |
| Polymind | [Instructions](../apps/polymind/AGENTS.md), [contributor map](../apps/polymind/CONTRIBUTING.md), `apps/polymind/src/web/` | Writing saves directly into the round and matching; distinguish saving from publication; preserve identity and privacy boundaries; review participant, operator and projection surfaces separately. |
| Puck | [Instructions](../apps/puck/AGENTS.md), [architecture](../apps/puck/docs/architecture.md), `apps/puck/src/routes/`, `apps/puck/src/lib/components/`, `apps/puck/src/app.css` | Preserve server authority, live visibility rules and replay semantics; inspect input, arena and lifecycle states. |

Inspect existing styles and components before proposing a new visual system.
The applications remain independently deployable; shared guidance does not require
a shared runtime component package.

## 2. Compare concepts

For a redesign, render two or three small studies of the same representative task
with the same copy. Vary composition, hierarchy or interaction materially. Colour
variants alone do not count. Include a narrow screen and a demanding content state.

Compare task clarity, fit to context and trade-offs before expanding a study into
the whole interface. Show the alternatives to the user when their preference is
needed. When direction is delegated, select one and record the rationale.

## 3. Record the direction

Save typography, palette, spacing, layout, imagery, motion and component decisions
with their purpose and source locations. Reuse existing tokens where available.
Record what remains intentionally different between participant and operator views.
Avoid adding decoration merely to satisfy a generic aesthetic checklist.

## 4. Build and inspect

Use the app's source files and existing development setup. Use disposable data and
fake providers; a design review does not authorise a paid rehearsal or deployment.

Inspect the running interface at narrow mobile and desktop sizes, scroll the whole
page and exercise the primary task. Include keyboard navigation, visible focus,
labels, contrast, zoom/reflow, reduced motion where relevant, long content, empty
states, loading, errors and recovery. Mark inapplicable states with a reason.
Viewport emulation does not prove physical-phone or venue usability.

Run commands from the repository root:

| Scope | Behaviour checks | Existing visual evidence |
| --- | --- | --- |
| All applications / Polymind UI | `mise exec -- just test-browser` | Polymind writes participant, operator and projection screenshots under `apps/polymind/test-results/`. This recipe also runs Puck and Hub checks. |
| Puck UI | `mise exec -- just test-browser-puck` | Successful desktop room/replay and mobile creation/keyboard/invitation captures are attached to tests under `apps/puck/test-results/`. Failure screenshots and traces remain enabled. |
| Hub UI | `mise exec -- just test-browser-hub` | The smoke script prints its screenshot directory under the system temporary directory. |
| Implemented UI changes | `mise exec -- just verify` | Lint, types, synthetic tests and builds; these do not judge visual quality. |

Browser setup is documented in [root instructions](../AGENTS.md#development-loop).
Existing screenshots cover particular test states, not every changed surface.
Open the images and inspect them; a successful screenshot command is not a review.
Record viewport, state, source revision or patch and reproduction steps. Copy useful
baseline evidence into the task directory before a rerun overwrites it.

## 5. Critique independently

Use the [critic prompt](ui-design-critic.md) with the brief, annotated references,
rendered evidence and a disposable running interface when available. For substantial
UI changes, delegate one read-only critique to a separate agent when the platform
permits it, or use an independent human reviewer. Give the reviewer the brief and
evidence, and keep implementation with its existing owner. If neither is available,
perform a separate self-review and label the independence gap. Use the session's
existing model settings; this workflow does not authorise paid external model calls.

Evaluate appropriateness, hierarchy, distinctiveness, content and usability
separately. Require findings tied to a region or reproducible interaction, with
the consequential problems first. Source-only audits supplement rendered review.

## 6. Revise and retain the best result

Default to at most two critique/revision cycles. Fix task blockers first. Record
accepted and rejected findings with reasons; reconcile contradictory feedback
against the brief. Keep screenshots and a recoverable source patch or version for
each candidate. Do not revert unrelated work to restore a preferred candidate.

Stop when the budget is exhausted or another cycle yields no meaningful improvement.
Retain the best inspected version, which need not be the latest. Report unresolved
problems and failed or skipped checks. Blocking interaction defects remain defects
even when the aesthetic iteration budget is exhausted.

## Installed design skills

The repository vendors [Impeccable](../.agents/skills/impeccable/SKILL.md) as its
primary design layer and [web-design-guidelines](../.agents/skills/web-design-guidelines/SKILL.md)
for complementary source review. Read the relevant skill when starting UI work.
See [installation and provenance](design-tooling.md) for pinned revisions,
context-loader setup, update instructions and network requirements.

Use `$impeccable shape <surface>` for substantial planning, `$impeccable critique
<surface>` for rendered review and `$impeccable polish <surface>` for a scoped
finishing pass. Use `$web-design-guidelines <files>` to audit the affected source.
These are agent prompts, not shell commands. Supply the brief and app source paths
in each request. Keep the local two-cycle budget and one implementation owner;
use the critic prompt for an independent reviewer on substantial UI work.

The brief and repository boundaries govern how skills are applied. Use one primary
aesthetic layer per task. Keep existing components for refinements and treat
upstream style preferences as subordinate to the approved direction.

Use [Signs of AI Design](https://github.com/febbhav/signs-of-ai-design) as a source
of diagnostic questions: does this container clarify grouping, does this icon
communicate anything, and is the layout justified by the content? Avoid turning
examples into a ban list that merely produces another default style.

## Evaluate the workflow

The procedure is not evidence that design quality has improved. For a pilot, compare
the existing workflow and this one on the same small set of briefs: a Hub invitation,
a Polymind contribution state and a Puck room state. Hold content, starting source,
model and time/cost budget constant. Record those controls and total correction time.
Have people compare unlabelled results in varied order for task completion,
accessibility defects, contextual fit and distinctiveness. Keep those judgements
separate from automated checks. Use the findings to simplify or adjust this workflow.
