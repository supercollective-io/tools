import json
from http.client import HTTPConnection
from threading import Event as ThreadEvent
from threading import Thread
from typing import Any

import pytest
from pydantic import ValidationError
from test_runs import FakeScorer

from conference_match.pilot import Pilot, ProfileInput
from conference_match.pilot_server import make_pilot_server


def profile(name="Alice", **overrides):
    return ProfileInput.model_validate(
        {
            "name": name,
            "offers": "I can make illustrations.",
            "needs": "I want to join a small game project.",
            "contact": "alice@example.test",
            "consent": True,
            **overrides,
        }
    )


def make_pilot(tmp_path):
    calls = []
    pilot = Pilot(tmp_path, "A small collaboration event", factory=lambda m: FakeScorer(m, calls))
    return pilot, calls


def finish(pilot):
    assert pilot.worker is not None
    pilot.worker.join(timeout=10)
    assert not pilot.worker.is_alive()


def test_full_lifecycle_and_private_partner_view(tmp_path):
    pilot, calls = make_pilot(tmp_path)
    keys = [pilot.join(profile(name)) for name in ("Alice", "Bob", "Carol", "Dan")]
    first = pilot.participant_view(keys[0])
    assert first["partner"] is None
    pilot.edit(keys[0], profile("Alice", offers="I make pixel art."), first["revision"])
    pilot.start(pilot.state.revision)
    finish(pilot)
    assert pilot.state.status == "ready" and len(calls) == 6
    assert pilot.participant_view(keys[0])["partner"] is None
    with pytest.raises(ValueError, match="frozen"):
        pilot.edit(keys[0], profile("Alice"), 1)
    pilot.release(pilot.state.revision)
    for key in keys:
        view = pilot.participant_view(key)
        assert view["partner"]["name"] != view["profile"]["name"]
        assert "entrants" not in view and "allocation" not in view
        assert "token_hash" not in json.dumps(view) and "score" not in json.dumps(view)
    for path in (tmp_path / "round-1" / "pairs").glob("*.json"):
        assert "alice@example.test" not in path.read_text()
    manifest = json.loads((tmp_path / "round-1" / "manifest.json").read_text())
    assert all("contact" not in p for p in manifest["event"]["participants"])
    restored = Pilot(tmp_path)
    assert restored.organiser_key == pilot.organiser_key
    assert restored.participant_view(keys[0]) == pilot.participant_view(keys[0])
    with pytest.raises(ValueError, match="unreleased"):
        restored.reopen(restored.state.revision)


def test_consent_blank_inputs_and_stale_edit(tmp_path):
    pilot, _ = make_pilot(tmp_path)
    with pytest.raises(ValidationError):
        profile(consent=False)
    with pytest.raises(ValidationError):
        profile(offers=" ")
    key = pilot.join(profile())
    pilot.edit(key, profile(needs="A different project"), 0)
    with pytest.raises(ValueError, match="another tab"):
        pilot.edit(key, profile(), 0)
    with pytest.raises(PermissionError):
        pilot.participant_view(pilot.organiser_key)
    assert not pilot.is_organiser(key)
    assert not pilot.is_organiser("")


def test_odd_count_rejected_before_paid_calls_and_removal(tmp_path):
    pilot, calls = make_pilot(tmp_path)
    for name in ("A", "B", "C"):
        pilot.join(profile(name))
    revision = pilot.state.revision
    with pytest.raises(ValueError, match="even"):
        pilot.start(revision)
    assert calls == [] and pilot.state.status == "open"
    removed_key = pilot.join(profile("D"))
    removed = pilot.entrant(removed_key).id
    with pytest.raises(ValueError, match="changed"):
        pilot.remove(removed, revision)
    pilot.remove(removed, pilot.state.revision)
    with pytest.raises(PermissionError):
        pilot.participant_view(removed_key)


def test_scoring_freezes_registration_and_no_duplicate_run(tmp_path):
    pilot, calls = make_pilot(tmp_path)
    entered, proceed = ThreadEvent(), ThreadEvent()
    original = pilot.factory

    def blocked(model):
        entered.set()
        assert proceed.wait(5)
        return original(model)

    pilot.factory = blocked
    for name in ("A", "B"):
        pilot.join(profile(name))
    try:
        pilot.start(pilot.state.revision)
        assert entered.wait(5)
        for callback in (
            lambda: pilot.join(profile()),
            lambda: pilot.start(pilot.state.revision),
            lambda: pilot.release(pilot.state.revision),
            lambda: pilot.reopen(pilot.state.revision),
        ):
            with pytest.raises(ValueError):
                callback()
    finally:
        proceed.set()
        finish(pilot)
    assert pilot.state.status == "ready" and len(calls) == 1


def test_failure_retry_reopen_and_new_round(tmp_path):
    pilot, calls = make_pilot(tmp_path)
    key = pilot.join(profile("A"))
    pilot.join(profile("B"))
    original = pilot.factory

    def fail(_):
        raise RuntimeError("SECRET API KEY")

    pilot.factory = fail
    pilot.start(pilot.state.revision)
    finish(pilot)
    assert pilot.state.status == "failed"
    assert "SECRET" not in (tmp_path / "event.json").read_text()
    pilot.factory = original
    pilot.start(pilot.state.revision)
    finish(pilot)
    assert pilot.state.status == "ready" and pilot.state.round == 1
    pilot.reopen(pilot.state.revision)
    assert pilot.state.allocation is None and pilot.state.snapshot is None
    pilot.edit(key, profile("A", needs="I want a writer."), 0)
    pilot.start(pilot.state.revision)
    finish(pilot)
    assert pilot.state.round == 2 and len(calls) == 2
    assert (tmp_path / "round-1" / "manifest.json").exists()
    assert (tmp_path / "round-2" / "manifest.json").exists()


def test_interrupted_run_and_configuration_mismatch(tmp_path):
    pilot, _ = make_pilot(tmp_path)
    state = pilot.state.model_copy(deep=True)
    state.status = "scoring"
    pilot.persist(state)
    assert Pilot(tmp_path).state.status == "failed"
    with pytest.raises(ValueError, match="another event"):
        Pilot(tmp_path, description="Something else")
    with pytest.raises(ValueError, match="another model"):
        Pilot(tmp_path, model="different")


def test_http_registration_to_release_and_access_boundaries(tmp_path):
    pilot, _ = make_pilot(tmp_path)
    server = make_pilot_server(pilot, port=0)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    client = HTTPConnection("127.0.0.1", server.server_port)

    def request(method, path, data=None, key=None, extra=None) -> tuple[int, Any]:
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        headers.update(extra or {})
        client.request(method, path, json.dumps(data) if data is not None else None, headers)
        response = client.getresponse()
        body = response.read()
        return response.status, json.loads(body) if (
            response.getheader("Content-Type") or ""
        ).startswith("application/json") else body

    try:
        for asset in (
            "/",
            "/organiser",
            "/common.js",
            "/participant.js",
            "/organiser.js",
            "/style.css",
        ):
            assert request("GET", asset)[0] == 200
        assert request("GET", "/api/organiser")[0] == 403
        assert request("GET", "/api/me")[0] == 403
        status, result = request("POST", "/api/join", {"profile": profile().model_dump()})
        assert status == 201
        key = result["key"]
        assert request("POST", "/api/join", {"profile": profile("Bob").model_dump()})[0] == 201
        assert request("GET", "/api/organiser", key=key)[0] == 403
        assert request("POST", "/api/start", {"revision": pilot.state.revision}, key=key)[0] == 403
        assert (
            request(
                "POST", "/api/start", {"revision": pilot.state.revision}, key=pilot.organiser_key
            )[0]
            == 200
        )
        finish(pilot)
        assert request("GET", "/api/me", key=key)[1]["partner"] is None
        assert (
            request(
                "POST", "/api/release", {"revision": pilot.state.revision}, key=pilot.organiser_key
            )[0]
            == 200
        )
        assert request("GET", "/api/me", key=key)[1]["partner"]["name"] == "Bob"
        assert request("GET", "/organiser-key")[0] == 404
        assert request("GET", "/api/event", extra={"Host": "attacker.example"})[0] == 403
        assert (
            request("POST", "/api/join", {}, extra={"Origin": "https://attacker.example"})[0] == 403
        )
        assert request("GET", "/api/me", key="wrong")[0] == 403
    finally:
        client.close()
        server.shutdown()
        thread.join()
        server.server_close()
