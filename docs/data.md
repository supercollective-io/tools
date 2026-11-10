# Real-data evaluation

## Included example dataset

`examples/event.json` contains **twenty real-derived profiles**, adapted from individual
r/INAT collaboration posts published in 2024–2025. `examples/sources.json` links every
profile to its source and records capture method and adaptations. These replace the
original fictional demonstration profiles.

The main posts were read through available web page/search extractions, excluding
comments. For four included sources a subagent opened the source page; others have
main-post text available through search extraction, bounded by the comment section.
The manifest distinguishes these routes. Access to every original page is not
reliable, so this is not a fully reproducible downloader or claimed licensed corpus.

Profiles are paraphrased into **offers** and **needs**, preserving engines, experience,
project scope, preferences and commitments. Names are descriptive labels. Contacts,
portfolio links and unnecessary identifying details are omitted. No new abilities,
needs or reciprocal fit were invented. Two posts later said partners or teammates had been found;
those closures are retained. We evaluate the historical stated requests, not current
availability. No one has been contacted or introduced.

This twenty-post convenience sample meets the initial 20–30 profile target.
It is neither representative nor labelled ground truth. Author identities
have not been reconstructed across posts; a source post is the evaluation unit.

Raw local captures, where saved, are in ignored `data/reddit-part-*.json`, with matching
source metadata. Further adapted records are in ignored `data/additional-*.json`. Search extractions
showed main-post endings before comments, but completeness could not always be
independently verified by opening the original page.
Do not bulk scrape or assume these materials carry an open redistribution licence.

## Run and inspect

```sh
uv run match score examples/event.json --output runs/reddit
uv run match inspect runs/reddit --person 1cv563y
uv run match allocate runs/reddit --output runs/reddit-allocation.json
uv run match allocate runs/reddit --normalisation zscore --output runs/reddit-zscore.json
```

`data/` and `runs/` are ignored. Generated results should not be committed. The input
schema requires an event `description` and `participants`; each participant has `id`,
`name` and either `profile` or both `offers` and `needs`. The full text is assessed.

## Evaluation

Use `evaluation.csv` for human review. Read source-derived profiles before model scores.
Score relevance in each direction and shared inquiry using levels 0–4; record reasoning
and disagreements. Reserve some examples using the `split` column while adjusting the
rubric. Compare allocation modes using the same stored assessments. A high model score
or an enthusiastic historical reply is not evidence of a successful collaboration.

Unit tests retain minimal mechanical records/numeric scores to test algorithms; they
are not demonstration profiles and are never used for live model-quality evaluation.
