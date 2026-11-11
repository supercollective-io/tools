import fcntl
import json
import subprocess
import sys
from pathlib import Path

import pytest
from test_allocation import result

from conference_match.models import write_json
from conference_match.worker import Request, run_job


def request_for(directory, size=4, mode="similarity", **config):
    return Request.model_validate(
        {
            "schemaVersion": 1,
            "jobId": "job-1",
            "snapshot": {"id": "snapshot-1", "hash": "frozen"},
            "roster": [
                {
                    "participantId": str(i),
                    "text": f"Full authorised text {i}",
                    "sourceRefs": [f"revision-{i}"],
                    "embedding": [1, i + 1],
                }
                for i in range(size)
            ],
            "mode": mode,
            "config": {"model": "fake-pinned", "eventDescription": "Collective inquiry", **config},
            "outputDir": str(directory),
        }
    )


def test_similarity_provenance_resume_and_no_provider(tmp_path):
    request = request_for(tmp_path)

    def unavailable(_):
        raise AssertionError("Similarity must not invoke a provider")

    events = []
    output = run_job(
        request, factory=unavailable, emit=lambda e: events.append(json.loads(json.dumps(e)))
    )
    assert output["mode"] == "similarity"
    assert output["provenance"]["providerCalls"] == 0
    assert sorted(p for g in output["groups"] for p in g["participantIds"]) == list("0123")
    for group in output["groups"]:
        for p in group["participantIds"]:
            assert group["sourceRefs"][p] == [f"revision-{p}"]
    assert events[-1]["status"] == "succeeded"
    assert run_job(request, factory=unavailable, emit=lambda _: None) == output
    assert json.loads((tmp_path / "state.json").read_text())["attempt"] == 1
    assert "Full authorised" not in (tmp_path / "state.json").read_text()


def test_changed_frozen_inputs_refused(tmp_path):
    request = request_for(tmp_path)
    run_job(request, emit=lambda _: None)
    request.roster[0].text = "Changed contribution"
    before = (tmp_path / "state.json").read_text()
    with pytest.raises(ValueError, match="Frozen"):
        run_job(request, emit=lambda _: None)
    assert (tmp_path / "state.json").read_text() == before


def test_collaboration_partial_failure_resume_reuses_paid_results(tmp_path):
    calls = []
    fail = True

    class Fake:
        def score(self, event, a, b):
            calls.append((a.id, b.id))
            if fail and (a.id, b.id) == ("2", "3"):
                raise RuntimeError("secret provider detail must never persist")
            return result(a.id, b.id, (0.8, 0.6, 0.4))

    request = request_for(tmp_path, mode="collaboration", maxCalls=7, concurrency=1)
    with pytest.raises(RuntimeError):
        run_job(request, factory=lambda _: Fake(), emit=lambda _: None)
    assert len(calls) == 6
    assert len(list((tmp_path / "pairs").glob("*.json"))) == 5
    state = json.loads((tmp_path / "state.json").read_text())
    assert state["status"] == "failed" and state["providerCalls"] == 6
    assert "secret provider" not in (tmp_path / "state.json").read_text()
    fail = False
    output = run_job(request, factory=lambda _: Fake(), emit=lambda _: None)
    assert len(calls) == 7
    assert output["provenance"]["model"] == "fake"
    assert output["groups"][0]["weight"] == pytest.approx(1.8)
    assert json.loads((tmp_path / "state.json").read_text())["attempt"] == 2


def test_live_budget_preflight_spends_nothing(tmp_path):
    request = request_for(tmp_path, mode="collaboration", maxCalls=5)

    def unavailable(_):
        raise AssertionError("Preflight must fail before creating a provider")

    with pytest.raises(ValueError, match="budget"):
        run_job(request, factory=unavailable, emit=lambda _: None)
    assert json.loads((tmp_path / "state.json").read_text())["providerCalls"] == 0


def test_dead_owner_is_interrupted_and_retry_bounded(tmp_path):
    request = request_for(tmp_path, maxAttempts=2)
    write_json(tmp_path / "request.json", request.model_dump(mode="json"))
    write_json(tmp_path / "state.json", {"status": "running", "attempt": 1, "providerCalls": 0})
    run_job(request, emit=lambda _: None)
    state = json.loads((tmp_path / "state.json").read_text())
    assert state["previousStatus"] == "interrupted" and state["attempt"] == 2
    state["status"] = "failed"
    write_json(tmp_path / "state.json", state)
    with pytest.raises(ValueError, match="retry limit"):
        run_job(request, emit=lambda _: None)


def test_process_ownership_prevents_duplicate_work(tmp_path):
    with (tmp_path / "owner.lock").open("a") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        with pytest.raises(ValueError, match="owned"):
            run_job(request_for(tmp_path), emit=lambda _: None)
    assert not (tmp_path / "state.json").exists()


def test_trio_and_invalid_embeddings(tmp_path):
    request = request_for(tmp_path, size=5, oddPolicy="trio")
    output = run_job(request, emit=lambda _: None)
    trio = [g for g in output["groups"] if len(g["participantIds"]) == 3]
    assert len(trio) == 1 and trio[0]["reviewRequired"]
    payload = request.model_dump(mode="json")
    payload["roster"][0]["embedding"] = [0, 0]
    with pytest.raises(ValueError, match="nonzero"):
        Request.model_validate(payload)
    payload["roster"][0]["embedding"] = [1, float("nan")]
    with pytest.raises(ValueError):
        Request.model_validate(payload)


def test_cli_outputs_json_and_atomic_result(tmp_path):
    request = request_for(tmp_path / "job")
    path = tmp_path / "input.json"
    write_json(path, request.model_dump(mode="json"))
    completed = subprocess.run(
        [sys.executable, "-m", "conference_match.worker", str(path)],
        text=True,
        capture_output=True,
        check=True,
    )
    assert completed.stderr == ""
    assert all(json.loads(line)["jobId"] == "job-1" for line in completed.stdout.splitlines())
    assert json.loads((Path(request.outputDir) / "state.json").read_text())["status"] == "succeeded"
    assert not list(Path(request.outputDir).glob(".match-*.tmp"))


def test_previous_pairs_are_excluded_and_impossible_constraints_fail_before_scoring(tmp_path):
    request = request_for(tmp_path / "first")
    first = run_job(request, emit=lambda _: None)
    previous = [group["participantIds"] for group in first["groups"]]
    second = request_for(tmp_path / "second", forbiddenPairs=previous)
    output = run_job(second, emit=lambda _: None)
    assert all(group["participantIds"] not in previous for group in output["groups"])
    with pytest.raises(ValueError, match="cover"):
        request_for(
            tmp_path / "impossible",
            mode="collaboration",
            maxCalls=6,
            forbiddenPairs=[["0", "1"], ["0", "2"], ["0", "3"]],
        )
    for forbidden in ([["0", "0"]], [["0", "absent"]], [["0", "1"], ["1", "0"]]):
        with pytest.raises(ValueError):
            request_for(tmp_path / "invalid", forbiddenPairs=forbidden)
