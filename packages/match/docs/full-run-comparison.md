# Full real-profile comparison — 10 November 2026

## Summary

All 780 pairs among 40 profiles scored successfully. Canonical input hashes and model versions match: only the directional question changed, from support for stated needs (v2) to the user’s “Considering only requirements…” wording (v10). Common instructions, shared inquiry and metric weights are unchanged. No profiles or human labels were altered.

- Raw-sum allocation retains 8 of 20 pairs: 24 people change partners.
- Z-score allocation retains 7 of 20 pairs: 26 people change partners.
- The new raw-sum and z-score allocations are identical; previously they shared 15 of 20 pairs.
- Rechecking reviewed fixtures using this full run gives 7/8. Question 7 stays corrected; question 4 reverses by 0.0225. Earlier three v10 fixture runs passed 8/8, so this fourth observation demonstrates residual variability.

These are single full-graph runs. Some differences may reflect model variation as well as wording. Changes in summed scores do not measure real collaboration quality.

## Score distributions

| Metric | Old mean | New mean | Old median | New median | Mean absolute change |
| --- | ---: | ---: | ---: | ---: | ---: |
| Directional support (1,560 directions) | 0.446 | 0.420 | 0.455 | 0.419 | 0.068 |
| Shared inquiry (780 pairs) | 0.516 | 0.516 | 0.525 | 0.524 | 0.016 |
| Pair sum (780 pairs) | 1.407 | 1.356 | 1.407 | 1.348 | 0.106 |

Average shared inquiry is stable, but individual scores still vary despite its unchanged wording. Directional support falls on average; this is not a uniform reduction.

## Question 7: decomposition

H = hobby writer; partner = either visual-novel developer or professional writer/editor. Scores use the same orientation in every row.

| Pair | Prompt | H → partner | Partner → H | Shared inquiry | Sum |
| --- | --- | ---: | ---: | ---: | ---: |
| Hobby writer + Ren’Py visual-novel hobby developer | Old | 0.705 | 0.810 | 0.825 | 2.340 |
| Hobby writer + Ren’Py visual-novel hobby developer | New | 0.645 | 0.792 | 0.833 | 2.270 |
| Hobby writer + Professional writer and editor seeking hobby collaboration | Old | 0.760 | 0.795 | 0.860 | 2.415 |
| Hobby writer + Professional writer and editor seeking hobby collaboration | New | 0.718 | 0.422 | 0.843 | 1.982 |

The main correction is **professional writer → hobby writer**, falling from 0.795 to 0.423. Developer → hobby writer stays close (0.810 → 0.793). The shared-inquiry scores barely change. The human-preferred pair’s total margin moves from −0.075 to +0.288; 0.355 of that 0.363 swing comes from the partner → hobby writer component.

This supports inspecting components rather than only pair totals. The likely interpretation is less credit for an unrequested benefit from another writer, but the model returns no explanation, so its internal reason is not established.

## Question 4: remaining instability

| Candidate supporting the composer | Old support | New support |
| --- | ---: | ---: |
| Ren’Py visual-novel hobby developer | 0.570 | 0.530 |
| Pianist and hobby game composer | 0.613 | 0.552 |

The developer’s project and the other composer remain close in the model’s directional scores, whereas the human judgement clearly prefers the developer. Passing this comparison in three earlier trials did not establish stability.

## Matches: raw-sum allocation

| Person | Previous partner | New partner | Changed? |
| --- | --- | --- | --- |
| 2D artist learning low-poly 3D | Godot programmer and hobby artist | Godot programmer and hobby artist | No |
| 3D modeller and writer | Unreal programmer seeking artists | GameMaker and JavaScript programmer | Yes |
| 3D prop and environment artist offering game testing | Hobby game team seeking an artist or animator | Hobby game team seeking an artist or animator | No |
| Artist and designer with a fighting-game concept | GameMaker developer and designer seeking an artist | GameMaker developer and designer seeking an artist | No |
| Artist developing a 2D platformer | Multi-engine hobby programmer | Experienced RPG programmer | Yes |
| Artist, writer and designer | Unity prototyper seeking a game designer | Unity prototyper seeking a game designer | No |
| Beginner Godot developer seeking collaborators | Java programmer seeking game-development experience | Java programmer seeking game-development experience | No |
| Beginner pixel animator and low-poly modeller | GameMaker and JavaScript programmer | Experienced programmer with pixel-art skills | Yes |
| Computer science student and aspiring game programmer | Senior software engineer and Unity programmer | Senior software engineer and Unity programmer | No |
| Experienced RPG programmer | Unreal programmer seeking a game concept | Artist developing a 2D platformer | Yes |
| Experienced programmer with pixel-art skills | Junior Unity and Unreal game programmer | Beginner pixel animator and low-poly modeller | Yes |
| Freelance composer for games and film | Programmer with a 3D platformer concept | Hobby composer and pianist | Yes |
| GameMaker and JavaScript programmer | Beginner pixel animator and low-poly modeller | 3D modeller and writer | Yes |
| GameMaker developer and designer seeking an artist | Artist and designer with a fighting-game concept | Artist and designer with a fighting-game concept | No |
| Godot C# developer and test engineer | Godot programmer for short projects | Godot programmer for short projects | No |
| Godot programmer and game generalist | Hobby writer and game-idea creator | Hobby writer and poet | Yes |
| Godot programmer and hobby artist | 2D artist learning low-poly 3D | 2D artist learning low-poly 3D | No |
| Godot programmer for short projects | Godot C# developer and test engineer | Godot C# developer and test engineer | No |
| Godot programmer seeking a hobby partner | MonoGame programmer with an audio-engineering background | Multi-engine hobby programmer | Yes |
| Hobby composer and pianist | Unity C# gameplay programmer | Freelance composer for games and film | Yes |
| Hobby game team seeking an artist or animator | 3D prop and environment artist offering game testing | 3D prop and environment artist offering game testing | No |
| Hobby writer and game-idea creator | Godot programmer and game generalist | Unreal programmer seeking artists | Yes |
| Hobby writer and poet | Professional writer and editor seeking hobby collaboration | Godot programmer and game generalist | Yes |
| Isometric city-builder developer seeking a 2D artist | Top-down RPG developer seeking an artist | Unreal programmer seeking a game concept | Yes |
| Java programmer seeking game-development experience | Beginner Godot developer seeking collaborators | Beginner Godot developer seeking collaborators | No |
| Junior Unity and Unreal game programmer | Experienced programmer with pixel-art skills | MonoGame programmer with an audio-engineering background | Yes |
| Medieval tower-defence hobby developer seeking audio help | Sound designer, composer and audio programmer | Sound designer, composer and audio programmer | No |
| MonoGame programmer with an audio-engineering background | Godot programmer seeking a hobby partner | Junior Unity and Unreal game programmer | Yes |
| Multi-engine hobby programmer | Artist developing a 2D platformer | Godot programmer seeking a hobby partner | Yes |
| Pianist and hobby game composer | Ren’Py visual-novel hobby developer | Programmer with a 3D platformer concept | Yes |
| Professional writer and editor seeking hobby collaboration | Hobby writer and poet | Ren’Py visual-novel hobby developer | Yes |
| Programmer with a 3D platformer concept | Freelance composer for games and film | Pianist and hobby game composer | Yes |
| Ren’Py visual-novel hobby developer | Pianist and hobby game composer | Professional writer and editor seeking hobby collaboration | Yes |
| Senior software engineer and Unity programmer | Computer science student and aspiring game programmer | Computer science student and aspiring game programmer | No |
| Sound designer, composer and audio programmer | Medieval tower-defence hobby developer seeking audio help | Medieval tower-defence hobby developer seeking audio help | No |
| Top-down RPG developer seeking an artist | Isometric city-builder developer seeking a 2D artist | Unity C# gameplay programmer | Yes |
| Unity C# gameplay programmer | Hobby composer and pianist | Top-down RPG developer seeking an artist | Yes |
| Unity prototyper seeking a game designer | Artist, writer and designer | Artist, writer and designer | No |
| Unreal programmer seeking a game concept | Experienced RPG programmer | Isometric city-builder developer seeking a 2D artist | Yes |
| Unreal programmer seeking artists | 3D modeller and writer | Hobby writer and game-idea creator | Yes |

The hobby writer now meets the Godot generalist, whose project needs story and direction. The professional writer now meets the visual-novel developer. These are global assignments: a change elsewhere can alter someone’s partner even if their own pair scores barely change.

## New selected pairs and scores

| A | B | A → B | B → A | Shared inquiry | Sum | Retained from old raw allocation? |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Java programmer seeking game-development experience | Beginner Godot developer seeking collaborators | 0.680 | 0.777 | 0.760 | 2.218 | Yes |
| Computer science student and aspiring game programmer | Senior software engineer and Unity programmer | 0.435 | 0.797 | 0.765 | 1.998 | Yes |
| Top-down RPG developer seeking an artist | Unity C# gameplay programmer | 0.693 | 0.040 | 0.448 | 1.180 | No |
| Artist, writer and designer | Unity prototyper seeking a game designer | 0.805 | 0.882 | 0.790 | 2.478 | Yes |
| Artist and designer with a fighting-game concept | GameMaker developer and designer seeking an artist | 0.833 | 0.875 | 0.637 | 2.345 | Yes |
| Godot programmer and hobby artist | 2D artist learning low-poly 3D | 0.657 | 0.787 | 0.853 | 2.297 | Yes |
| 3D modeller and writer | GameMaker and JavaScript programmer | 0.885 | 0.605 | 0.890 | 2.380 | No |
| MonoGame programmer with an audio-engineering background | Junior Unity and Unreal game programmer | 0.665 | 0.593 | 0.800 | 2.058 | No |
| Experienced RPG programmer | Artist developing a 2D platformer | 0.825 | 0.393 | 0.560 | 1.778 | No |
| Hobby game team seeking an artist or animator | 3D prop and environment artist offering game testing | 0.873 | 0.868 | 0.743 | 2.482 | Yes |
| Hobby writer and poet | Godot programmer and game generalist | 0.860 | 0.825 | 0.802 | 2.487 | No |
| Programmer with a 3D platformer concept | Pianist and hobby game composer | 0.627 | 0.715 | 0.487 | 1.830 | No |
| Godot programmer seeking a hobby partner | Multi-engine hobby programmer | 0.807 | 0.800 | 0.670 | 2.277 | No |
| Experienced programmer with pixel-art skills | Beginner pixel animator and low-poly modeller | 0.835 | 0.780 | 0.902 | 2.518 | No |
| Freelance composer for games and film | Hobby composer and pianist | 0.770 | 0.445 | 0.887 | 2.103 | No |
| Medieval tower-defence hobby developer seeking audio help | Sound designer, composer and audio programmer | 0.715 | 0.980 | 0.807 | 2.502 | Yes |
| Unreal programmer seeking artists | Hobby writer and game-idea creator | 0.670 | 0.427 | 0.695 | 1.792 | No |
| Godot programmer for short projects | Godot C# developer and test engineer | 0.860 | 0.705 | 0.860 | 2.425 | Yes |
| Ren’Py visual-novel hobby developer | Professional writer and editor seeking hobby collaboration | 0.770 | 0.740 | 0.730 | 2.240 | No |
| Isometric city-builder developer seeking a 2D artist | Unreal programmer seeking a game concept | 0.545 | 0.040 | 0.388 | 0.973 | No |

### Matches requiring further review

- A different composer–composer pair is now selected: freelance composer with hobby composer. Its directional scores are 0.770 and 0.445, with shared inquiry 0.888. Both primarily seek projects, so the basis for contribution and shared-inquiry scores deserves examination.
- The lowest-scoring selected pair is the city-builder developer and Unreal programmer: 0.545 / 0.040 / 0.388. The city-builder seeks art; the programmer seeks a designer/artist with a concept. The extremely weak reverse contribution is visible rather than concealed by the sum.
- The RPG developer seeking art is paired with the Unity programmer seeking paid work: 0.693 / 0.040 / 0.448. The RPG developer offers paid art work, not explicitly paid programming. The high first direction may be another over-reading of an offer.

The solver must pair everyone and has no minimum-score constraint. A complete maximum-sum allocation can therefore contain weak or asymmetric pairs. No new constraints were introduced in this comparison.

## Z-score comparison

The new z-score selection equals the new raw-sum selection. These previous z-score pairs are replaced:

- Java programmer seeking game-development experience ↔ Computer science student and aspiring game programmer
- Top-down RPG developer seeking an artist ↔ Isometric city-builder developer seeking a 2D artist
- 3D modeller and writer ↔ Unreal programmer seeking artists
- MonoGame programmer with an audio-engineering background ↔ Godot programmer seeking a hobby partner
- Experienced RPG programmer ↔ Beginner Godot developer seeking collaborators
- Hobby writer and poet ↔ Professional writer and editor seeking hobby collaboration
- Godot programmer and game generalist ↔ Hobby writer and game-idea creator
- Programmer with a 3D platformer concept ↔ Unreal programmer seeking a game concept
- Unity C# gameplay programmer ↔ Senior software engineer and Unity programmer
- Multi-engine hobby programmer ↔ Artist developing a 2D platformer
- Pianist and hobby game composer ↔ Ren’Py visual-novel hobby developer
- Experienced programmer with pixel-art skills ↔ Junior Unity and Unreal game programmer
- GameMaker and JavaScript programmer ↔ Beginner pixel animator and low-poly modeller

### Allocation objectives

| Scoring graph | Old raw allocation total | New raw allocation total |
| --- | ---: | ---: |
| Old graph | 42.413 | 41.417 |
| New graph | 40.612 | 42.360 |

Each solver favours its own allocation under its own graph. Cross-prompt total scores are not directly comparable quality measures.

## Largest directional score movements

### Largest decreases

| Contribution | Old | New | Change |
| --- | ---: | ---: | ---: |
| Freelance composer for games and film → Java programmer seeking game-development experience | 0.723 | 0.210 | -0.513 |
| Professional writer and editor seeking hobby collaboration → Hobby writer and poet | 0.795 | 0.422 | -0.373 |
| Pianist and hobby game composer → Java programmer seeking game-development experience | 0.613 | 0.268 | -0.345 |
| Junior Unity and Unreal game programmer → Experienced programmer with pixel-art skills | 0.570 | 0.230 | -0.340 |
| Junior Unity and Unreal game programmer → Unity prototyper seeking a game designer | 0.575 | 0.245 | -0.330 |
| Isometric city-builder developer seeking a 2D artist → Senior software engineer and Unity programmer | 0.472 | 0.160 | -0.312 |

### Largest increases

| Contribution | Old | New | Change |
| --- | ---: | ---: | ---: |
| Ren’Py visual-novel hobby developer → Isometric city-builder developer seeking a 2D artist | 0.058 | 0.485 | +0.427 |
| Ren’Py visual-novel hobby developer → Medieval tower-defence hobby developer seeking audio help | 0.052 | 0.450 | +0.398 |
| Ren’Py visual-novel hobby developer → GameMaker and JavaScript programmer | 0.163 | 0.522 | +0.360 |
| Ren’Py visual-novel hobby developer → GameMaker developer and designer seeking an artist | 0.255 | 0.578 | +0.323 |
| MonoGame programmer with an audio-engineering background → Professional writer and editor seeking hobby collaboration | 0.395 | 0.713 | +0.318 |
| Godot programmer seeking a hobby partner → Professional writer and editor seeking hobby collaboration | 0.443 | 0.718 | +0.275 |

## API cost

Official pricing checked on 10 November 2026: **US$0.042 per million input tokens; output tokens are free**. [TypeSafe pricing](https://help.typesafe.ai/articles/5187202169-how-much-does-jev-cost).

The new run reports **895,323 input tokens** and **38,220 output tokens** across 780 requests. Each request returns all three metrics. Average input: **1,147.85 tokens per pair**.

| Workload | Estimated API cost (USD) |
| --- | ---: |
| One average pair, all three metrics | $0.00004821 |
| This 40-person run: 780 pairs | $0.03760 |
| 100 people: 4,950 pairs at the same average length | $0.2386 |

Calculated from recorded successful-response usage and the published rate; not verified against the billing account. It excludes any unrecorded retry usage, taxes, introduction generation, hosting and coding-agent work. Actual profiles of a different length change the cost.

## Local artefacts

- Previous complete run: `runs/reddit-v2/`.
- New complete run: `runs/reddit-v10/`.
- New raw allocation: `runs/reddit-v10-allocation.json`.
- New normalised allocation: `runs/reddit-v10-zscore.json`.
- Fixture recheck: `runs/full-v10-fixtures.json`.
- Full machine-readable comparison: `runs/full-v2-v10-comparison.json`.

Scores are expected rubric levels divided by four, not probabilities of useful collaboration. Generated assessments and comparisons remain local and ignored by Git.
