# Data and evaluation

## Source candidates

[`../examples/sources.json`](../examples/sources.json) records candidate public r/INAT posts from the 2024–25 period. A manifest entry is a lead for review, not a collected record or a reusable corpus. The verification field distinguishes information checked in a live search result from IDs that still need checking. Search snippets and cached excerpts can be incomplete; do not treat them as complete posts.

Source access and reuse permissions remain unresolved. This project has not established a licence for the post text or permission to build a third-party inference corpus from it. Do not download or retain post bodies in bulk on the strength of this manifest. Before acquiring any source text, review the current platform terms and applicable access route, and establish that the proposed collection and inference use are permitted. A safer initial route is to evaluate on text supplied by a participant who has permission to share it, or on a small, individually reviewed set whose use has been cleared. Keep a record of the basis for each acquired item and remove items when that basis no longer applies.

## Raw input profiles

Raw user-provided or otherwise cleared inputs belong under `data/`. The repository ignores that directory so private material does not get added by accident. Do not put secrets, credentials, or unreviewed Reddit content there. Runs and generated results belong under the ignored `runs/` directory.

The accepted raw input is an event with a shared description and participants. Individual participants may use raw text or labelled sections:

```json
{
  "description": "A short description of the event or project.",
  "participants": [
    {"id": "person-a", "name": "A", "profile": "Skills, interests, offer, and needs."},
    {"id": "person-b", "name": "B", "profile": "Skills, interests, offer, and needs."}
  ]
}
```

```json
{"description": "A shared context", "participants": [
  {"id": "person-a", "name": "A", "offers": "Skills and contributions.", "needs": "What they seek."},
  {"id": "person-b", "name": "B", "offers": "Skills and contributions.", "needs": "What they seek."}
]}
```

Use stable, non-identifying IDs for evaluation where possible. Names are required but may be pseudonyms. Profiles should include only information needed for the matching task.

## Small evaluation worksheet

[`evaluation.csv`](evaluation.csv) is a blank, human-review worksheet. Add one row per candidate pair. `relevance_a_to_b` and `relevance_b_to_a` capture directional fit; `shared_inquiry` records common ground in what both people want to investigate. Use the `split` field to keep examples assigned to separate development and held-out evaluation groups. Reviewers should judge the pair from the source profiles, not from a model-generated explanation alone. Do not treat a small worksheet as evidence of broad performance.
