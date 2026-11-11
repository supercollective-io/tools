import json
from itertools import combinations
from pathlib import Path

import pytest
from test_runs import FakeScorer, event_of_size

from conference_match import cli, rubric
from conference_match.allocation import allocate
from conference_match.models import METRICS, Assessment, Metric, load_event
from conference_match.runs import load_results, score_event


def continuous(value: float) -> Metric:
    score = value * 4
    lower = int(score)
    probabilities = {k: 0.0 for k in range(5)}
    probabilities[lower] = 1 - (score - lower)
    if lower < 4:
        probabilities[lower + 1] = score - lower
    return Metric(score=score, confidence=0.5, probabilities=probabilities)


def result(a: str, b: str, scores: tuple[float, float, float]) -> Assessment:
    return Assessment(
        a=a,
        b=b,
        model="fake",
        rubric=rubric.fingerprint(),
        metrics={k: continuous(v) for k, v in zip(METRICS, scores, strict=True)},
    )


def test_global_matching_beats_greedy():
    event = event_of_size()
    values = {("0", "1"): 1, ("2", "3"): 0.1, ("0", "2"): 0.9, ("1", "3"): 0.9}
    assessments = [
        result(a, b, (values.get((a, b), 0), 0, 0))
        for a, b in combinations([p.id for p in event.participants], 2)
    ]
    allocation = allocate(event, assessments)
    assert {(p.a, p.b) for p in allocation.pairs} == {("0", "2"), ("1", "3")}
    assert allocation.total_weight == pytest.approx(1.8)


def test_sum_not_max():
    event = event_of_size(2)
    allocation = allocate(event, [result("0", "1", (0.8, 0.6, 0.4))])
    assert allocation.total_weight == pytest.approx(1.8)


def test_label_reversal_and_population_statistics():
    event = event_of_size()
    assessments = [
        result(a, b, (i / 10, (i + 2) / 10, (i + 1) / 10))
        for i, (a, b) in enumerate(combinations([p.id for p in event.participants], 2))
    ]
    reversed_results = [
        result(
            r.b,
            r.a,
            (r.components["b_to_a"], r.components["a_to_b"], r.components["shared_inquiry"]),
        )
        for r in assessments
    ]
    normal = allocate(event, assessments, "zscore")
    reversed_allocation = allocate(event, reversed_results, "zscore")
    assert normal.statistics == reversed_allocation.statistics
    assert normal.statistics["relevance"].count == 12
    assert normal.statistics["shared_inquiry"].count == 6
    assert normal.total_weight == pytest.approx(reversed_allocation.total_weight)
    assert {frozenset((p.a, p.b)) for p in normal.pairs} == {
        frozenset((p.a, p.b)) for p in reversed_allocation.pairs
    }
    assert normal.statistics["relevance"].mean == pytest.approx(0.35)


@pytest.mark.parametrize("mode", ["none", "zscore"])
def test_hundred_people_and_ties(mode):
    event = event_of_size(100)
    assessments = [
        result(a.id, b.id, (0.5, 0.5, 0.5)) for a, b in combinations(event.participants, 2)
    ]
    assert len(assessments) == 4950
    allocation = allocate(event, assessments, mode)
    assert len(allocation.pairs) == 50
    ids = [identifier for pair in allocation.pairs for identifier in (pair.a, pair.b)]
    assert len(ids) == len(set(ids)) == 100
    if mode == "zscore":
        assert allocation.total_weight == 0


def test_negative_weights_still_pair_everyone():
    event = event_of_size()
    assessments = [
        result(a, b, ((1 if "0" in (a, b) else 0), 0, 0))
        for a, b in combinations([p.id for p in event.participants], 2)
    ]
    allocation = allocate(event, assessments, "zscore")
    assert len(allocation.pairs) == 2
    assert any(p.weight < 0 for p in allocation.pairs)


def test_near_constant_distribution_is_finite():
    event = event_of_size()
    assessments = [
        result(a, b, (0.5 + i * 1e-12, 0.5, 0.5))
        for i, (a, b) in enumerate(combinations([p.id for p in event.participants], 2))
    ]
    allocation = allocate(event, assessments, "zscore")
    assert allocation.statistics["relevance"].standard_deviation > 0
    assert len(allocation.pairs) == 2


def test_incomplete_and_odd_rejected():
    with pytest.raises(ValueError, match="every pair"):
        allocate(event_of_size(), [])
    with pytest.raises(ValueError, match="even"):
        allocate(event_of_size(3), [])


def test_full_cli_workflow(tmp_path, monkeypatch, capsys):
    calls = []
    event = load_event(Path("examples/event.json"))
    run = tmp_path / "run"
    score_event(event, run, "latest", lambda m: FakeScorer(m, calls), progress=lambda _: None)
    count = len(event.participants)
    expected = count * (count - 1) // 2
    assert len(load_results(run, complete=True)[1]) == expected
    monkeypatch.setattr("sys.argv", ["match", "inspect", str(run), "--person", "1jgjvjt"])
    assert cli.main() == 0
    assert f"{count - 1}/{count - 1}" in capsys.readouterr().out
    for mode in ("none", "zscore"):
        output = tmp_path / f"{mode}.json"
        monkeypatch.setattr(
            "sys.argv",
            ["match", "allocate", str(run), "--normalisation", mode, "--output", str(output)],
        )
        assert cli.main() == 0
        allocation = json.loads(output.read_text())
        assert len(allocation["pairs"]) == count // 2
        assert allocation["normalisation"] == mode
        assert allocation["model"] == "fake-pinned"
    assert len(calls) == expected


def test_hundred_person_batch_to_allocation(tmp_path):
    event = event_of_size(100)
    calls = []
    assert score_event(
        event, tmp_path, "latest", lambda m: FakeScorer(m, calls), progress=lambda _: None
    ) == (4950, 0)
    manifest, assessments = load_results(tmp_path, complete=True)
    assert len(calls) == 4950
    for mode in ("none", "zscore"):
        assert len(allocate(manifest.event, assessments, mode).pairs) == 50


@pytest.mark.parametrize("target", ["manifest.json", "failures.json", ".lock", "pairs/x.json"])
def test_export_does_not_overwrite_run_state(tmp_path, monkeypatch, capsys, target):
    protected = tmp_path / target
    protected.parent.mkdir(parents=True, exist_ok=True)
    protected.write_text("preserve me")
    monkeypatch.setattr(
        "sys.argv", ["match", "allocate", str(tmp_path), "--output", str(protected)]
    )
    assert cli.main() == 1
    assert protected.read_text() == "preserve me"
    assert "overwrite" in capsys.readouterr().err
