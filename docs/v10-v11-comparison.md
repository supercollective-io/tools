# Full v10–v11 comparison — 10 November 2026

## Scope

40 identical real-derived profiles; 780 complete pair assessments per run; pinned model `jev-1.14.0`. Canonical input hashes match. The only prompt edit is the directional question; shared inquiry, common instructions, score labels and allocation weights are unchanged.

- **v10:** Considering only requirements Person B has explicitly asked for, how much can Person A help fulfil Person B’s requests?
- **v11:** Given what Person B already offers, how much additional help can Person A provide towards Person B’s explicit requests?

These are single full-graph runs; score changes include ordinary run-to-run variation as well as possible prompt effects. They are not evidence of real-world collaboration outcomes.

## Allocation overview

| Comparison | Pairs retained / 20 | People with a different partner / 40 |
| --- | ---: | ---: |
| Raw sum, v10 → v11 | 5 | 30 |
| Z-score, v10 → v11 | 5 | 30 |

Within v10, the two allocation modes share 20/20 pairs. Within v11 they share 15/20.

## Score distributions

| Metric | v10 mean | v11 mean | v10 median | v11 median | Mean absolute change |
| --- | ---: | ---: | ---: | ---: | ---: |
| Directional support (1,560 directions) | 0.4198 | 0.4591 | 0.4187 | 0.4825 | 0.0746 |
| Shared inquiry (780 pairs) | 0.5161 | 0.5157 | 0.5237 | 0.5288 | 0.0165 |
| Pair sum (780 pairs) | 1.3557 | 1.4340 | 1.3475 | 1.4525 | 0.1242 |

Do not compare selected-pair totals across prompt versions as if they measured an improvement in real match quality. Shared-inquiry values can also vary even though its question is unchanged.

## Human fixtures rechecked using full-run scores

| Question | v10 outcome | v10 margin | v11 outcome | v11 margin |
| --- | --- | ---: | --- | ---: |
| 1. writer_explicit_cowriting | pass | +0.5150 | pass | +0.5000 |
| 2. writer_seeking_game_team | pass | +0.3700 | pass | +0.0500 |
| 3. composer_project_over_peer | pass | +0.4700 | pass | +0.3775 |
| 4. composer_other_direction | fail | -0.0225 | pass | +0.1550 |
| 5. writer_shared_inquiry | pass | +0.2100 | pass | +0.1875 |
| 6. composer_overall_pair | pass | +0.5100 | pass | +0.5750 |
| 7. writer_overall_pair | pass | +0.2875 | pass | +0.1000 |
| 8. programmer_explicit_peer | pass | +0.6275 | pass | +0.4725 |

v10: {'pass': 7, 'fail': 1, 'tie': 0}. v11: {'pass': 8, 'fail': 0, 'tie': 0}. These checks reuse the full-run scores with no API calls. Question 2 retains the qualitative 'similar' annotation, which rank accuracy alone does not test.

## Question 4: candidate → recipient composer

| Candidate | v10 | v11 |
| --- | ---: | ---: |
| Ren’Py visual-novel hobby developer | 0.5300 | 0.6650 |
| Pianist and hobby game composer | 0.5525 | 0.5100 |

## Question 7: three-component decomposition

H is the hobby writer. The two contribution columns use the same direction in every row.

| Pair | Prompt | H → partner | Partner → H | Shared inquiry | Sum |
| --- | --- | ---: | ---: | ---: | ---: |
| Hobby writer + Ren’Py visual-novel hobby developer | v10 | 0.6450 | 0.7925 | 0.8325 | 2.2700 |
| Hobby writer + Ren’Py visual-novel hobby developer | v11 | 0.7100 | 0.8225 | 0.8300 | 2.3625 |
| Hobby writer + Professional writer and editor seeking hobby collaboration | v10 | 0.7175 | 0.4225 | 0.8425 | 1.9825 |
| Hobby writer + Professional writer and editor seeking hobby collaboration | v11 | 0.6475 | 0.7725 | 0.8425 | 2.2625 |

## Why writer–writer is selected despite fixture 7 passing

The hobby writer and professional writer are paired again. This does not contradict
the preferred writer–developer pair score in fixture 7: the allocation optimises
all participants together. For these four people, the actual scores are:

| Arrangement | Pair 1 sum | Pair 2 sum | Combined |
| --- | ---: | ---: | ---: |
| Writers together; developer + sound designer | 2.2625 | 2.4575 | 4.7200 |
| Hobby writer + developer; professional writer + sound designer | 2.3625 | 0.8025 | 3.1650 |

The second arrangement improves the hobby writer’s individual pair but substantially
weakens the other pair. This is a local illustration of the global trade-off, not a
new human quality judgement or an instruction to change fixture 7.

The old composer–composer pairing is no longer selected: the hobby composer now
meets the tower-defence developer, and the freelance composer meets the programmer
with a 3D platformer concept. The low-scoring pair of two developers seeking art
remains worth reviewing: support is 0.5225 in one direction and 0.1350 in the other.

## Every raw-sum partner change

| Person | v10 partner | v11 partner | Changed? |
| --- | --- | --- | --- |
| 2D artist learning low-poly 3D | Godot programmer and hobby artist | Unreal programmer seeking a game concept | Yes |
| 3D modeller and writer | GameMaker and JavaScript programmer | Unreal programmer seeking artists | Yes |
| 3D prop and environment artist offering game testing | Hobby game team seeking an artist or animator | Hobby game team seeking an artist or animator | No |
| Artist and designer with a fighting-game concept | GameMaker developer and designer seeking an artist | GameMaker developer and designer seeking an artist | No |
| Artist developing a 2D platformer | Experienced RPG programmer | Experienced RPG programmer | No |
| Artist, writer and designer | Unity prototyper seeking a game designer | Unity prototyper seeking a game designer | No |
| Beginner Godot developer seeking collaborators | Java programmer seeking game-development experience | Godot programmer and hobby artist | Yes |
| Beginner pixel animator and low-poly modeller | Experienced programmer with pixel-art skills | Junior Unity and Unreal game programmer | Yes |
| Computer science student and aspiring game programmer | Senior software engineer and Unity programmer | Java programmer seeking game-development experience | Yes |
| Experienced RPG programmer | Artist developing a 2D platformer | Artist developing a 2D platformer | No |
| Experienced programmer with pixel-art skills | Beginner pixel animator and low-poly modeller | GameMaker and JavaScript programmer | Yes |
| Freelance composer for games and film | Hobby composer and pianist | Programmer with a 3D platformer concept | Yes |
| GameMaker and JavaScript programmer | 3D modeller and writer | Experienced programmer with pixel-art skills | Yes |
| GameMaker developer and designer seeking an artist | Artist and designer with a fighting-game concept | Artist and designer with a fighting-game concept | No |
| Godot C# developer and test engineer | Godot programmer for short projects | Godot programmer for short projects | No |
| Godot programmer and game generalist | Hobby writer and poet | Hobby writer and game-idea creator | Yes |
| Godot programmer and hobby artist | 2D artist learning low-poly 3D | Beginner Godot developer seeking collaborators | Yes |
| Godot programmer for short projects | Godot C# developer and test engineer | Godot C# developer and test engineer | No |
| Godot programmer seeking a hobby partner | Multi-engine hobby programmer | MonoGame programmer with an audio-engineering background | Yes |
| Hobby composer and pianist | Freelance composer for games and film | Medieval tower-defence hobby developer seeking audio help | Yes |
| Hobby game team seeking an artist or animator | 3D prop and environment artist offering game testing | 3D prop and environment artist offering game testing | No |
| Hobby writer and game-idea creator | Unreal programmer seeking artists | Godot programmer and game generalist | Yes |
| Hobby writer and poet | Godot programmer and game generalist | Professional writer and editor seeking hobby collaboration | Yes |
| Isometric city-builder developer seeking a 2D artist | Unreal programmer seeking a game concept | Top-down RPG developer seeking an artist | Yes |
| Java programmer seeking game-development experience | Beginner Godot developer seeking collaborators | Computer science student and aspiring game programmer | Yes |
| Junior Unity and Unreal game programmer | MonoGame programmer with an audio-engineering background | Beginner pixel animator and low-poly modeller | Yes |
| Medieval tower-defence hobby developer seeking audio help | Sound designer, composer and audio programmer | Hobby composer and pianist | Yes |
| MonoGame programmer with an audio-engineering background | Junior Unity and Unreal game programmer | Godot programmer seeking a hobby partner | Yes |
| Multi-engine hobby programmer | Godot programmer seeking a hobby partner | Pianist and hobby game composer | Yes |
| Pianist and hobby game composer | Programmer with a 3D platformer concept | Multi-engine hobby programmer | Yes |
| Professional writer and editor seeking hobby collaboration | Ren’Py visual-novel hobby developer | Hobby writer and poet | Yes |
| Programmer with a 3D platformer concept | Pianist and hobby game composer | Freelance composer for games and film | Yes |
| Ren’Py visual-novel hobby developer | Professional writer and editor seeking hobby collaboration | Sound designer, composer and audio programmer | Yes |
| Senior software engineer and Unity programmer | Computer science student and aspiring game programmer | Unity C# gameplay programmer | Yes |
| Sound designer, composer and audio programmer | Medieval tower-defence hobby developer seeking audio help | Ren’Py visual-novel hobby developer | Yes |
| Top-down RPG developer seeking an artist | Unity C# gameplay programmer | Isometric city-builder developer seeking a 2D artist | Yes |
| Unity C# gameplay programmer | Top-down RPG developer seeking an artist | Senior software engineer and Unity programmer | Yes |
| Unity prototyper seeking a game designer | Artist, writer and designer | Artist, writer and designer | No |
| Unreal programmer seeking a game concept | Isometric city-builder developer seeking a 2D artist | 2D artist learning low-poly 3D | Yes |
| Unreal programmer seeking artists | Hobby writer and game-idea creator | 3D modeller and writer | Yes |

Global optimisation means a person can change partner because of changes elsewhere in the graph, not just their own strongest score.

## New raw-sum pairs

| A | B | A → B | B → A | Shared | v11 sum | Same pair’s v10 sum |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Java programmer seeking game-development experience | Computer science student and aspiring game programmer | 0.5525 | 0.7475 | 0.7550 | 2.0550 | 2.1975 |
| Top-down RPG developer seeking an artist | Isometric city-builder developer seeking a 2D artist | 0.5225 | 0.1350 | 0.6975 | 1.3550 | 1.1000 |
| Artist, writer and designer | Unity prototyper seeking a game designer | 0.7575 | 0.8725 | 0.7650 | 2.3950 | 2.4775 |
| Artist and designer with a fighting-game concept | GameMaker developer and designer seeking an artist | 0.7925 | 0.8625 | 0.6475 | 2.3025 | 2.3450 |
| Godot programmer and hobby artist | Beginner Godot developer seeking collaborators | 0.6825 | 0.6425 | 0.7425 | 2.0675 | 2.2375 |
| 3D modeller and writer | Unreal programmer seeking artists | 0.8875 | 0.7325 | 0.8275 | 2.4475 | 2.2875 |
| MonoGame programmer with an audio-engineering background | Godot programmer seeking a hobby partner | 0.7000 | 0.7050 | 0.6025 | 2.0075 | 1.7550 |
| Experienced RPG programmer | Artist developing a 2D platformer | 0.9050 | 0.3300 | 0.5550 | 1.7900 | 1.7775 |
| Hobby game team seeking an artist or animator | 3D prop and environment artist offering game testing | 0.8550 | 0.8800 | 0.7300 | 2.4650 | 2.4825 |
| Hobby writer and poet | Professional writer and editor seeking hobby collaboration | 0.6475 | 0.7725 | 0.8425 | 2.2625 | 1.9825 |
| Godot programmer and game generalist | Hobby writer and game-idea creator | 0.8675 | 0.7375 | 0.6500 | 2.2550 | 2.2150 |
| Programmer with a 3D platformer concept | Freelance composer for games and film | 0.4625 | 0.7375 | 0.5725 | 1.7725 | 2.0875 |
| Unity C# gameplay programmer | Senior software engineer and Unity programmer | 0.7175 | 0.2700 | 0.4750 | 1.4625 | 1.3875 |
| Multi-engine hobby programmer | Pianist and hobby game composer | 0.6425 | 0.7375 | 0.6575 | 2.0375 | 1.9925 |
| Experienced programmer with pixel-art skills | GameMaker and JavaScript programmer | 0.6875 | 0.5475 | 0.9375 | 2.1725 | 2.2700 |
| Medieval tower-defence hobby developer seeking audio help | Hobby composer and pianist | 0.7700 | 0.9200 | 0.7725 | 2.4625 | 2.3525 |
| Godot programmer for short projects | Godot C# developer and test engineer | 0.8000 | 0.7225 | 0.8550 | 2.3775 | 2.4250 |
| Junior Unity and Unreal game programmer | Beginner pixel animator and low-poly modeller | 0.7950 | 0.6625 | 0.7750 | 2.2325 | 2.1450 |
| Ren’Py visual-novel hobby developer | Sound designer, composer and audio programmer | 0.7550 | 0.9575 | 0.7450 | 2.4575 | 2.4825 |
| Unreal programmer seeking a game concept | 2D artist learning low-poly 3D | 0.7125 | 0.4575 | 0.3950 | 1.5650 | 1.4125 |

## Z-score allocation differences

### Only in the new raw-sum allocation

- Java programmer seeking game-development experience ↔ Computer science student and aspiring game programmer
- Godot programmer and hobby artist ↔ Beginner Godot developer seeking collaborators
- MonoGame programmer with an audio-engineering background ↔ Godot programmer seeking a hobby partner
- Experienced RPG programmer ↔ Artist developing a 2D platformer
- Unreal programmer seeking a game concept ↔ 2D artist learning low-poly 3D

### Only in the new z-score allocation

- Java programmer seeking game-development experience ↔ Artist developing a 2D platformer
- Computer science student and aspiring game programmer ↔ Godot programmer seeking a hobby partner
- Godot programmer and hobby artist ↔ 2D artist learning low-poly 3D
- MonoGame programmer with an audio-engineering background ↔ Unreal programmer seeking a game concept
- Experienced RPG programmer ↔ Beginner Godot developer seeking collaborators

### Previous z-score pairs replaced

- Java programmer seeking game-development experience ↔ Beginner Godot developer seeking collaborators
- Computer science student and aspiring game programmer ↔ Senior software engineer and Unity programmer
- Top-down RPG developer seeking an artist ↔ Unity C# gameplay programmer
- 3D modeller and writer ↔ GameMaker and JavaScript programmer
- MonoGame programmer with an audio-engineering background ↔ Junior Unity and Unreal game programmer
- Experienced RPG programmer ↔ Artist developing a 2D platformer
- Hobby writer and poet ↔ Godot programmer and game generalist
- Programmer with a 3D platformer concept ↔ Pianist and hobby game composer
- Godot programmer seeking a hobby partner ↔ Multi-engine hobby programmer
- Experienced programmer with pixel-art skills ↔ Beginner pixel animator and low-poly modeller
- Freelance composer for games and film ↔ Hobby composer and pianist
- Medieval tower-defence hobby developer seeking audio help ↔ Sound designer, composer and audio programmer
- Unreal programmer seeking artists ↔ Hobby writer and game-idea creator
- Ren’Py visual-novel hobby developer ↔ Professional writer and editor seeking hobby collaboration
- Isometric city-builder developer seeking a 2D artist ↔ Unreal programmer seeking a game concept

## Largest contribution decreases

| Direction | v10 | v11 | Change |
| --- | ---: | ---: | ---: |
| Ren’Py visual-novel hobby developer → Artist developing a 2D platformer | 0.4550 | 0.0875 | -0.3675 |
| Ren’Py visual-novel hobby developer → GameMaker developer and designer seeking an artist | 0.5775 | 0.2350 | -0.3425 |
| Unreal programmer seeking artists → Godot programmer seeking a hobby partner | 0.5700 | 0.2325 | -0.3375 |
| GameMaker and JavaScript programmer → GameMaker developer and designer seeking an artist | 0.6100 | 0.3550 | -0.2550 |
| GameMaker and JavaScript programmer → Godot programmer and hobby artist | 0.6525 | 0.4300 | -0.2225 |
| Isometric city-builder developer seeking a 2D artist → Artist and designer with a fighting-game concept | 0.2875 | 0.0650 | -0.2225 |

## Largest contribution increases

| Direction | v10 | v11 | Change |
| --- | ---: | ---: | ---: |
| Freelance composer for games and film → Java programmer seeking game-development experience | 0.2100 | 0.5825 | +0.3725 |
| Professional writer and editor seeking hobby collaboration → Hobby writer and poet | 0.4225 | 0.7725 | +0.3500 |
| Professional writer and editor seeking hobby collaboration → Experienced RPG programmer | 0.1250 | 0.4525 | +0.3275 |
| Professional writer and editor seeking hobby collaboration → Computer science student and aspiring game programmer | 0.1650 | 0.4850 | +0.3200 |
| Unity C# gameplay programmer → Freelance composer for games and film | 0.1825 | 0.4950 | +0.3125 |
| Professional writer and editor seeking hobby collaboration → Junior Unity and Unreal game programmer | 0.2675 | 0.5775 | +0.3100 |

## Allocation objective check

| Scoring graph | v10 raw allocation total | v11 raw allocation total |
| --- | ---: | ---: |
| v10 | 42.3600 | 41.4125 |
| v11 | 41.2450 | 41.9425 |

Under the v11 scoring graph, changing the allocation gains 0.6975 total points
over retaining the old allocation (about 1.7%), despite 30 people changing partners.
This indicates that large partner turnover need not imply a large objective gain.

The solver maximises total score and pairs everyone. Weak or asymmetric pairings can remain; no threshold or redundancy penalty was added.

## Artefacts

- `runs/reddit-v11/`: immutable run manifest and all 780 responses.
- `runs/reddit-v11-allocation.json`: raw-sum allocation.
- `runs/reddit-v11-zscore.json`: normalised allocation.
- `runs/full-v11-fixtures.json`: human-fixture check from the full run.
- `runs/full-v10-v11-comparison.json`: every pair’s old and new scores.

All original runs remain intact. Raw responses, distributions, confidence and actual model version are preserved. Generated runs and comparisons remain local and ignored by Git.
