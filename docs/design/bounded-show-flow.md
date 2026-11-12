# Bounded Polymind show flow

## Experience

Participants write on phones, then look at one shared projected analysis. The
operator sets each round question, closes writing and starts analysis in one action.
Completed analysis publishes automatically; phones initially show only “Analysis
complete”. The operator may release each person's existing source-linked findings
before the room chooses a matching criterion through facilitation. Matching uses
the same original frozen writing. Collective Microphone is a separate later activity.

The operator surface is an Operate surface; the projection is a Read surface.
Preserve the existing ink/paper/lime palette, Helvetica stack, square controls and
functional copy. Configuration and historical jobs sit behind disclosures. Current
writing, analysis and matching actions remain in order, with provider diagnostics
kept off participant screens. The optional [analysis atlas](analysis-atlas.md) adds a separate graph view; no ballot or individual model inference is added.

## Presentation and boundaries

The projection uses four aligned columns for common ground, differences, core
questions and other concerns. One complete overview remains visible during matching.
Findings have bounded titles and descriptions; the model may return fewer findings.
Evidence expands on the operator screen. The standard public overview omits source references
and excerpts; the atlas has its own explicit source-publication boundary; personal release filters those references and excerpts to the owner.
A missing link is reported honestly, not filled with an invented interpretation.

The new writing question explicitly replaces an older analysis presentation. Starting
Collective Microphone explicitly selects voice; stale voice cannot override analysis.
Local drafts that missed closure remain recoverable and labelled as excluded.

## Verification

`apps/polymind/scripts/show-flow-browser.mjs` runs a fake-provider end-to-end flow
with isolated participant contexts, deferred analysis, exact frozen-input checks,
personal privacy checks and explicit matching. It captures the maximum valid
12-finding overview at 1280 × 720 and 1920 × 1080 and personal perspectives at
320 px and 390 px widths under `apps/polymind/test-results/show-flow/`.

The projection layout checks actual text bounds as well as document overflow.
The existing browser flow continues to cover identity recovery and voice controls.
Run both through `mise exec -- just test-browser`; run the full gate with
`mise exec -- just verify`. Source review follows the Vercel Web Interface Guidelines
retrieved on 12 November 2026 (SHA-256
`d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234`); the repository's sentence-case and visual-system
choices take precedence over generic style suggestions.

Synthetic results demonstrate presentation and software behaviour. They do not
establish readable projection at a particular venue distance or useful real-model
interpretations. Use the [analysis evaluation procedure](../../apps/polymind/docs/bounded-analysis-evaluation.md)
and a physical rehearsal for those questions.

The Impeccable detector flagged the established Helvetica stack and intentional
projection type sizes; the project brief takes precedence for these. The actionable
excluded-draft inset was corrected. Rendered inspection covers the maximum-content
overview and phone perspectives; independent state review added regressions for
stale voice visibility, previous-analysis selection and retained meeting locations.
