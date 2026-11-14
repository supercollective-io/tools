# Hub random pairs

## Brief and direction

Extend the existing participant entrance in Operate mode. Around 100 people in a
performance room must find an assigned stranger using their phones. No personal
content, names or inferred compatibility enter the matching. Step one is pairing;
physical discussion prompts are a later implementation step.

Keep Hub’s Helvetica stack, paper ground, ink text and square controls. During the
pairs cue, compress the masthead and centre one large marker. A coloured shape
supports scanning; a separate very large black number confirms the match. Five
colours and five simple shapes avoid asking participants to distinguish dozens of
subtle colours or silhouettes. Combinations repeat after 25 pairs; numbers do not.
The large identifier deliberately exceeds ordinary display typography sizing.

Existing invitation layout returns when the cue changes. No animation, external
images, fullscreen dependency or new font is required. Native buttons, live status,
visible focus and a textual colour/shape description support alternative interaction. The identifier
appears once visually, below the finding instruction; the atomic live region
includes its number and description. No instruction tells people to put phones
away, because the next implementation step supplies discussion prompts.
A facilitator handles missing partners or an odd final participant.

## Research

A delegated research pass recommended redundant colour, shape and number cues.
[W3C’s use-of-colour guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)
requires information beyond colour. A
[visual-search study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11480184/)
supports colour as an attention cue and form as verification, but does not validate
this specific interface. The
[UNSW signage standard](https://www.unsw.edu.au/content/dam/pdfs/estate-management/general/2026-05-unsw-wayfinding-signage-standards-revision-10/2026-05-unsw-wayfinding-signage-standards-revision-10-chapter-g-1-sections-01-10.pdf)
illustrates distance/letter-size constraints; it is not evidence that a phone works
across a room of 100. Test actual phones, lighting and distances before claiming that.

## Behaviour and evidence

Explicit join, approximately 12-second random batches, stable assigned pairs,
waiting-list exit and recovery from refresh or server restart. Assignment hashes
remain in the atomic private state; public responses show only the requesting
browser’s result. Profile changes apply to new runs; an existing invitation can be
changed to the new mode through the existing editor.

Unit and HTTP checks cover 100 arrivals, unique disjoint pairs, idempotence,
concurrent requests, late and odd arrivals, origin rejection, persistence and cue
scoping. The profile browser smoke adds independent browser identities, matching
numbers, refresh recovery and captures at 320, 390 and 1100 CSS pixels. Screenshots
are written to the temporary directory printed by that script and retained in
`test-results/design/hub-random-pairs/` for this patch on `7820725`. These are synthetic
checks, not evidence of venue usability.

Source review uses the current
[Vercel guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md),
retrieved 14 November 2026. Repository sentence case and existing styles take
precedence over that source’s generic copy preferences.

## Completed review

The independent reviewer identified stale waiting entries and a missing spoken pair
number. Both were corrected: 20-second waiting leases and the pair identifier inside the existing atomic live region. Repeated identical poll results do not rewrite the announcement.
The reviewer then inspected the 320, 390 and 1100 px captures and found no blocking
layout issues. The implementation owner also inspected the two phone captures.

The mechanical detector flags existing typography and the deliberate identifier
palette/oversized number; these are retained for the documented task. Shape colours
are darker than the original study to keep non-text contrast against the paper
surface. The current-guideline source review found no remaining blocking issue in
the added controls. Motion is inapplicable; there is no animation.

Hub syntax checks, 34 unit/HTTP tests and both Hub browser smoke scripts passed.
The full root gate passed its check stage, then stopped on Polymind’s unresolved
`@langchain/core/messages` import and related model type errors. Container build
could not start because Docker’s daemon was unavailable, so container smoke was
not run. No deployment or physical-phone/venue check was performed.


## Step two: shared suggestions

The marker gains **We’ve found each other**, leading to a compact conversation view.
A single suggestion is set in large ordinary text, with **Try another** and
**Continue without a suggestion** below. **Show pair …** restores the identifier.
The identifier is not duplicated above the suggestion. Existing typography,
colours, controls and responsive column are retained. There is no timer or animation.

The pair shares its current prompt and skip state; entry into conversation view is
local to each phone, so one person cannot hide the other’s identifier before they
have met. Each invitation’s authored catalogue is editable in Preparation. Executable prompt pools are now bundled in Hub and selected by profile, following
the user’s request for automatic loading. Artistic notes remain outside this
repository. The profile browser check exercises the bundled selection. A missing catalogue leaves conversation available without a draw
button. Both phones poll the shared state; identical responses do not reannounce it.

Revision-checked actions coalesce simultaneous taps and safely recover lost
responses. The latest shared text survives restart. Tests cover deduplication and
bounds, no-repeat cycles, catalogue edits, shared skips, stale retries and
unauthorised prompt changes. Browser checks use separate participant contexts and
cover redraw synchronisation, reload recovery, skip and return to the identifier.

Step-two verification: Hub syntax checks and 36 unit/HTTP tests passed. Both Hub
browser smoke scripts passed, including editing the catalogue, two-phone shared
draws/skips, reload recovery and restoring the identifier. The implementation owner
and independent reviewer inspected synthetic prompt captures at 320, 390 and 1100
CSS pixels, retained in `test-results/design/hub-pair-prompts/` for the working patch
on `2d427fb`. Neither found a blocking visual issue. Source review against the
Vercel guidelines retrieved on 14 November 2026 and the mechanical detector found
no new blocking issue; existing typography/palette advisories remain intentional.
The root gate again passed checks and stopped on the same Polymind model type
errors. This step does not alter container packaging. No deployment or physical
venue testing was performed.


## Automatic profile selection

Prompt definitions now live in `apps/hub/profiles/prompt-pools.json`, with stable
IDs and separate pairs/fours pools. The current performance profile selects the
whole pairs pool through `promptPool`; optional `promptIds` select an ordered
subset, and an empty list selects none. The executable pairs catalogue contains
28 invitations, including props. The bounded list/history limit is now 64.

Run creation resolves selection to ordinary prompt text; saved runs retain their
snapshot through restart and later catalogue changes. Legacy runs are not silently
backfilled. The manual editor remains a per-performance override. The bundled
profiles directory is already copied by the Dockerfile and included in its build
context, so runtime loading never reads another checkout.

The focused gate passes 38 tests, including whole-pool loading, explicit subsets,
invalid selectors, independent copies, saved snapshots and legacy compatibility.
The full gate remains blocked by the existing Polymind model type errors.
Both Hub browser smoke scripts also pass. The profile flow now asserts 28 loaded
prompts and draws from them without any manual catalogue preparation. The narrow
render was inspected with an actual bundled prompt; no clipping was observed.
