# Puck: a precise graphic instrument

## Brief

Participants on phones move one shared puck towards a named option in a live
collective activity. The arena is an operating surface within the work: names,
boundaries and input feedback must be legible immediately. Retain the existing
flat ink/paper/olive/lime language, local Helvetica stack and server-authoritative
mechanics. No additional rendering dependency, provider call or deployment.

## Selected direction: Outline

The user selected Outline after comparing the two working studies. It is the
sole arena treatment in live rooms and replays: open target discs, separate bold
names and a solid puck. The solid Index variant and treatment switch have been
removed. Historical comparison captures remain in the ignored evidence directory.

When any label exceeds 28 characters, Outline uses numbered **outlined** discs
and a full-text key, avoiding crowded text or silent truncation. Numbers identify
options; they do not imply ranking. Target and puck radii are unchanged.

Open `/studies` for the retained Outline preview. This is explicitly labelled
synthetic local simulation using the existing pure engine with one participant;
it creates no room, identity or recording. The controls expose halfway holding,
selection and six demanding long options. The preview is unlinked from normal
participant navigation.

## Rendering decisions

Target outlines, magnet outlines and tethers use non-scaling strokes. Dwell arcs
scale with the puck so normalised dash lengths remain accurate at every size.
The puck retains its actual radius, with a paper separation ring outside it.
The local magnet is an olive ring and centre point; while engaged it grows and
fills lime, connected by a continuous tether. It is an input marker, not an
additional participant or a force magnitude display. Releasing removes the line.

Holding thickens the destination outline and advances a tracked ring around the
puck. Selection fills the destination lime and announces its name. The rendered
puck snaps to the authoritative selected position so the outcome cannot visually
trail the decision. Replay visibility and contribution arrows remain unchanged.

Presentation interpolation uses elapsed milliseconds (39 ms time constant),
settles exactly within 0.1 arena units, and stops scheduling animation frames.
Backward ticks, same-tick position changes and reduced-motion preferences snap
rather than interpolate. The physics, input coordinates and recorded state are
unchanged. Target boundaries remain truthful; larger targets would be a separate
mechanics decision.

## Verification and evidence

Reproduction: run the normal Puck server with a disposable database and visit
`/studies`. Use the State selector, six longer options, keyboard
arrows/Space and pointer holding. Screenshots come from `tests/e2e/studies.spec.ts`
at 1440 × 1000 and 390 × 844, with a 320 px overflow check. Existing browser tests
also cover real two-participant input, reconnects, cancellation and private replay.
Unit tests compare equal elapsed smoothing at 60 and 120 Hz, exact settling and
clock anomalies. Browser tests check idle coordinate mutations and reduced motion.

The six Puck browser tests cover the selected Outline preview and existing flows.
The initial run exposed a test selector mismatch, corrected to use the combobox role. Visual
inspection then corrected the halfway arc (normalised dashes conflicted with
non-scaling strokes), the missing magnet in frozen previews, and mobile study
control order. Screenshots were refreshed after these corrections.

The Impeccable detector ran once. Its Helvetica warning conflicts with the
explicit project font commitment and was rejected. Type-ramp and existing-colour
advisories were reviewed against DESIGN.md's prose; the study uses a deliberately
larger review heading, and SVG numerals are expressed in arena coordinates rather
than CSS body-text sizes. No external fonts or new palette were introduced.
Current web-interface guidelines were also consulted; the changed controls have
labels and keyboard handling, focus remains blue, and reduced motion is retained.

An independent screenshot critic preferred Outline for direct name-to-target
reading and found no additional material defects. The critic did not claim live
or physical-device verification.
Final `mise exec -- just verify` passed after all source corrections: lint,
types, tests and builds across the repository. Final `mise exec -- just
test-browser-puck` passed all six browser tests after selection. The critic reviewed the
original refreshed captures and found the listed visual fixes resolved. Initial sandbox
failures blocked the uv cache and local server socket; both commands succeeded
with authorised access. No infrastructure checks remain blocked.

Retained screenshots are in `test-results/design/puck-instrument/outline/` and
`test-results/design/puck-instrument/index/`, with a recoverable implementation
patch beside them. Final selected-treatment captures are in
`test-results/design/puck-instrument/selected-outline/`. Source baseline: `8b7199ed70c91aaa96cea0b08a4bc0c968fd446b`. These checks do not establish physical-phone or venue
usability, human usefulness, or accessible operation for every assistive technology.
