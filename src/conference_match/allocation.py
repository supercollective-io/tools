"""Global one-to-one allocation from saved assessments, without model calls."""

import math
from itertools import combinations
from statistics import mean, pstdev
from typing import Literal

import networkx as nx

from conference_match.models import METRICS, Assessment, Event, Record


class Distribution(Record):
    mean: float
    standard_deviation: float
    count: int

    @classmethod
    def of(cls, values: list[float]) -> "Distribution":
        return cls(mean=mean(values), standard_deviation=pstdev(values), count=len(values))

    def standardise(self, value: float) -> float:
        if self.standard_deviation == 0:
            return 0.0
        return (value - self.mean) / self.standard_deviation


class SelectedPair(Record):
    a: str
    b: str
    a_name: str
    b_name: str
    raw_scores: dict[str, float]
    transformed_scores: dict[str, float]
    weight: float


class Allocation(Record):
    normalisation: Literal["none", "zscore"]
    statistics: dict[str, Distribution]
    pairs: list[SelectedPair]
    total_weight: float
    mean_weight: float
    minimum_weight: float


def allocate(
    event: Event, assessments: list[Assessment], normalisation: str = "none"
) -> Allocation:
    if normalisation not in ("none", "zscore"):
        raise ValueError("Normalisation must be none or zscore")
    ids = sorted(p.id for p in event.participants)
    if len(ids) % 2:
        raise ValueError("Allocation requires an even participant count; trios are not supported")
    expected = set(combinations(ids, 2))
    lookup = {(min(r.a, r.b), max(r.a, r.b)): r for r in assessments}
    if set(lookup) != expected or len(assessments) != len(expected):
        raise ValueError("Allocation requires exactly one assessment for every pair")
    ordered = [lookup[key] for key in sorted(lookup)]
    statistics = {
        "relevance": Distribution.of(
            [r.metrics[key].normalised for r in ordered for key in ("a_to_b", "b_to_a")]
        ),
        "shared_inquiry": Distribution.of(
            [r.metrics["shared_inquiry"].normalised for r in ordered]
        ),
    }
    graph = nx.Graph()
    graph.add_nodes_from(ids)
    scored: dict[tuple[str, str], tuple[dict[str, float], float]] = {}
    for key in sorted(lookup):
        raw = lookup[key].components
        transformed = {
            metric: statistics[
                "shared_inquiry" if metric == "shared_inquiry" else "relevance"
            ].standardise(raw[metric])
            if normalisation == "zscore"
            else raw[metric]
            for metric in METRICS
        }
        weight = math.fsum(transformed.values())
        scored[key] = transformed, weight
        graph.add_edge(*key, weight=weight)
    matches = nx.max_weight_matching(graph, maxcardinality=True, weight="weight")
    paired_ids = [node for pair in matches for node in pair]
    if len(paired_ids) != len(ids) or set(paired_ids) != set(ids):
        raise RuntimeError("Solver did not return a complete disjoint allocation")
    selected: list[SelectedPair] = []
    for key in sorted(tuple(sorted(pair)) for pair in matches):
        result = lookup[key]
        transformed, weight = scored[key]
        selected.append(
            SelectedPair(
                a=result.a,
                b=result.b,
                a_name=event.person(result.a).name,
                b_name=event.person(result.b).name,
                raw_scores=result.components,
                transformed_scores=transformed,
                weight=weight,
            )
        )
    weights = [p.weight for p in selected]
    return Allocation(
        normalisation=normalisation,
        statistics=statistics,
        pairs=selected,
        total_weight=math.fsum(weights),
        mean_weight=mean(weights),
        minimum_weight=min(weights),
    )
