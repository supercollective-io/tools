# Rehearsal flow improvements

## Brief and direction

Participants use phones during a live gathering; operators run activities and
projection separately. Preserve the existing functional, high-contrast design.
Participant screens use Operate mode, while the microphone projection uses
Experience mode: the generated passage takes precedence over application branding.

The first contribution puts the question and text box together. Save state stays
visible, while identity, usage details and recovery information follow the writing
area. Earlier saved contributions appear in a collapsed, read-only history;
a fresh round starts empty and does not reuse old writing as model input.

Hub remembers a display name for this browser and passes it to Polymind and Puck.
Each tool still requires its ordinary join action and retains its own identity.
See the [name hand-off contract](../../apps/hub/API.md#participant-name-hand-off).

Puck shows registered membership as “n joined”, reserves sharing controls for the
host, and uses the same Rehearsing We header link as Polymind. Target labels longer
than 28 grapheme clusters use the first 27 plus an ellipsis. Numbered targets map
to full options below the arena. Recorded labels and mechanics are unchanged.

## Evidence and reproduction

Use synthetic data and the current working-tree patch against `55ae579`.
Run from the repository root:

- `mise exec -- just verify` for lint, types, unit tests and builds.
- `mise exec -- just test-browser` for participant, operator, projection, Puck,
  Hub and the cross-origin name hand-off.
- `mise exec -- just test-browser-name-handoff` after building for the real
  HTTP join flow across three distinct browser origins. This test proxies local
  services to browser test origins; Puck's own suite verifies live WebSockets.

Polymind's browser script captures the 390 × 844 first contribution and verifies
that its question and usable text box fit together before the keyboard opens.
Other captures check reflow at 320, 390 and 1440 pixels. Puck's studies include six
long labels on mobile; bounding-box checks keep labels clear of their own targets.
Representative captures are retained under
`test-results/design/rehearsal-flow-improvements/` (ignored).

An independent read-only review found that Puck's wrapped bottom label touched its
target circle. The revised bottom-edge anchor reserves space for the label height.
The inspected Polymind contribution screen shows the question and writing area
without intervening explanatory copy. This evidence does not establish physical
phone or venue usability.

Source review uses the [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
retrieved on 13 November 2026, alongside the repository's design constraints.
Existing sentence case and visual identity take precedence over upstream style
preferences. No design-tooling repairs are included.

## Verification result

On 13 November 2026, `mise exec -- just verify` passed: lint, types,
608 Polymind tests, 35 Puck tests, 10 Hub tests, 8 root script tests,
84 Python tests and application/package builds. Then
`mise exec -- just test-browser-built` passed against that build, including both
Polymind flows, all 8 Puck browser tests, Hub smoke and the real cross-origin name
hand-off. The microphone flow includes pause/resume, end, fresh-round creation,
private read-only history, heading-free projection and enlarged-text reflow.

The detector reported typography/palette advisories for the incumbent design.
The existing font and intentional compact participant question are retained;
no unrelated design-system or tooling changes were made. Verification used fake
providers and disposable data. No deployment or paid rehearsal was performed.
