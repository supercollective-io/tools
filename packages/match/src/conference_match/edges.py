"""Allocate a roster from weighted candidate edges, independently of scoring."""

import math
from itertools import combinations
from typing import Literal

import networkx as nx

from conference_match.models import Record


class Edge(Record):
    a: str
    b: str
    weight: float


class Group(Record):
    members: tuple[str, ...]
    weight: float
    review_required: bool = False


class EdgeAllocation(Record):
    groups: list[Group]
    policy: str
    total_weight: float


def allocate_edges(
    participant_ids: list[str],
    edges: list[Edge],
    *,
    odd_policy: Literal["reject", "trio"] = "reject",
    forbidden_edges: tuple[tuple[str, str], ...] = (),
) -> EdgeAllocation:
    """Maximise pair weights with complete coverage, or fail visibly.

    The explicit trio policy tries triangles in descending mean edge weight,
    selecting the first whose remaining graph has a perfect pair matching.
    This is a heuristic for the trio, not a globally optimal mixed allocation.
    A trio requires all three candidate edges and always requires human review.
    """
    ids = sorted(participant_ids)
    if len(ids) < 2 or len(set(ids)) != len(ids) or any(not p.strip() for p in ids):
        raise ValueError("Provide at least two unique nonblank participant IDs")
    if odd_policy not in ("reject", "trio"):
        raise ValueError("Odd policy must be reject or trio")
    if len(ids) % 2 and odd_policy == "reject":
        raise ValueError("Allocation requires an even roster or the explicit trio policy")
    roster = set(ids)
    blocked = set()
    for a, b in forbidden_edges:
        if a == b or a not in roster or b not in roster:
            raise ValueError("Forbidden edges must join two eligible participants")
        blocked.add(tuple(sorted((a, b))))
    graph = nx.Graph()
    graph.add_nodes_from(ids)
    seen = set()
    for edge in edges:
        key = tuple(sorted((edge.a, edge.b)))
        if edge.a == edge.b or edge.a not in roster or edge.b not in roster:
            raise ValueError("Edges must join two eligible participants")
        if key in seen or not math.isfinite(edge.weight):
            raise ValueError("Candidate edges must be unique and have finite weights")
        seen.add(key)
        if key not in blocked:
            graph.add_edge(*key, weight=edge.weight)

    def pairs(remaining: list[str]) -> list[Group] | None:
        matching = nx.max_weight_matching(
            graph.subgraph(remaining), maxcardinality=True, weight="weight"
        )
        if len(matching) * 2 != len(remaining):
            return None
        return [
            Group(members=key, weight=graph.edges[key]["weight"])
            for key in sorted(tuple(sorted(pair)) for pair in matching)
        ]

    if len(ids) % 2:
        triangles = []
        for trio in combinations(ids, 3):
            links = list(combinations(trio, 2))
            if all(graph.has_edge(*link) for link in links):
                weight = math.fsum(graph.edges[link]["weight"] for link in links) / 3
                triangles.append((weight, trio))
        triangles.sort(key=lambda item: (-item[0], item[1]))
        groups = None
        for weight, trio in triangles:
            remainder = pairs([p for p in ids if p not in trio])
            if remainder is not None:
                groups = [Group(members=trio, weight=weight, review_required=True), *remainder]
                break
        policy = "highest-mean feasible triangle, then maximum-weight pairs; heuristic; review trio"
    else:
        groups = pairs(ids)
        policy = "maximum-weight pairs with complete coverage"
    if groups is None:
        raise ValueError("Candidate graph cannot cover the roster under the selected policy")
    covered = [p for group in groups for p in group.members]
    if len(covered) != len(ids) or set(covered) != roster:
        raise RuntimeError("Solver did not return a complete disjoint allocation")
    return EdgeAllocation(
        groups=groups, policy=policy, total_weight=math.fsum(group.weight for group in groups)
    )
