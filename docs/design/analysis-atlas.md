# Analysis atlas

## Direction

The atlas is a Read surface on the shared projection, operated from the existing
operator page. Preserve Polymind's paper, ink, Helvetica and square functional
controls. Remove decorative chrome. The graph, exact source excerpts and current
analysis finding do the work; there are no controls on the projection.

One dot is one frozen contribution. Lines represent cosine similarity, never
agreement or matching quality. The network uses the union of each contribution's
three nearest neighbours above 0.35; disconnected contributions remain visible.
This is an initial exploratory threshold, not a calibrated confidence measure.
Layout is deterministic and computed locally. Positions are not semantic axes.

Use analysis-v2 finding IDs and source references directly. Findings can overlap;
they are not graph partitions. Node colours show deterministic weighted-modularity
neighbourhoods computed from the similarity edges, independent of analysis findings.
Isolated contributions stay grey. Selecting a finding retains these colours and
highlights its sources with outlines while dimming the remaining nodes.
No extra language-model call or invented cluster labels are required.

## Operation and publication

1. Complete the existing bounded analysis.
2. Choose an explicit OpenAI embedding model and build the atlas from the same
   snapshot. This separate job can fail, retry or recover without blocking analysis.
3. Review the frozen original writing and explicitly approve publication of all
   atlas sources. This is separate from automatic publication of the summary.
4. Select the whole room or an existing finding, then show the atlas. Page through
   source texts with the operator controls. Return to the analysis overview using
   its existing presentation action.

The public atlas uses snapshot-local aliases rather than private contribution or
participant IDs. Names, badges and embeddings are not included. Normal analysis
and personal-perspective payloads retain their existing boundaries. Switching back
to the overview removes original writing from subsequent projection responses;
it cannot retract writing already seen by the audience. The participant notice now
explains possible publication of their original words. Do not use this new release
path for historical writing collected under a promise of non-publication without
appropriate permission.

Provider embeddings are validated and cached privately by model and exact input.
Atlas and matching share the embedding helper. An operation stores its graph and
snapshot hash. The existing journal/job lifecycle handles interruption and retry.
The 0.35 threshold and top-three rule are versioned in atlas-v1. Changing these
requires an explicit future version or configuration rather than silently changing
saved results.

## Verification

`tests/session-atlas.test.ts` checks graph provenance, disconnected sources, invalid
vectors, cache reuse, independent job execution and HTTP publication boundaries.
`show-flow-browser.mjs` exercises build, review, publication, finding selection and
return to the overview with fake providers. It captures projection states at
1280 × 720, 1920 × 1080 and 390 px width. Additional synthetic dense-layout captures
are kept under ignored test-results. No real provider call or venue-readability
claim is part of these checks.
