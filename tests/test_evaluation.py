from pathlib import Path

import pytest
from pydantic import ValidationError
from test_allocation import result
from test_runs import FakeScorer, event_of_size

from conference_match.evaluation import Comparison, Fixtures, evaluate, value
from conference_match.models import load_event
from conference_match.runs import score_event


def case(**overrides):
    data = dict(
        id="one",
        preferred=("0", "1"),
        alternative=("0", "2"),
        metric="support",
        reason="Human comparison",
        status="approved",
        reviewed_by="Tester",
    )
    return Comparison.model_validate(data | overrides)


def test_directional_value_uses_fixture_order():
    r = result("0", "1", (0.2, 0.8, 0.5))
    assert value(r, ("0", "1"), "support") == pytest.approx(0.2)
    assert value(r, ("1", "0"), "support") == pytest.approx(0.8)
    assert value(r, ("1", "0"), "sum") == pytest.approx(1.5)


def test_scores_only_unique_fixture_pairs_and_pins_model():
    calls = []
    fixtures = Fixtures(
        comparisons=[
            case(ordering_confidence="definite", expected_separation="similar"),
            case(id="reverse", preferred=("1", "0")),
        ]
    )
    report = evaluate(event_of_size(), fixtures, "latest", lambda m: FakeScorer(m, calls))
    assert calls == [("0", "1", "latest"), ("0", "2", "fake-pinned")]
    assert report["unique_pairs"] == 2
    assert report["comparisons"][0]["ordering_confidence"] == "definite"
    assert report["comparisons"][0]["expected_separation"] == "similar"
    assert report["approved_accuracy"] == 0
    assert report["approved_outcomes"] == {"pass": 0, "fail": 0, "tie": 2}


def test_drafts_and_holdout_do_not_enter_accuracy():
    fixtures = Fixtures(
        comparisons=[case(status="draft", reviewed_by=None), case(id="held", split="holdout")]
    )
    calls = []
    factory = lambda m: FakeScorer(m, calls)  # noqa: E731
    with pytest.raises(ValueError, match="No approved"):
        evaluate(event_of_size(), fixtures, "latest", factory)
    assert not calls
    report = evaluate(event_of_size(), fixtures, "latest", factory, include_drafts=True)
    assert report["approved_accuracy"] is None
    assert len(report["comparisons"]) == 1


def test_invalid_ids_rejected_before_paid_calls():
    calls = []
    fixtures = Fixtures(comparisons=[case(alternative=("0", "missing"))])
    with pytest.raises(ValueError, match="Unknown participant"):
        evaluate(event_of_size(), fixtures, "latest", lambda m: FakeScorer(m, calls))
    assert not calls
    with pytest.raises(ValidationError):
        case(reviewed_by=None)


def test_saved_results_need_no_scorer_and_reject_different_inputs(tmp_path):
    event = event_of_size()
    score_event(event, tmp_path, "latest", lambda m: FakeScorer(m, []), progress=lambda _: None)

    def forbidden(_):
        raise AssertionError("Must not call model")

    fixtures = Fixtures(comparisons=[case()])
    report = evaluate(event, fixtures, "latest", forbidden, source_run=tmp_path)
    assert report["api_calls"] == 0
    event.description = "Different event"
    with pytest.raises(ValueError, match="different profiles"):
        evaluate(event, fixtures, "latest", forbidden, source_run=tmp_path)


def test_real_comparisons_reference_existing_profiles_and_have_review_provenance():
    event = load_event(Path("examples/event.json"))
    fixtures = Fixtures.model_validate_json(Path("examples/comparisons.json").read_text())
    for c in fixtures.comparisons:
        for identifier in (*c.preferred, *c.alternative):
            event.person(identifier)
    # No invented human approval: shipped proposals must have provenance when labelled.
    assert all(c.reviewed_by for c in fixtures.comparisons if c.status == "approved")


def test_cli_returns_failure_for_human_ranking_tie(tmp_path, monkeypatch, capsys):
    from conference_match import cli
    from conference_match.models import write_json

    event_file = tmp_path / "event.json"
    fixture_file = tmp_path / "fixtures.json"
    output = tmp_path / "result.json"
    write_json(event_file, event_of_size().model_dump(mode="json"))
    write_json(fixture_file, Fixtures(comparisons=[case()]).model_dump(mode="json"))
    monkeypatch.setattr(cli, "JevScorer", lambda m: FakeScorer(m, []))
    monkeypatch.setattr(
        "sys.argv",
        ["match", "evaluate", str(event_file), str(fixture_file), "--output", str(output)],
    )
    assert cli.main() == 1
    assert "Human-judgement agreement: 0.0%" in capsys.readouterr().out
    assert output.exists()
    assert cli.main() == 1
    assert "output exists" in capsys.readouterr().err


def test_synthetic_suite_is_separate_and_reuses_four_pairs():
    fixtures = Fixtures.model_validate_json(Path("examples/sanity-comparisons.json").read_text())
    event = load_event(Path("examples/sanity-event.json"))
    calls = []
    report = evaluate(event, fixtures, "latest", lambda m: FakeScorer(m, calls))
    assert report["fixture_kind"] == "synthetic"
    assert report["unique_pairs"] == len(calls) == 4
    assert report["approved_count"] == 5
