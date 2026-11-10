# Real-data evaluation

## Included example dataset

`examples/event.json` contains **forty real-derived profiles**, adapted from individual
r/INAT collaboration posts published in 2024–2025. `examples/sources.json` links every
profile to its source and records capture method and adaptations. These replace the
original fictional demonstration profiles.

The main posts were read through available web page/search extractions. One profile also uses the author’s own follow-up reply, explicitly
identified in its source record; other commenters’ claims are excluded. Capture methods are recorded per source. Some pages were opened directly; others have
main-post text available through search extraction, bounded by the comment section.
The manifest distinguishes these routes. Access to every original page is not
reliable, so this is not a fully reproducible downloader or claimed licensed corpus.

Profiles are paraphrased into **offers** and **needs**, preserving engines, experience,
project scope, preferences and commitments. Names are descriptive labels. Contacts,
portfolio links and unnecessary identifying details are omitted. No new abilities,
needs or reciprocal fit were invented. Some posts later said partners, teammates or contractors had been found;
those closures are retained in source metadata only. Model inputs reconstruct the
requests before closure, in the first person, without curator commentary. We evaluate the historical stated requests, not current
availability. No one has been contacted or introduced.

This convenience sample is used to inspect score distributions and possible matches.
It is neither representative nor labelled ground truth. Author identities
have not been reconstructed across posts; a source post is the evaluation unit.

Raw local captures, where saved, are in ignored `data/reddit-part-*.json`, with matching
source metadata. Further adapted records are in ignored `data/additional-*.json` and `data/expansion-*.json`. Search extractions
showed main-post endings before comments, but completeness could not always be
independently verified by opening the original page.
Do not bulk scrape or assume these materials carry an open redistribution licence.

## Run and inspect

```sh
uv run match score examples/event.json --model jev-1.14.0 --output runs/reddit-v10
uv run match inspect runs/reddit-v10 --person 1cv563y
uv run match allocate runs/reddit-v10 --output runs/reddit-v10-allocation.json
uv run match allocate runs/reddit-v10 --normalisation zscore --output runs/reddit-v10-zscore.json
```

`data/` and `runs/` are ignored. Generated results should not be committed. The input
schema requires an event `description` and `participants`; each participant has `id`,
`name` and either `profile` or both `offers` and `needs`. The full text is assessed.

## Evaluation

Use `evaluation.csv` for human review. Read source-derived profiles before model scores.
Score support for stated needs in each direction and shared inquiry using levels 0–4; record reasoning
and disagreements. Reserve some examples using the `split` column while adjusting the
rubric. Compare allocation modes using the same stored assessments. A high model score
or an enthusiastic historical reply is not evidence of a successful collaboration.

Unit tests retain minimal mechanical records/numeric scores to test algorithms; they
are not demonstration profiles and are never used for live model-quality evaluation.

## Prompt comparison

The directional question is now “Considering only requirements Person B has explicitly asked for, how much can
Person A help fulfil Person B’s requests?” (and the reverse). Its anchors are no identifiable, weak, moderate,
strong and very strong support. Shared inquiry is unchanged. No extra matching
dimensions or extraction step were added.

Local `runs/clean20-v1` and `runs/clean20-v2` compare the old and new wording on the
same cleaned twenty profiles, using pinned model `jev-1.14.0`. These separate the
prompt change from profile cleanup. They are exploratory single runs, not labelled
validation; a general drop in scores is not itself evidence of better matches.

The expanded sample includes projects seeking art, writing, sound and design,
individual specialists, beginners, and people seeking paid work. It remains within
game development so that shared subject matter alone does not distinguish matches.
Some authors represent their own work within an existing team; team capabilities
are not presented as that individual’s personal skills.
