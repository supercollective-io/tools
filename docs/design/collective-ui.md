# Collective tools UI redesign

## Brief

Redesign Hub, Polymind (session, continuous participant, operator and projection)
and Puck (creation, room and replay). The user delegated judgement to the existing
purpose and behaviour. Participant phone tasks lead; operator desktop views use
more space. Modes: Operate for controls and participants, Read for projection.
Keep content, identity, autosave, confirmation, publication and server authority.
No external fonts, images, providers or runtime dependencies are needed.

## Direction and evidence

The user rejected the initial workshop direction and asked for “functional, almost
swiss, but on the bold side”, with confidence and provocative cheekiness. This
supersedes the initial seed and studies. The performance description in
`apps/polymind/docs/rehearsing-we.md` grounds the direction in collective power,
contradiction and the ability to answer back. Keep the agreed participant question
exactly as supplied; do not promise consensus, nemesis matching or capabilities
from the artistic ambition that the application does not implement.

The initial same-copy stack, split and band studies remain in the ignored evidence
directory as rejected visual studies. Their structural comparison favours split
context/task areas on desktop and a compact stack on phones. The final render
replaces their soft blue rounded treatment with the user's chosen language.

## Direction contract

THESIS: function first; assertive typography and a strict grid give collective
participation confidence without suggesting unanimity.

OWN-WORLD: near-black ink, neutral light ground, white fields, flat square controls,
Helvetica/system sans, strong horizontal rules. Yellow-green identifies current
state; error red stays semantic. No ornamental animation or decorative imagery.

STORY: understand the invitation, contribute or participate, recognise saved state,
and return. Operators distinguish preparation, processing and publication.

FIRST VIEWPORT: Hub pairs large identity with one current invitation. Mobile stacks a shorter header above that invitation.
Polymind foregrounds the agreed question and writing task, with recovery after the
primary task. Puck gives creation controls a single readable column; the live room centres the arena. Operator sections use a broad grid.

FORM: user-directed Swiss functionalism, seed: none (pinned). The user specified
“functional, almost swiss, but on the bold side” and delegated implementation
judgement. Prior seed `seed:608c165294acf09b` is superseded, not user-approved.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification plan

Use synthetic browser flows and inspect mobile and desktop screenshots. Check
long text, keyboard focus, 320 px reflow, disabled controls and reduced motion.
Run root verification and all browser flows. No actual-phone or venue claims.
Baseline browser suite passed before source changes. Baseline screenshots are
kept locally; private recovery codes in synthetic captures are not public assets.

The user subsequently excluded non-functional text. Remove added slogans and
performance framing from UI copy; confidence is visual, not extra prose.

## Review and checks

- Root verification passed: TypeScript and Python lint/types/tests/builds. Final
  post-review gate is recorded in the task report.
- Browser suite passed: Polymind participation/publication/identity flow, five
  Puck lifecycle/keyboard/invitation/replay tests and Hub navigation smoke.
- Added Polymind overflow assertions and captures at 320, 390 and 1440 px for
  participant, operator and projection. Hub already asserts 320/390 px fit.
- Additional static source renders cover Hub desktop and legacy voice participant,
  operator and projection at 320/1440 px with reduced motion and Tab focus.
  Static renders are visual evidence, not live-flow evidence.
- The first Hub rerun caught a 320 px title overflow; the corrected title fits.
- The independent reviewer found redundant Hub phase slogans. Replaced them with
  Waiting, Current activity, In-person activity and Finished; reran Hub smoke.
- Impeccable detector reported only familiar-font warnings for Helvetica. Retained:
  the user's Swiss direction explicitly supports this local font stack.
- Vercel source review used the fetched `web-interface-guidelines/main/command.md`,
  SHA-256 `d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234`.
  Fixed print QR dimensions, added Puck skip navigation, visible focus on summaries
  and projection fullscreen control, minimum control heights, narrow flex/grid fit.
  Retained sentence case and first-person consent wording as existing product copy.
  Existing JS-controlled forms still use IDs rather than universal form names;
  no autofill or form-submission behaviour was changed. This is a scoped audit,
  not a claim of full accessibility compliance.
- No shipping raster assets or external font dependencies were added.

## Limits

Local Chromium and synthetic content only. No physical-phone, venue, real-provider,
artistic-outcome or deployment verification. Long operator forms remain tall on
phones; collapsing safety-critical controls was not part of this redesign.

The independent reviewer verified the Hub copy fix in refreshed screenshots.
This is a resolved finding, not a claim of exhaustive accessibility approval.
Calculated sRGB contrast: ink/paper 15.8:1, muted/paper 6.66:1, white/ink 17.58:1,
ink/lime 15.1:1, olive/white 9.22:1, blue-focus/white 6.47:1.
Final root verification and browser checks passed; no introduced lint warnings
remain. The rejected first Hub run and initial cache restriction are resolved.

## Hub copy refinement

User feedback retained the visuals and removed excess copy. Ready digital states
now show only the current-state label, activity title and “Join activity” link.
Removed homepage venue framing, duplicate phone-away guidance, redundant return
address/footer copy and successful-connection chatter. Waiting, in-person and
failure states keep actionable instructions. Default Polymind title is its app
name, not “Our temporary collective mind”; existing saved programme names remain
operator-controlled. Browser smoke covers suppressed ready-state instructions,
retained in-person instructions, connection failure and recovery.
