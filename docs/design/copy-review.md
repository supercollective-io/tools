# Interface copy review

## Standard

Every line must support an available action or explain a consequential state.
Do not add reassurance, slogans, duplicated context, implied process steps or
technical implementation language that the reader does not need. Retain the
approved Swiss visual treatment and the agreed performance question.

## Coverage and decisions

| Surface | Changed | Retained deliberately |
| --- | --- | --- |
| Hub entrance | Ready activity reduced to state, title and Join activity; removed venue, return advice and success chatter | Configured waiting/in-person instructions; connection failure and recovery |
| Hub operator | Removed introductory procedure and spoken-cue reminder | Participant-link privacy warning and conflict feedback |
| Printed entrance | Removed venue and return-page prose | Performance name, QR and readable address |
| Polymind join | Name question no longer assumes a partner; seat preference conditional on matching | Recovery and access controls |
| Polymind writing | Removed duplicate event name, routine membership status, directive placeholder and unavailable-recording explanation | Confirmation, optional matching, publication control and edit consequences |
| Polymind conflicts/errors | Replaced rebase jargon and browser fetch wording; corrected reference to a nonexistent Save control | Competing saved text, explicit replacement, unsaved-draft recovery |
| Polymind recording | Reviewed upload/transcript stages; no gratuitous trimming | Upload choice, transcript review and current-round boundaries |
| Polymind operator | Shorter cost/publication and voice-control explanations; actionable meeting-location instruction | Provider choices, budgets, frozen inputs, review/release boundaries |
| Polymind projection | Factual empty state, shorter interpretation label | Distinction between analysis and agreement; connection failure |
| Puck creation | No new copy needed | Question, options, advanced settings |
| Puck room/join | Correct ready-state text; removed duplicate privacy explanation from How to play | Privacy before joining, keyboard instructions, selection timing and non-consensus caveat |
| Puck replay | Baseline correctly names participant magnets rather than resultant pulls | Personalised-layout and force-projection distinctions |
| Legacy voice participant | Normal operation says Saved; non-running state keeps context | Storage errors, closed-session and queued-input consequences |
| Legacy live workspace/projection | Participant entrance replaces Join on your phone | Model/mode choices, writer status, projection fullscreen |

## Visual review

`test-results/design/copy-review/index.html` is a self-contained local review with
29 screens, full-size viewing and browser-local notes. It uses synthetic content.
Recovery codes in shared review captures are replaced before rendering; no real
participant records or credentials are included.

The review distinguishes browser-flow captures from source layout fixtures.
Fixtures cover audio/transcription, conflicting edits, released encounters,
expanded privacy and the legacy voice surfaces. They do not demonstrate real
provider execution or independently verify these flows.

The independent copy reviewer identified the pre-match partner assumption,
partner-specific help before release, and stale operator feedback. These were
corrected and verified in focused and browser tests. The reviewer also recommended preserving Puck's privacy, keyboard,
selection and replay distinctions and Polymind's frozen-publication boundary.

## Boundaries for review

- Matching assistance is collapsed; partner-finding and declining a match are
  offered only after an encounter is released. Pre-match assistance covers seated
  meetings and late joining, and requires an explicit reason.
- Activity titles and waiting/in-person instructions are operator-configured;
  this pass does not overwrite saved event programmes.
- Retention text and generated analysis/voice are runtime content. Their real
  settings and outcomes need event-specific review; fixtures are not approval.

## Verification

All browser flows passed with the revised copy, including Polymind publication,
identity recovery and live controls; Puck keyboard/round/replay/QR flows; and Hub
navigation and connection recovery. The repository gate passed after updating
copy assertions and rerunning separately from browser capture. Initial concurrent
execution had four test timeouts; one outdated status assertion was corrected.
Final checks and review-gallery validation are reported in the task response.

Final feedback removed the event name beneath the participant question; the header
return link remains. Default Hub programme prose was also shortened: clear app
names replace vague activity names, and in-person/closing states give one direct
instruction. Existing saved programme copy is preserved.

The user specified the in-person screen: “In-person activity”, followed by
“Put your phone away. Leave this page open — we’ll return to it.” The redundant
phase label is hidden for that state. Other default copy uses direct app names
and instructions; the agreed artistic question and participant/generated content
are not rewritten as interface copy.

## Participant-flow revision

Saved non-empty writing now enters bounded rounds and matching automatically. The
participant confirmation button and matching checkbox are removed. Empty writing
withdraws the current contribution before freezing; frozen revisions remain intact.
Continuous writing retains its existing live processing semantics. The protocol’s
confirmation fields remain for compatibility; the browser supplies them on save.

Recording transcripts are previewed before replacing the contribution, with the
action labelled “Replace my contribution with this transcript”. Conflicts are
exceptional recovery for simultaneous browser edits, with “Use saved text” and
“Keep my text” choices. Uncertain saves retry their original request identifier.

Projection shows only published words, or the current live voice when present.
Left and right arrow keys navigate published findings. No results means a blank
projection; interrupted connections retain the last words. Hub waiting instructions
are optional and empty by default. Puck’s join privacy paragraph is removed.
