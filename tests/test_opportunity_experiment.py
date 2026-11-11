import json
import sys
from pathlib import Path

import pytest
from test_runs import FakeScorer

from conference_match import rubric
from conference_match.models import load_event, write_json
from conference_match.review import Judgement, ReviewStore
from experiments import opportunity_support


def prepare(tmp_path, monkeypatch):
    store = ReviewStore(tmp_path / "review", load_event(Path("examples/event.json")))
    p = store.session.proposals[0]
    store.judge(Judgement(proposal_id=p.id, choice="unclear"))
    archive = tmp_path / "archive.json"
    write_json(archive, store.session.model_dump(mode="json"))
    output = tmp_path / "experiment"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "opportunity_support.py",
            "--output",
            str(output),
            "--review-archive",
            str(archive),
            "--repeats",
            "1",
        ],
    )
    return output


def test_experiment_keeps_inputs_labels_and_nondirectional_rubric_fixed(tmp_path, monkeypatch):
    output = prepare(tmp_path, monkeypatch)
    version, questions = rubric.VERSION, rubric.QUESTIONS.copy()
    calls = []
    monkeypatch.setattr(opportunity_support, "JevScorer", lambda model: FakeScorer(model, calls))
    opportunity_support.main()
    assert rubric.VERSION == version and rubric.QUESTIONS == questions
    assert len(calls) == 44
    for suite in ("real", "unclear", "peers", "sanity"):
        baseline = json.loads((output / f"baseline-{suite}-1.json").read_text())
        candidate = json.loads((output / f"opportunity-{suite}-1.json").read_text())
        assert baseline["fixtures"] == candidate["fixtures"]
        assert baseline["event"] == candidate["event"]
        assert baseline["requested_model"] == candidate["requested_model"] == "jev-1.14.0"
        assert baseline["rubric"]["common"] == candidate["rubric"]["common"]
        assert (
            baseline["rubric"]["questions"]["shared_inquiry"]
            == candidate["rubric"]["questions"]["shared_inquiry"]
        )
        assert (
            candidate["rubric"]["questions"]["a_to_b"]
            == questions["a_to_b"] + opportunity_support.ADDITION
        )
        assert (
            baseline["approved_count"]
            == candidate["approved_count"]
            == (
                10 if suite == "real" else 0 if suite == "unclear" else 3 if suite == "peers" else 5
            )
        )
    with pytest.raises(ValueError, match="new output"):
        opportunity_support.main()


def test_experiment_restores_rubric_after_provider_failure(tmp_path, monkeypatch):
    prepare(tmp_path, monkeypatch)
    version, questions = rubric.VERSION, rubric.QUESTIONS.copy()

    def fail(*args, **kwargs):
        raise RuntimeError("test provider failure")

    monkeypatch.setattr(opportunity_support, "evaluate", fail)
    with pytest.raises(RuntimeError, match="test provider"):
        opportunity_support.main()
    assert rubric.VERSION == version and rubric.QUESTIONS == questions
