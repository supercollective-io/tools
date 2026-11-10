import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from conference_match import cli, rubric
from conference_match.models import METRICS, Assessment, Event, Metric, Participant, load_event
from conference_match.scoring import JevScorer


def metric(level: int) -> Metric:
    return Metric(score=level, confidence=1, probabilities={i: float(i == level) for i in range(5)})


def test_profiles_preserve_original_text():
    raw = Participant(id="a", name="A", profile="  I build things.\nI seek collaborators. ")
    assert raw.context()["profile"] == raw.profile
    assert "name" not in raw.context()
    assert len(load_event(Path("examples/event.json")).participants) >= 6


@pytest.mark.parametrize(
    "fields",
    [
        {"profile": " "},
        {"offers": "some", "needs": ""},
        {"profile": "text", "offers": "text", "needs": "text"},
    ],
)
def test_invalid_profiles(fields):
    with pytest.raises(ValidationError):
        Participant(id="a", name="A", **fields)


def test_duplicate_ids():
    person = Participant(id="a", name="A", profile="text")
    with pytest.raises(ValidationError):
        Event(description="test", participants=[person, person])


def test_distribution_validation_and_sum():
    with pytest.raises(ValidationError):
        Metric(score=2, confidence=1, probabilities={0: 1})
    with pytest.raises(ValidationError):
        Metric(score=2, confidence=1, probabilities={i: float(i == 4) for i in range(5)})
    assessment = Assessment(
        a="a",
        b="b",
        model="fake",
        rubric=rubric.fingerprint(),
        metrics=dict(zip(METRICS, [metric(4), metric(2), metric(1)], strict=True)),
    )
    assert assessment.components == {"a_to_b": 1, "b_to_a": 0.5, "shared_inquiry": 0.25}
    assert assessment.weight == 1.75


def test_cli_assess(monkeypatch, tmp_path, capsys):
    class FakeScorer:
        def __init__(self, model):
            pass

        def score(self, event, a, b):
            assert a.id == "1cv563y" and b.id == "1jgjvjt"
            return Assessment(
                a=a.id,
                b=b.id,
                model="fake",
                rubric=rubric.fingerprint(),
                metrics={k: metric(3) for k in METRICS},
            )

    monkeypatch.setattr(cli, "JevScorer", FakeScorer)
    output = tmp_path / "assessment.json"
    monkeypatch.setattr(
        "sys.argv",
        [
            "match",
            "assess",
            "examples/event.json",
            "--a",
            "1cv563y",
            "--b",
            "1jgjvjt",
            "--output",
            str(output),
        ],
    )
    assert cli.main() == 0
    assert json.loads(output.read_text())["model"] == "fake"
    assert "sum: 2.250" in capsys.readouterr().out


def test_missing_credentials(monkeypatch):
    monkeypatch.setattr("conference_match.scoring.load_dotenv", lambda: None)
    monkeypatch.delenv("JEV_API_KEY", raising=False)
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    with pytest.raises(ValueError, match="Set JEV_API_KEY"):
        JevScorer()


def test_sdk_boundary(monkeypatch):
    from typesafe_sdk import SystemOneResponse

    class Client:
        def __init__(self, **kwargs):
            assert kwargs["api_key"] == "test-key"
            assert kwargs["retry"].max_retries == 2

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def system_one(self, *, state, questions, model):
            assert "name" not in state["Person A"]
            assert "Person A offers" in questions["a_to_b"].instructions
            assert len(questions) == 3
            return SystemOneResponse.model_validate(
                {
                    "model": "test-model",
                    "answers": {
                        key: {
                            "type": "score",
                            "legend": dict(enumerate(rubric.RELEVANCE)),
                            **metric(3).model_dump(),
                        }
                        for key in METRICS
                    },
                    "usage": {"input_tokens": 100, "output_tokens": 0},
                }
            )

    monkeypatch.setenv("JEV_API_KEY", "test-key")
    monkeypatch.setattr("conference_match.scoring.TypeSafeClient", Client)
    event = load_event(Path("examples/event.json"))
    result = JevScorer().score(event, *event.participants[:2])
    assert result.model == "test-model"
    assert result.weight == 2.25


def test_provider_rounding_is_preserved():
    result = Metric(
        score=2.97, confidence=0.7, probabilities={0: 0.0, 1: 0.0, 2: 0.1, 3: 0.79, 4: 0.1}
    )
    assert sum(result.probabilities.values()) == pytest.approx(0.99)
    assert result.normalised == 2.97 / 4


def test_demo_profiles_have_real_source_attribution():
    event = load_event(Path("examples/event.json"))
    manifest = json.loads(Path("examples/sources.json").read_text())
    sources = {s["id"]: s for s in manifest["profiles"]}
    assert set(sources) == {p.id for p in event.participants}
    for source in sources.values():
        assert source["url"].startswith("https://www.reddit.com/r/INAT/comments/")
        assert source["capture"] and source["adaptation"]
