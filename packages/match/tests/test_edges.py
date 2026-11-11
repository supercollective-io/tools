from itertools import combinations

import pytest

from conference_match.edges import Edge, allocate_edges


def complete(count, weight=1):
    ids = [str(i) for i in range(count)]
    return ids, [Edge(a=a, b=b, weight=weight) for a, b in combinations(ids, 2)]


def test_sparse_graph_coverage_and_forbidden_edges():
    ids, edges = complete(4, -1)
    result = allocate_edges(ids, edges, forbidden_edges=(("0", "1"),))
    assert len(result.groups) == 2
    assert all(set(g.members) != {"0", "1"} for g in result.groups)
    with pytest.raises(ValueError, match="cover"):
        allocate_edges(ids, edges[:2])


@pytest.mark.parametrize("size", [3, 5, 139])
def test_trio_is_explicit_complete_and_requires_review(size):
    ids, edges = complete(size)
    with pytest.raises(ValueError, match="even"):
        allocate_edges(ids, edges)
    result = allocate_edges(ids, edges, odd_policy="trio")
    assert sorted(p for group in result.groups for p in group.members) == sorted(ids)
    trios = [g for g in result.groups if len(g.members) == 3]
    assert len(trios) == 1 and trios[0].review_required
    assert "heuristic" in result.policy


def test_trio_skips_highest_triangle_when_remainder_cannot_pair():
    edges = [
        Edge(a=a, b=b, weight=w)
        for a, b, w in [
            ("a", "b", 10),
            ("a", "c", 10),
            ("b", "c", 10),
            ("a", "d", 1),
            ("b", "d", 1),
            ("c", "e", 1),
        ]
    ]
    result = allocate_edges(list("abcde"), edges, odd_policy="trio")
    assert result.groups[0].members == ("a", "b", "d")
    assert result.groups[1].members == ("c", "e")


@pytest.mark.parametrize(
    "edges",
    [
        [Edge(a="a", b="a", weight=1)],
        [Edge(a="a", b="x", weight=1)],
        [Edge(a="a", b="b", weight=1), Edge(a="b", b="a", weight=1)],
    ],
)
def test_invalid_candidates_rejected(edges):
    with pytest.raises(ValueError):
        allocate_edges(["a", "b"], edges)
