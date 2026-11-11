# Composer pilot: performance assessment

For the subsequent working proposal on what to assess, see
[criteria for the collective voice](collective-voice-criteria.md). It includes
artistic composition and performative quality alongside recognition,
faithfulness and plurality. The pilot protocols and amendments below retain
their historical scope; the proposal does not retrospectively change them.

## Amendment after the initial model screen

On 4 November 2026, after the 40-response screen and its ten-response follow-up,
the creator clarified that this is a theatre performance, not a system for
arranging commitments. At hundreds of voices, one person's change of mind may
or may not appear. Explicit correction after withdrawal must not be a central
criterion. This clarification supersedes the original screen's correction gate
and applies to subsequent experiment slices.

This is a change to the construct being assessed after seeing outputs, not a
new preregistered confirmation result. Preserve the original protocol in each
run's manifest, the original assessments, and all writing. Reassess the same
saved trajectories without additional API calls. Do not change source scores,
saved prefixes or configurations to improve an outcome retrospectively.

## Primary goals: each participant's experience

The goal is for **each individual** to feel both represented in the collective
and in conversation with it. Performance quality, technical responsiveness and
compression are supporting considerations. An interesting, fluent collective
text can still leave a participant feeling absent or unheard.

Representation is not a count of topic mentions. Ask whether each person
recognises something of their perspective, experience or concern, including
differences from others. Conversation is not compliance or a reply to every
input. Ask whether the collective gives the person something to respond to and
whether their subsequent contribution has a meaningful opportunity to influence
the developing exchange. One person's change may be omitted without failing
either goal; a pattern of excluding that person is a different concern.

In responsive AI-participant and human rehearsals, ask each participant about
the two goals separately. Ask for specific moments that supported or undermined either experience, and inspect
the surrounding exchange with them. Record mixed or negative accounts and
patterns of exclusion instead of reducing everything to a room-wide average.
Neither a participant's positive account nor a reviewer reading establishes
everyone else's experience. Record participant assessments alongside the
exchange; do not replace them with an external prose-quality rating.

Responsive AI participants can provide strong evidence about the intended
experience. They can recognise or reject a representation, find something to
answer, develop their own perspective, and assess how their contributions relate
to what follows. Use those assessments and the observed exchange together.
Control for leading role instructions, automatic agreement and shared model
biases. Human rehearsal tests transfer to the actual audience; it is not the
only evaluation that counts.

The fixed-script Luna screen tests only part of this process. Its sources never
hear or answer the collective. Distinguish an external assessment of those
saved trajectories from evidence produced by responsive participant experiments.

## Assessing fixed-script trajectories

Assess complete trajectories against the source prefixes actually available at
each request. Cite output and source evidence. Distinguish an external reader’s
assessment of a fixed script from a responsive participant’s own account.

1. **Development and continuity:** Does one thought develop through the text?
   Record connections that progress, broken joins, restarts and repeated
   abstractions that add nothing.
2. **Concrete grounding:** Does the writing use specific material from these
   contributions? Identify passages that could fit almost any room, as well as
   invented circumstances presented as shared experience.
3. **Connections and differences:** What relationship or tension does the
   composer develop? Does it repeatedly flatten different positions into one?
   Selective omission is expected; assess the meaning of material actually used.
4. **Responsiveness across the exchange:** How does later material shape the
   trajectory? Record possible influences and unexplored possibilities. Neither
   a reply to every voice nor immediate correction of an earlier offer is
   required. Acknowledgement alone does not establish influence.
5. **Speaking space and pacing:** Use whole-run word ratios descriptively and
   read the complete text for rhythm and proportion. A list of contributions
   or an administrative account of changing permissions is not the aim.

Organise observations under **potential for representation** (grounding,
connections and differences) and **potential for conversation** (developing
thoughts that invite a response, and changes across the exchange). Treat
continuity and pacing as supporting qualities. Smoothness, novelty or a stable
single perspective need not be better than hesitation, unresolved tension or
reconsideration. Record which source perspectives are repeatedly selected or
absent, without imposing equal mentions or automatic individual replies.

Use `clear`, `mixed` or `weak` with supporting evidence for each indicator;
do not add these labels into a purportedly objective quality score. A systematic
problem means at least two additions repeat the same failure in a trajectory.
Report isolated problems too, without turning every omission into a failure.

Use Luna provisionally for inexpensive screening if it produces usable coherent
trajectories without a systematic weakness in grounding, connections or
development that would obscure the architecture comparisons relative to Terra.
Retain a targeted Terra check on fresh confirmation cases. If the evidence is
ambiguous, report that limitation instead of claiming equivalence. This decision
supports further experiments; it does not test responsive participation. Include
AI-participant rehearsals to assess the two experiential goals, and human
rehearsal to test transfer to the audience.

## Changes to later slices

The creator subsequently paused the remaining live representation slices. The
[revised pilot](composer-pilot.md) records a separate larger-scale offline study,
with quality first and no initial latency, 800-token or 25% compression gate.
The preprocessing guidance below records the earlier controlled comparisons;
it does not reinstate those constraints for that future study.

- **Delivery:** test whether new context reaches generation, and compare joins,
  pacing and development. Include a traceable later change as a diagnostic,
  not a rule that the next words must acknowledge it. Report non-uptake rather
  than excluding it from observations. Rank overall usable continuity and
  responsiveness before latency and cost. A transport fault is distinct from
  choosing different material.
- **Preprocessing:** preserve exact provenance and quotation validity for the
  evidence retained. Record omissions and deferred material. Preserve meaningful
  differences in what the packet presents; do not demand that an 800-token
  packet carry every individual's latest position. Compare grounding,
  connections and development of the resulting writing as well as extraction
  and selection fidelity. A 25% median total-prompt reduction is an engineering
  target, not an artistic pass condition: report a missed target, but do not
  discard a representation with better evidence for the experiential goals
  solely because it misses that saving. Compare total preparation and composer
  costs, including reader calls.
- **Relationships:** test whether supported edges help composition, rather than
  scoring the packet by the number of refusals or corrections it retains.
- **Confirmation:** use fresh short exchanges with concrete experiences,
  contrasting perspectives and shifts of emphasis. Keep changed commitments as
  one possible kind of input, not the dominant fixture family. Compare the
  selected combination with the baseline and inspect both complete outcomes.

Keep successive vertical slices, frozen per-slice designs, explicit models,
all saved prefixes, the US$5 spending ceiling and findings commits. Do not
translate this pilot into claims about hundreds of participants; larger-scale
and real-participant studies remain follow-ups.

Speaking-space ratios and latency thresholds are comparison aids, not validated
thresholds for feeling represented or in conversation. Keep their measured
values, and establish acceptable pacing with participants. Likewise, the
800-token packet is a controlled resource allowance for a comparison, not proof
that it is sufficient for a room of hundreds.
