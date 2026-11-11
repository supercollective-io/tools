"""Collaboration score transformation and backwards-compatible pair allocation."""

import math
from itertools import combinations
from statistics import mean, pstdev
from typing import Literal

from conference_match.edges import Edge, allocate_edges
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


def collaboration_scores(
    event: Event, assessments: list[Assessment], normalisation: str = "none"
) -> tuple[dict[str, Distribution], dict[tuple[str, str], tuple[dict[str, float], float]]]:
    """Retain directional relevance pooling and summed collaboration semantics."""
    if normalisation not in ("none", "zscore"):
        raise ValueError("Normalisation must be none or zscore")
    ids = sorted(p.id for p in event.participants)
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
        scored[key] = transformed, math.fsum(transformed.values())
    return statistics, scored


def allocate(
    event: Event, assessments: list[Assessment], normalisation: str = "none"
) -> Allocation:
    if normalisation not in ("none", "zscore"):
        raise ValueError("Normalisation must be none or zscore")
    ids = sorted(p.id for p in event.participants)
    if len(ids) % 2:
        raise ValueError("Allocation requires an even participant count; trios are not supported")
    statistics, scored = collaboration_scores(event, assessments, normalisation)
    allocation = allocate_edges(
        ids, [Edge(a=key[0], b=key[1], weight=value[1]) for key, value in scored.items()]
    )
    lookup = {(min(r.a, r.b), max(r.a, r.b)): r for r in assessments}
    selected: list[SelectedPair] = []
    for group in allocation.groups:
        key = (group.members[0], group.members[1])
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
