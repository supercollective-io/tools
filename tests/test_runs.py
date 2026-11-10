import pytest

from conference_match import rubric
from conference_match.models import METRICS, Assessment, Event, Metric, Participant
from conference_match.runs import load_results, pair_path, score_event


def event_of_size(count: int = 4) -> Event:
    return Event(
        description="Test event",
        participants=[
            Participant(
                id=str(i), name=f"Person {i}", profile="I build tools and seek collaborators."
            )
            for i in range(count)
        ],
    )


class FakeScorer:
    def __init__(self, model: str, calls: list, failures: set | None = None):
        self.model = model
        self.calls = calls
        self.failures = failures or set()

    def score(self, event, a, b):
        self.calls.append((a.id, b.id, self.model))
        if (a.id, b.id) in self.failures:
            raise RuntimeError("private provider body must not be persisted")
        metric = Metric(score=3, confidence=1, probabilities={k: float(k == 3) for k in range(5)})
        return Assessment(
            a=a.id,
            b=b.id,
            model="fake-pinned",
            rubric=rubric.fingerprint(),
            metrics={k: metric for k in METRICS},
        )


def test_resumes_and_pins_alias(tmp_path):
    calls = []
    factory = lambda model: FakeScorer(model, calls)  # noqa: E731
    event = event_of_size()
    assert score_event(event, tmp_path, "latest", factory, progress=lambda _: None) == (6, 0)
    assert calls[0][2] == "latest"
    assert all(c[2] == "fake-pinned" for c in calls[1:])
    calls.clear()
    assert score_event(event, tmp_path, "latest", factory, progress=lambda _: None) == (6, 0)
    assert calls == []
    pair_path(tmp_path, "1", "2").unlink()
    score_event(event, tmp_path, "latest", factory, progress=lambda _: None)
    assert calls == [("1", "2", "fake-pinned")]
    assert len(load_results(tmp_path, complete=True)[1]) == 6


def test_changed_input_model_or_rubric_rejected(tmp_path, monkeypatch):
    calls = []
    factory = lambda model: FakeScorer(model, calls)  # noqa: E731
    event = event_of_size()
    score_event(event, tmp_path, "latest", factory, progress=lambda _: None)
    changed = event.model_copy(update={"description": "different"})
    with pytest.raises(ValueError, match="changed"):
        score_event(changed, tmp_path, "latest", factory)
    with pytest.raises(ValueError, match="changed"):
        score_event(event, tmp_path, "another-model", factory)
    monkeypatch.setattr(rubric, "VERSION", "changed")
    with pytest.raises(ValueError, match="changed"):
        score_event(event, tmp_path, "latest", factory)
    assert len(calls) == 6


def test_failures_preserved_and_retryable(tmp_path):
    calls = []
    factory = lambda model: FakeScorer(model, calls, {("1", "2")})  # noqa: E731
    event = event_of_size()
    assert score_event(event, tmp_path, "latest", factory, progress=lambda _: None) == (5, 1)
    assert "private" not in (tmp_path / "failures.json").read_text()
    with pytest.raises(ValueError, match="incomplete"):
        load_results(tmp_path, complete=True)
    calls.clear()
    factory = lambda model: FakeScorer(model, calls)  # noqa: E731
    assert score_event(event, tmp_path, "latest", factory, progress=lambda _: None) == (6, 0)
    assert len(calls) == 1
    assert (tmp_path / "failures.json").read_text().strip() == "{}"


def test_locks_and_corruption(tmp_path):
    calls = []
    factory = lambda model: FakeScorer(model, calls)  # noqa: E731
    event = event_of_size()
    (tmp_path / ".lock").touch()
    with pytest.raises(ValueError, match="locked"):
        score_event(event, tmp_path, "latest", factory)
    (tmp_path / ".lock").unlink()
    score_event(event, tmp_path, "latest", factory, progress=lambda _: None)
    pair_path(tmp_path, "0", "1").write_text("not json")
    with pytest.raises(ValueError):
        load_results(tmp_path)


def test_pair_paths_cannot_escape_directory(tmp_path):
    path = pair_path(tmp_path, "../../outside", "/absolute")
    assert path.parent == tmp_path / "pairs"
    assert path == pair_path(tmp_path, "/absolute", "../../outside")


@pytest.mark.parametrize("status,attempts", [(503, 3), (401, 1)])
def test_sdk_retry_policy(monkeypatch, status, attempts):
    import httpx2
    from typesafe_sdk import TypeSafeClient

    from conference_match.scoring import JevScorer

    calls = []

    def respond(request):
        calls.append(request)
        return httpx2.Response(status, json={"error": "test failure"})

    def client(**kwargs):
        from dataclasses import replace

        kwargs["retry"] = replace(kwargs["retry"], backoff_initial=0, backoff_jitter=0)
        return TypeSafeClient(**kwargs, transport=httpx2.MockTransport(respond))

    monkeypatch.setenv("JEV_API_KEY", "not-a-real-key")
    monkeypatch.setattr("conference_match.scoring.TypeSafeClient", client)
    event = event_of_size(2)
    with pytest.raises(RuntimeError, match="Jev request failed"):
        JevScorer().score(event, *event.participants)
    assert len(calls) == attempts
