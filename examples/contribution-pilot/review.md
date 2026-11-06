# Prepared contribution pilot

Status: prepared; no model calls or contributions.

Bundle fingerprint: `b1422d0e2867768ce4b99223f137e6fd6f09a34a8a8286ac5c520d80984765c2`

Model: `openai/gpt-6.1-terra`. Assignment seed: 20261105.

## Invitation

> What is something you’d like to change, but can’t change on your own?

Optional supporting prompts:

> What would you like to be different?

> What would you need to make that change?

## Assignment counts

Counts are design choices, not audience estimates. The pilot is selected for coverage, not proportional sampling.

| Dimension / option               | Target in 64 | Assigned in 64 | Pilot 8 |
| -------------------------------- | -----------: | -------------: | ------: |
| interpretation / personal        |            4 |              4 |       1 |
| interpretation / relationship    |            4 |              4 |       1 |
| interpretation / shared-practice |           12 |             12 |       1 |
| interpretation / institution     |            8 |              8 |       1 |
| interpretation / cultural        |           12 |             12 |       3 |
| interpretation / systemic        |           16 |             16 |       1 |
| interpretation / open            |            8 |              8 |       0 |
| scale / intimate                 |            4 |              4 |       1 |
| scale / household                |            4 |              4 |       1 |
| scale / group                    |            8 |              8 |       1 |
| scale / local                    |            8 |              8 |       1 |
| scale / national                 |           16 |             16 |       2 |
| scale / global                   |           16 |             16 |       2 |
| scale / open                     |            8 |              8 |       0 |
| relationship / affected          |           24 |             24 |       4 |
| relationship / observer          |            8 |              8 |       1 |
| relationship / implicated        |            8 |              8 |       1 |
| relationship / already-trying    |            8 |              8 |       1 |
| relationship / beneficiary       |            8 |              8 |       1 |
| relationship / open              |            8 |              8 |       0 |
| agency / organise                |           12 |             12 |       1 |
| agency / contribute              |           16 |             16 |       2 |
| agency / delegate                |           12 |             12 |       1 |
| agency / need-support            |            8 |              8 |       1 |
| agency / sceptical               |            8 |              8 |       2 |
| agency / open                    |            8 |              8 |       1 |
| clarity / proposal               |           12 |             12 |       2 |
| clarity / wish                   |           20 |             20 |       1 |
| clarity / unsettled              |           16 |             16 |       3 |
| clarity / conflicted             |            8 |              8 |       2 |
| clarity / open                   |            8 |              8 |       0 |
| tone / hopeful                   |           12 |             12 |       2 |
| tone / irritated                 |           12 |             12 |       1 |
| tone / dry                       |            8 |              8 |       1 |
| tone / weary                     |            8 |              8 |       1 |
| tone / warm                      |            8 |              8 |       1 |
| tone / matter-of-fact            |            8 |              8 |       1 |
| tone / mixed                     |            4 |              4 |       0 |
| tone / open                      |            4 |              4 |       1 |
| form / anecdote                  |           16 |             16 |       2 |
| form / direct                    |           16 |             16 |       2 |
| form / reflection                |            8 |              8 |       2 |
| form / question                  |            8 |              8 |       1 |
| form / practical                 |            8 |              8 |       1 |
| form / digressive                |            4 |              4 |       0 |
| form / open                      |            4 |              4 |       0 |
| register / plain                 |           36 |             36 |       5 |
| register / technical             |            8 |              8 |       2 |
| register / political             |            8 |              8 |       0 |
| register / open                  |           12 |             12 |       1 |
| fluency / fluent                 |           32 |             32 |       4 |
| fluency / searching              |           16 |             16 |       2 |
| fluency / open                   |           16 |             16 |       2 |
| rhythm / compact                 |           16 |             16 |       1 |
| rhythm / flowing                 |           20 |             20 |       4 |
| rhythm / revising                |           16 |             16 |       2 |
| rhythm / open                    |           12 |             12 |       1 |
| length / brief                   |           16 |             16 |       1 |
| length / typical                 |           32 |             32 |       4 |
| length / expansive               |           16 |             16 |       3 |
| abstraction / concrete           |           24 |             24 |       3 |
| abstraction / mixed              |           24 |             24 |       3 |
| abstraction / broad              |           16 |             16 |       2 |

## Pair coverage

Repeated-pair score: 7609 → 6730. Lower means fewer repeated pairings, not more human realism.

Full pair counts, situations, slots and nested 8/16/32/64 subsets are in bundle.json. Constraints prevent some combinations; the search does not promise an optimum.

## Pilot slots

### p002

Situation: digital.

```json
{
  "invitation": {
    "main": "What is something you’d like to change, but can’t change on your own?",
    "optionalSupporting": [
      "What would you like to be different?",
      "What would you need to make that change?"
    ]
  },
  "privateCircumstances": "Digital tools are part of how you keep in touch or get things done. Your feelings about them are not predetermined.",
  "privateDirections": [
    {
      "dimension": "Interpretation",
      "direction": "A change in an expectation, norm or cultural practice."
    },
    {
      "dimension": "Scale",
      "direction": "Address a society-wide or national political concern, rather than reducing it to a local problem."
    },
    {
      "dimension": "Relationship to the issue",
      "direction": "Something about the current situation also benefits you."
    },
    {
      "dimension": "Relationship to acting with others",
      "direction": "You would prefer someone with responsibility or expertise to act."
    },
    {
      "dimension": "Clarity",
      "direction": "You want things that do not fit together easily."
    },
    {
      "dimension": "Emotional tone",
      "direction": "You sound a little weary of the situation."
    },
    {
      "dimension": "Way of answering",
      "direction": "You tend to explore the issue through questions."
    },
    {
      "dimension": "Vocabulary",
      "direction": "Use mostly everyday vocabulary."
    },
    {
      "dimension": "English fluency",
      "direction": "You are comfortable expressing yourself in English."
    },
    {
      "dimension": "Speaking rhythm",
      "direction": "Your speech tends to flow through connected thoughts."
    },
    {
      "dimension": "Loose length guide",
      "direction": "Roughly 140–180 words may suit this contribution."
    },
    {
      "dimension": "Level of abstraction",
      "direction": "Express a broad concern, value or wish. It can remain general; no personal anecdote, concrete project or practical solution is required."
    }
  ]
}
```

### p031

Situation: home.

```json
{
  "invitation": {
    "main": "What is something you’d like to change, but can’t change on your own?",
    "optionalSupporting": [
      "What would you like to be different?",
      "What would you need to make that change?"
    ]
  },
  "privateCircumstances": "You live with other adults and have some recurring responsibilities at home.",
  "privateDirections": [
    {
      "dimension": "Interpretation",
      "direction": "A change in an expectation, norm or cultural practice."
    },
    {
      "dimension": "Scale",
      "direction": "A neighbourhood, town or local network is the relevant scale."
    },
    {
      "dimension": "Relationship to the issue",
      "direction": "You have already tried something, without settling the issue."
    },
    {
      "dimension": "Relationship to acting with others",
      "direction": "You would be willing to help organise a change."
    },
    {
      "dimension": "Clarity",
      "direction": "You know what you want to be different but not how to get there."
    },
    {
      "dimension": "Emotional tone",
      "direction": "You speak in a matter-of-fact way."
    },
    {
      "dimension": "Way of answering",
      "direction": "You tend to start with something that happened."
    },
    {
      "dimension": "Vocabulary",
      "direction": "Choose the vocabulary that fits this person."
    },
    {
      "dimension": "English fluency",
      "direction": "You sometimes search for a word or rephrase in English; keep it natural, without accent spelling or manufactured errors."
    },
    {
      "dimension": "Speaking rhythm",
      "direction": "You sometimes revise what you just said."
    },
    {
      "dimension": "Loose length guide",
      "direction": "Roughly 110–150 words may suit this contribution."
    },
    {
      "dimension": "Level of abstraction",
      "direction": "Focus on a specific situation or desired change."
    }
  ]
}
```

### p025

Situation: neighbourhood.

```json
{
  "invitation": {
    "main": "What is something you’d like to change, but can’t change on your own?",
    "optionalSupporting": [
      "What would you like to be different?",
      "What would you need to make that change?"
    ]
  },
  "privateCircumstances": "You live in a neighbourhood where you know some people and do not know many others.",
  "privateDirections": [
    {
      "dimension": "Interpretation",
      "direction": "A change in how people do something together."
    },
    {
      "dimension": "Scale",
      "direction": "Address a global or transnational concern, rather than reducing it to an individual habit."
    },
    {
      "dimension": "Relationship to the issue",
      "direction": "You are directly affected by the situation."
    },
    {
      "dimension": "Relationship to acting with others",
      "direction": "You could contribute something, without taking on organising."
    },
    {
      "dimension": "Clarity",
      "direction": "You are still working out what bothers you or what you want."
    },
    {
      "dimension": "Emotional tone",
      "direction": "There is some hope in how you speak."
    },
    {
      "dimension": "Way of answering",
      "direction": "You tend to get straight to what you want to change."
    },
    {
      "dimension": "Vocabulary",
      "direction": "You have relevant specialist vocabulary available; use only what fits."
    },
    {
      "dimension": "English fluency",
      "direction": "Choose the level of fluency independently of the person's knowledge."
    },
    {
      "dimension": "Speaking rhythm",
      "direction": "You sometimes revise what you just said."
    },
    {
      "dimension": "Loose length guide",
      "direction": "Roughly 110–150 words may suit this contribution."
    },
    {
      "dimension": "Level of abstraction",
      "direction": "Express a broad concern, value or wish. It can remain general; no personal anecdote, concrete project or practical solution is required."
    }
  ]
}
```

### p021

Situation: small-business.

```json
{
  "invitation": {
    "main": "What is something you’d like to change, but can’t change on your own?",
    "optionalSupporting": [
      "What would you like to be different?",
      "What would you need to make that change?"
    ]
  },
  "privateCircumstances": "You help keep a small business or independent practice going and make decisions that affect others.",
  "privateDirections": [
    {
      "dimension": "Interpretation",
      "direction": "A change in an expectation, norm or cultural practice."
    },
    {
      "dimension": "Scale",
      "direction": "The concern is at the level of a personal relationship."
    },
    {
      "dimension": "Relationship to the issue",
      "direction": "You are directly affected by the situation."
    },
    {
      "dimension": "Relationship to acting with others",
      "direction": "You would need support before being able to act."
    },
    {
      "dimension": "Clarity",
      "direction": "You have a fairly specific idea of what could change."
    },
    {
      "dimension": "Emotional tone",
      "direction": "You sound irritated, without needing a dramatic grievance."
    },
    {
      "dimension": "Way of answering",
      "direction": "You tend to explain practical details."
    },
    {
      "dimension": "Vocabulary",
      "direction": "Use mostly everyday vocabulary."
    },
    {
      "dimension": "English fluency",
      "direction": "You sometimes search for a word or rephrase in English; keep it natural, without accent spelling or manufactured errors."
    },
    {
      "dimension": "Speaking rhythm",
      "direction": "Let the rhythm emerge without adding compulsory hesitations."
    },
    {
      "dimension": "Loose length guide",
      "direction": "Roughly 90–120 words may suit this contribution."
    },
    {
      "dimension": "Level of abstraction",
      "direction": "Move between a wider concern and particular experiences or possibilities."
    }
  ]
}
```

### p030

Situation: learning.

```json
{
  "invitation": {
    "main": "What is something you’d like to change, but can’t change on your own?",
    "optionalSupporting": [
      "What would you like to be different?",
      "What would you need to make that change?"
    ]
  },
  "privateCircumstances": "You are learning something alongside other commitments and have differing amounts of confidence in different settings.",
  "privateDirections": [
    {
      "dimension": "Interpretation",
      "direction": "A change in your own habits or capacities that involves other people."
    },
    {
      "dimension": "Scale",
      "direction": "The concern is at the level of a household or home."
    },
    {
      "dimension": "Relationship to the issue",
      "direction": "You are directly affected by the situation."
    },
    {
      "dimension": "Relationship to acting with others",
      "direction": "You doubt whether acting with a group would help."
    },
    {
      "dimension": "Clarity",
      "direction": "You are still working out what bothers you or what you want."
    },
    {
      "dimension": "Emotional tone",
      "direction": "You speak with warmth or affection for someone or something involved."
    },
    {
      "dimension": "Way of answering",
      "direction": "You tend to get straight to what you want to change."
    },
    {
      "dimension": "Vocabulary",
      "direction": "Use mostly everyday vocabulary."
    },
    {
      "dimension": "English fluency",
      "direction": "You are comfortable expressing yourself in English."
    },
    {
      "dimension": "Speaking rhythm",
      "direction": "Your sentences tend to be compact."
    },
    {
      "dimension": "Loose length guide",
      "direction": "Roughly 140–180 words may suit this contribution."
    },
    {
      "dimension": "Level of abstraction",
      "direction": "Focus on a specific situation or desired change."
    }
  ]
}
```

### p051

Situation: mobility.

```json
{
  "invitation": {
    "main": "What is something you’d like to change, but can’t change on your own?",
    "optionalSupporting": [
      "What would you like to be different?",
      "What would you need to make that change?"
    ]
  },
  "privateCircumstances": "Your ordinary journeys involve both your own choices and arrangements made by others.",
  "privateDirections": [
    {
      "dimension": "Interpretation",
      "direction": "A change in wider material or social conditions."
    },
    {
      "dimension": "Scale",
      "direction": "Address a society-wide or national political concern, rather than reducing it to a local problem."
    },
    {
      "dimension": "Relationship to the issue",
      "direction": "Your own behaviour contributes to the situation in some way."
    },
    {
      "dimension": "Relationship to acting with others",
      "direction": "You doubt whether acting with a group would help."
    },
    {
      "dimension": "Clarity",
      "direction": "You are still working out what bothers you or what you want."
    },
    {
      "dimension": "Emotional tone",
      "direction": "Let the tone emerge from the answer."
    },
    {
      "dimension": "Way of answering",
      "direction": "You tend to reflect on a broader idea."
    },
    {
      "dimension": "Vocabulary",
      "direction": "You have relevant specialist vocabulary available; use only what fits."
    },
    {
      "dimension": "English fluency",
      "direction": "You are comfortable expressing yourself in English."
    },
    {
      "dimension": "Speaking rhythm",
      "direction": "Your speech tends to flow through connected thoughts."
    },
    {
      "dimension": "Loose length guide",
      "direction": "Roughly 110–150 words may suit this contribution."
    },
    {
      "dimension": "Level of abstraction",
      "direction": "Move between a wider concern and particular experiences or possibilities."
    }
  ]
}
```

### p012

Situation: open.

```json
{
  "invitation": {
    "main": "What is something you’d like to change, but can’t change on your own?",
    "optionalSupporting": [
      "What would you like to be different?",
      "What would you need to make that change?"
    ]
  },
  "privateCircumstances": "Choose the person's circumstances; do not assume a particular issue.",
  "privateDirections": [
    {
      "dimension": "Interpretation",
      "direction": "A change in an organisation's decisions or arrangements."
    },
    {
      "dimension": "Scale",
      "direction": "A group, workplace or organisation is the relevant scale."
    },
    {
      "dimension": "Relationship to the issue",
      "direction": "You have noticed the situation affecting people around you."
    },
    {
      "dimension": "Relationship to acting with others",
      "direction": "Leave your willingness or role open if that fits."
    },
    {
      "dimension": "Clarity",
      "direction": "You have a fairly specific idea of what could change."
    },
    {
      "dimension": "Emotional tone",
      "direction": "There is some hope in how you speak."
    },
    {
      "dimension": "Way of answering",
      "direction": "You tend to reflect on a broader idea."
    },
    {
      "dimension": "Vocabulary",
      "direction": "Use mostly everyday vocabulary."
    },
    {
      "dimension": "English fluency",
      "direction": "Choose the level of fluency independently of the person's knowledge."
    },
    {
      "dimension": "Speaking rhythm",
      "direction": "Your speech tends to flow through connected thoughts."
    },
    {
      "dimension": "Loose length guide",
      "direction": "Roughly 110–150 words may suit this contribution."
    },
    {
      "dimension": "Level of abstraction",
      "direction": "Focus on a specific situation or desired change."
    }
  ]
}
```

### p032

Situation: culture.

```json
{
  "invitation": {
    "main": "What is something you’d like to change, but can’t change on your own?",
    "optionalSupporting": [
      "What would you like to be different?",
      "What would you need to make that change?"
    ]
  },
  "privateCircumstances": "You sometimes take part in a cultural activity with others, but it is not your whole identity.",
  "privateDirections": [
    {
      "dimension": "Interpretation",
      "direction": "A change in a relationship between people."
    },
    {
      "dimension": "Scale",
      "direction": "Address a global or transnational concern, rather than reducing it to an individual habit."
    },
    {
      "dimension": "Relationship to the issue",
      "direction": "You are directly affected by the situation."
    },
    {
      "dimension": "Relationship to acting with others",
      "direction": "You could contribute something, without taking on organising."
    },
    {
      "dimension": "Clarity",
      "direction": "You want things that do not fit together easily."
    },
    {
      "dimension": "Emotional tone",
      "direction": "There is room for understated or dry humour."
    },
    {
      "dimension": "Way of answering",
      "direction": "You tend to start with something that happened."
    },
    {
      "dimension": "Vocabulary",
      "direction": "Use mostly everyday vocabulary."
    },
    {
      "dimension": "English fluency",
      "direction": "You are comfortable expressing yourself in English."
    },
    {
      "dimension": "Speaking rhythm",
      "direction": "Your speech tends to flow through connected thoughts."
    },
    {
      "dimension": "Loose length guide",
      "direction": "Roughly 140–180 words may suit this contribution."
    },
    {
      "dimension": "Level of abstraction",
      "direction": "Move between a wider concern and particular experiences or possibilities."
    }
  ]
}
```

## Common authoring instruction

```text
Write one fictional person's spoken answer to the invitation, in English. They are answering on the spot, without preparing what to say.
Use the assignments as background, not a checklist. “Open” means you choose. Their circumstances need not be their topic.
Let them discover what they mean while speaking. They may start generally and find a focus, move between concerns, revise a thought or leave it unresolved. Others may already know what they want to say. Preserve that variation rather than giving everyone a polished argument or decorative hesitations.
Aim for about one minute, using the assigned length as a loose guide. Return only their words.
```
