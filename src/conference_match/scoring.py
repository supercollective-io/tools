"""Small provider boundary; tests supply a fake scorer."""

import os
from typing import Protocol

from dotenv import load_dotenv
from typesafe_sdk import RetryPolicy, Score, ScoreAnswer, TypeSafeClient, TypeSafeError

from conference_match import rubric
from conference_match.models import Assessment, Event, Metric, Participant


class Scorer(Protocol):
    def score(self, event: Event, a: Participant, b: Participant) -> Assessment: ...


class JevScorer:
    def __init__(self, model: str = "jev-latest") -> None:
        load_dotenv()
        self.api_key = os.environ.get("JEV_API_KEY") or os.environ.get("TYPESAFE_API_KEY")
        if not self.api_key:
            raise ValueError("Set JEV_API_KEY in .env or the environment")
        self.model = model

    def score(self, event: Event, a: Participant, b: Participant) -> Assessment:
        if a.id == b.id:
            raise ValueError("Choose two distinct participants")
        questions = {
            key: Score(
                instructions=rubric.COMMON + "\n" + question,
                criteria=rubric.SHARED if key == "shared_inquiry" else rubric.RELEVANCE,
            )
            for key, question in rubric.QUESTIONS.items()
        }
        # SDK handles transient status/connection failures: initial attempt + two retries.
        try:
            with TypeSafeClient(
                api_key=self.api_key, timeout=30, retry=RetryPolicy(max_retries=2)
            ) as client:
                response = client.system_one(
                    state={
                        "event": event.description,
                        "Person A": a.context(),
                        "Person B": b.context(),
                    },
                    questions=questions,
                    model=self.model,
                )
        except TypeSafeError as exc:
            # Do not echo request bodies, credential-bearing URLs or provider error bodies.
            raise RuntimeError(f"Jev request failed ({type(exc).__name__})") from None
        metrics: dict[str, Metric] = {}
        for key in rubric.QUESTIONS:
            answer = response.answers.get(key)
            if not isinstance(answer, ScoreAnswer):
                raise ValueError(f"Jev did not return a Score answer for {key}")
            metrics[key] = Metric(
                score=answer.score, probabilities=answer.probabilities, confidence=answer.confidence
            )
        return Assessment(
            a=a.id,
            b=b.id,
            model=response.model,
            rubric=rubric.fingerprint(),
            metrics=metrics,
            provider_response=response.model_dump(mode="json"),
        )
