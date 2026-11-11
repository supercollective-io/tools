# Why Jev favours the professional writer — 10 November 2026

This diagnostic tests input order and profile formatting. It does not change the
production prompt, profile facts, labels, or Jev's pinned `jev-1.14.0` model.
It uses the user's existing support preference: the 3D modeller/writer is preferred
over the professional writer/editor for the hobby writer seeking a game team.
The support margin is the preferred candidate's normalised score minus the
alternative's score. A negative margin favours the professional writer.

## Result

Jev favoured the professional writer in all twelve comparisons, under every input
format. The sign did not reverse when candidate positions were swapped.

| Input condition | Three margins | Mean margin |
| --- | --- | ---: |
| Original structured offers/needs | -0.1475, -0.1125, -0.1400 | -0.1333 |
| Person A/B positions swapped within each assessment; support direction preserved | -0.0800, -0.1275, -0.0300 | -0.0792 |
| Same words combined into a labelled profile | -0.1850, -0.1575, -0.1450 | -0.1625 |
| Same words, needs listed before offers | -0.0950, -0.1025, -0.1075 | -0.1017 |

The ordering change moves the mean margin by about 0.054 in the human-preferred
direction, but does not reverse it. Listing needs first also helps somewhat while
leaving the professional writer ahead. Flattening the fields moves the average in
the other direction. Three repeats per condition are too few to separate these
small format effects from Jev's normal variation.

## Likely reason in the text

The professional writer explicitly offers professional writing, editing, and
narrative-structure skills. The recipient seeks to contribute writing to a game
team. Those words are a strong literal skill-to-interest match, so Jev can treat
them as direct support.

The recipient's stated request is narrower: they want a team to join, with writing
as their contribution. The 3D modeller/writer explicitly proposes an equal game
collaboration and describes making small games together. That opportunity is in
that candidate's **needs** field, while the candidate's writing ability appears
in **offers**. The support question asks what the candidate offers towards the
recipient's needs, and Jev may weigh the explicit writing offer more heavily than
the potential team opportunity described under needs.

The user's original explanation also called the preferred candidate a programmer
and artist. The source actually says 3D modelling, some artistic ability, writing,
and some game-engine experience. We should preserve the preference without adding
an unstated programming credential.

## What this shows

Candidate order alone does not explain the result: Jev still favours the professional
writer after positions switch. The serialized offers/needs format is not the sole
cause either. Reformatting the identical facts nudges margins, which suggests some
sensitivity to how the facts are presented, but every tested condition keeps the
same ranking. The simpler prompt addition tested separately also kept that ranking.

These results do **not** reveal Jev's hidden reasoning, establish that the professional
writer is the better match, or prove the 3D modeller/writer should win. The human
preference tests a worthwhile distinction between a useful skill and an opportunity
to join; a focused benchmark with more examples would be needed before changing the
matching method. No further human review is required for this finding.

## Reproduction

```sh
uv run python experiments/writer_input_diagnostics.py
```

The script makes 24 calls: two candidate pairs × four input conditions × three
repeats. Full request/result snapshots are under `runs/writer-input-diagnostics/`
and remain ignored by Git. The source facts are preserved verbatim; the flattened
conditions only change representation and order. The experiment changes neither
production prompt length nor the default rubric.
