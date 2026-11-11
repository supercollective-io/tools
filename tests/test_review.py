import json
from http.client import HTTPConnection
from threading import Thread
from typing import Literal

import pytest
from test_runs import FakeScorer, event_of_size

from conference_match.evaluation import Comparison, Fixtures, evaluate
from conference_match.models import Event
from conference_match.operator import make_server
from conference_match.review import Judgement, ReviewStore, proposals_for
from conference_match.runs import score_event


def judgement(proposal, choice: Literal["left", "right", "unclear"] = "left"):
    return Judgement(
        proposal_id=proposal.id,
        choice=choice,
        reason="The offer meets the stated need.",
        reviewed_by="Human reviewer",
        ordering_confidence="definite",
    )


def test_queue_is_blind_deterministic_and_person_disjoint():
    event = event_of_size(40)
    fixtures = Fixtures(
        comparisons=[
            Comparison(
                id="existing",
                preferred=("0", "1"),
                alternative=("2", "1"),
                metric="sum",
                reason="Existing judgement",
            )
        ]
    )
    session = proposals_for(event, fixtures)
    assert session == proposals_for(event, fixtures)
    assert len(session.proposals) == 40
    assert len(session.reserved_ids) == 8
    assert not {"0", "1", "2"}.intersection(session.reserved_ids)
    assert not session.judgements
    assert {p.metric for p in session.proposals} == {"support", "shared_inquiry"}
    for p in session.proposals:
        people = set(p.left + p.right)
        assert len(people) == 3
        assert (
            people.issubset(session.reserved_ids)
            if p.split == "holdout"
            else not (people.intersection(session.reserved_ids))
        )


def test_save_resume_reverse_unclear_and_evaluator_compatibility(tmp_path):
    event = event_of_size(6)
    store = ReviewStore(tmp_path, event)
    left, right = store.session.proposals[:2]
    store.judge(judgement(left, "right"))
    store.judge(judgement(right, "unclear"))
    resumed = ReviewStore(tmp_path, event)
    assert len(resumed.session.judgements) == 2
    exported = Fixtures.model_validate_json(resumed.fixtures().model_dump_json())
    assert len(exported.comparisons) == 1
    assert exported.comparisons[0].preferred == left.right
    assert exported.comparisons[0].status == "approved"
    calls = []
    report = evaluate(event, exported, "fake", lambda model: FakeScorer(model, calls))
    assert report["approved_count"] == 1
    store.judge(judgement(left, "unclear"))
    with pytest.raises(ValueError, match="No ranked"):
        store.fixtures()
    assert len(store.session.history) == 3


def test_session_import_isolation_and_rejection(tmp_path):
    store = ReviewStore(tmp_path, event_of_size(4))
    store.judge(judgement(store.session.proposals[0]))
    first = store.session.input_hash
    changed = Event.model_validate(
        {**store.session.event.model_dump(), "description": "Other event"}
    )
    store.open(changed)
    assert store.session.input_hash != first
    assert store.session.judgements == {}
    store.open(event_of_size(4))
    assert len(store.session.judgements) == 1
    with pytest.raises(ValueError, match="reviewer"):
        store.judge(judgement(store.session.proposals[0]).model_copy(update={"reviewed_by": " "}))
    with pytest.raises(ValueError, match="Unknown"):
        store.judge(
            judgement(store.session.proposals[0]).model_copy(update={"proposal_id": "missing"})
        )


def test_allocation_preserves_provenance_and_locks_holdout(tmp_path):
    event = event_of_size(6)
    run = tmp_path / "run"
    calls = []
    score_event(event, run, "fake", lambda model: FakeScorer(model, calls), progress=lambda _: None)
    store = ReviewStore(tmp_path / "review", event)
    with pytest.raises(ValueError, match="holdout"):
        store.allocation(run, "none")
    assert not store.session.scores_revealed
    holdout = [p for p in store.session.proposals if p.split == "holdout"]
    for p in holdout:
        store.judge(judgement(p))
    allocation = store.allocation(run, "none")
    assert allocation["model"] == "fake-pinned"
    assert allocation["input_hash"] == store.session.input_hash
    assert len(allocation["pairs"]) == 3
    assert len(calls) == 15  # Allocation made no new model calls.
    with pytest.raises(ValueError, match="locked"):
        store.judge(judgement(holdout[0], "right"))
    store.judge(judgement(store.session.proposals[0]))
    assert store.session.history[-1].scores_seen
    assert ReviewStore(tmp_path / "review", event).session.scores_revealed


def test_allocation_rejects_missing_mismatched_and_incomplete_runs(tmp_path):
    store = ReviewStore(tmp_path / "review", event_of_size(4))
    with pytest.raises(ValueError, match="--run"):
        store.allocation(None, "none")
    run = tmp_path / "run"
    score_event(event_of_size(2), run, "fake", lambda m: FakeScorer(m, []), progress=lambda _: None)
    with pytest.raises(ValueError, match="different event"):
        store.allocation(run, "none")
    next((run / "pairs").glob("*.json")).unlink()
    with pytest.raises(ValueError, match="incomplete"):
        store.allocation(run, "none")


def test_two_person_event_has_no_comparisons():
    assert proposals_for(event_of_size(2)).proposals == []


def test_http_workflow_guards_and_assets(tmp_path):
    store = ReviewStore(tmp_path, event_of_size(4))
    server = make_server(store, None, 0)
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    client = HTTPConnection("127.0.0.1", server.server_port)

    def request(method, path, body=None, headers=None):
        client.request(
            method,
            path,
            json.dumps(body) if body is not None else None,
            headers or {"Content-Type": "application/json"},
        )
        response = client.getresponse()
        return response.status, response.read()

    try:
        status, body = request("GET", "/api/session")
        assert status == 200
        data = json.loads(body)
        assert "metrics" not in data and "assessments" not in data
        for asset in ("/", "/app.js", "/style.css"):
            assert request("GET", asset)[0] == 200
        payload = {
            "input_hash": data["input_hash"],
            "revision": data["revision"],
            "judgement": judgement(store.session.proposals[0]).model_dump(),
        }
        assert request("POST", "/api/judgements", payload)[0] == 200
        assert request("POST", "/api/judgements", payload)[0] == 400  # Stale tab.
        assert request("GET", "/api/fixtures")[0] == 200
        assert request("GET", "/api/archive")[0] == 200
        assert request("GET", "/../.env")[0] == 404
        assert request("GET", "/api/session", headers={"Host": "attacker.example"})[0] == 403
        assert (
            request(
                "POST",
                "/api/judgements",
                payload,
                {"Content-Type": "application/json", "Origin": "https://attacker.example"},
            )[0]
            == 403
        )
        assert request("POST", "/api/import", {"input_hash": "stale"})[0] == 400
        assert request(
            "POST",
            "/api/import",
            {
                "input_hash": store.session.input_hash,
                "revision": store.session.revision,
                "event": {"private": "DO_NOT_ECHO"},
            },
        ) == (400, b'{"error": "Invalid data"}')
    finally:
        client.close()
        server.shutdown()
        worker.join()
        server.server_close()


def test_resume_retires_only_unanswered_overall_questions(tmp_path):
    store = ReviewStore(tmp_path, event_of_size(6))
    answered, unanswered = store.session.proposals[:2]
    answered.metric = "sum"
    unanswered.metric = "sum"
    store.judge(judgement(answered))
    resumed = ReviewStore(tmp_path, event_of_size(6))
    assert answered.id in {p.id for p in resumed.session.proposals}
    assert unanswered.id not in {p.id for p in resumed.session.proposals}
    assert resumed.session.history == store.session.history
    assert resumed.fixtures().comparisons[0].metric == "sum"
    assert ReviewStore(tmp_path, event_of_size(6)).session == resumed.session


def test_minimal_judgement_and_legacy_annotations(tmp_path):
    store = ReviewStore(tmp_path, event_of_size(4))
    proposal = store.session.proposals[0]
    minimal = Judgement(proposal_id=proposal.id, choice="left")
    store.judge(minimal)
    exported = store.fixtures().comparisons[0]
    assert exported.reviewed_by == "Local operator"
    assert exported.reason == "No note supplied."
    assert exported.ordering_confidence == "unspecified"
    store.judge(judgement(proposal))
    store.judge(Judgement(proposal_id=proposal.id, choice="left", reason="Updated note"))
    assert store.fixtures().comparisons[0].ordering_confidence == "definite"
    store.judge(Judgement(proposal_id=proposal.id, choice="right"))
    assert store.fixtures().comparisons[0].ordering_confidence == "unspecified"
    store.judge(Judgement(proposal_id=proposal.id, choice="unclear"))
    assert store.session.history[1].ordering_confidence == "definite"
    with pytest.raises(ValueError, match="No ranked"):
        store.fixtures()
