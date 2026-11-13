# Operating Polymind

Use one server process per data directory. Health is `/healthz`; operator controls are `/operator`. Keep the operator token in server configuration and a private password manager, never in session links. Public HTTPS must terminate at the configured exact `PUBLIC_ORIGIN`. Participant cookies are HttpOnly, SameSite Strict and Secure on HTTPS.

Hub’s **App controls** opens Polymind in another tab, selecting the session from the
saved participant invitation. Operator links accept `?session=<id>` and preserve
that choice through sign-in. An unknown session stops with a session-chooser link;
it never silently opens another session. Changing the session updates the browser
address so reloading retains the selection. Hub and Polymind keep separate sign-ins.

## Bounded show flow

1. In `/operator`, create or select a session and configure the analysis provider,
   model, input budget, output limit and timeout. Set the **Round question**, then
   choose **Open writing**. The question appears on phones and the projection.
2. Participants write or add a corrected transcript. Non-empty writing autosaves
   into analysis and matching; there is no separate confirmation or opt-in button.
   Keep joined and contributing counts distinct. Empty writing withdraws the current
   contribution before closure.
3. Choose **Close writing and analyse**. This action authorises publication of the
   completed collective overview. It freezes exact saved revisions and the round
   question, then starts one analysis operation. Invalid configuration, empty input
   or an exceeded input budget leaves writing open. Unsaved local text is excluded
   and remains on its originating phone.
4. The complete, validated overview appears automatically on the projection:
   common ground, differences, core questions and other concerns. Phones say
   “Analysis complete”. Inspect supporting contributions privately in the operator
   view. There is no automatic heuristic replacement if the model fails.
5. Optionally choose **Release personal perspectives**. Each person receives only
   existing findings linked to their own frozen writing. Missing representation is
   stated explicitly. This step uses no additional model calls.
6. Facilitate the room's choice of **Similarity** or **Collaboration**, select that
   criterion and configure its model and budget. No criterion is preselected.
   Choose **Start matching**. Matching consumes the original frozen writing, never
   the generated overview. The projection continues showing the overview.
7. Review every pair/trio, actual room marker and seated arrangement, then release
   encounters privately. Trio allocation is a disclosed heuristic. Matching shares
   a short source excerpt only with that encounter's participants. Use assistance
   for absent partners, declines and late arrivals; never silently replace a
   released encounter. A subsequent round can avoid previously released partners.

After analysis, the optional **Atlas** section builds a similarity network from the
same frozen snapshot using the selected OpenAI embedding model. This is a separate
provider request and recoverable job; it does not rerun analysis. Review every
original contribution, tick the publication approval and choose **Publish original
writing in atlas** before showing it. This makes the snapshot's original words
public, unlike the normal overview. Use **Projection focus** to select a finding,
**Show atlas on projection** to present it, and the previous/next text controls to
page through sources. **Show analysis on projection** returns to the overview.
Do not publish historical writing collected under a promise of non-publication
without appropriate permission. See [atlas boundaries](design/analysis-atlas.md).

Failure leaves the frozen writing intact. Retry explicitly, or choose **Continue
without analysis** after failure, cancellation or interruption to proceed to matching.
Personal release is optional. Previous results remain stored when a new round starts.
The new writing question replaces the earlier projection; historical analysis can
be selected again without making a model call.

## Collective Microphone and historical operations

Open Collective Microphone as a separate continuous round after closing the current
round. It retains autosave and explicit Start/Pause/End controls. Starting its voice
explicitly selects the voice presentation; old voice text cannot override bounded
analysis. Its context budget still applies and pauses safely rather than silently
truncating inputs. Continuous writing does not enter bounded matching automatically.

Historical `bounded-v1` analysis and bounded voice operations retain manual
publication. Upgrading does not reveal existing private results. New `analysis-v2`
operations publish automatically only when the initiating operator action records
that intent. Personal perspectives and encounters always require their separate
release actions.

Two bounded operations can run at once. Additional jobs remain queued for an explicit Start. Restart marks queued/running jobs interrupted and never silently makes another provider call. Retrying matching reuses successful saved assessments; a killed billed call can still consume budget without a saved answer. Provider selection, input size, output tokens, timeout and matching call budget are explicit. Model pricing, quota and latency require a real rehearsal, not synthetic tests.

Recording is optional and requires an explicitly configured transcription model. The operator decides recording duration and gives the stop cue; there is no fixed phone timer. Participants choose **Stop recording**, transcribe, review and correct the text, apply it to their contribution, and wait for **Saved**. The operator closes collection only after all contributions show **Saved**. Closing collection stops an active phone recording at the next state refresh and excludes unsaved transcripts; it does not allow later review or saving. The server bounds each upload at 8 MiB as a technical safeguard and validates supported container signatures. The upload limit is not a duration cap, and the server does **not** validate decoded media duration. Four transcriptions run concurrently and each person has five recording attempts per round. Audio is private and removed after successful transcription; failed/interrupted uploads expire after 24 hours, with cleanup retried after filesystem errors. Text remains private until the organiser deliberately removes the event after the agreed retention period. No unreviewed transcript enters a confirmed snapshot.

For an explicitly budgeted private model rehearsal, `just rehearse-models /absolute/request.json` accepts `authorisation: "run-provider-rehearsal"`, `kind`, `snapshot` (the versioned authorised export), `config`, `maxProviderCalls` and a new `outputDirectory`. It refuses existing output directories, uses only the selected provider, saves a private result and does not publish. Never use automated verification as a reason to make paid calls.

See [backup and restore](ops-backup.md). Stop the writer before a consistent backup; code rollback does not undo database changes. Polymind is deployed and its public interface and health were checked on 12 November 2026; see the [deployment review](verification/public-deployments-2026-11-12.md). Preserve existing production data and verify any migration requirements against the actual running revision before updating it.
