"""Validated inputs and persisted model assessments."""

import json
import math
from pathlib import Path
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

METRICS = ("a_to_b", "b_to_a", "shared_inquiry")


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Participant(Record):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    profile: str | None = None
    offers: str | None = None
    needs: str | None = None

    @model_validator(mode="after")
    def valid_text(self) -> Self:
        if not self.id.strip() or not self.name.strip():
            raise ValueError("Participant IDs and names must not be blank")
        if self.profile is not None:
            if not self.profile.strip() or self.offers is not None or self.needs is not None:
                raise ValueError("Use a nonblank profile OR offers and needs, not both")
        elif not (self.offers and self.offers.strip() and self.needs and self.needs.strip()):
            raise ValueError("Both offers and needs must be nonblank")
        return self

    def context(self) -> dict[str, str]:
        if self.profile is not None:
            return {"profile": self.profile}
        return {"offers": self.offers or "", "needs": self.needs or ""}


class Event(Record):
    description: str = Field(min_length=1)
    participants: list[Participant] = Field(min_length=2)

    @model_validator(mode="after")
    def unique_ids(self) -> Self:
        if not self.description.strip():
            raise ValueError("Event description must not be blank")
        ids = [p.id for p in self.participants]
        if len(ids) != len(set(ids)):
            raise ValueError("Participant IDs must be unique")
        return self

    def person(self, identifier: str) -> Participant:
        for person in self.participants:
            if person.id == identifier:
                return person
        raise ValueError(f"Unknown participant ID: {identifier}")


class Metric(Record):
    score: float = Field(ge=0, le=4)
    probabilities: dict[int, float]
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def distribution(self) -> Self:
        if set(self.probabilities) != set(range(5)):
            raise ValueError("Expected probability for every rubric level 0–4")
        if any(not math.isfinite(p) or not 0 <= p <= 1 for p in self.probabilities.values()):
            raise ValueError("Invalid probability")
        if not math.isclose(sum(self.probabilities.values()), 1, abs_tol=0.0555):
            raise ValueError("Probabilities must sum to one")
        expected = sum(k * v for k, v in self.probabilities.items())
        if not math.isclose(expected, self.score, abs_tol=0.055):
            raise ValueError("Score disagrees with distribution")
        return self

    @property
    def normalised(self) -> float:
        return self.score / 4


class Assessment(Record):
    a: str
    b: str
    model: str
    rubric: str
    metrics: dict[str, Metric]
    provider_response: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def valid_pair(self) -> Self:
        if self.a == self.b or set(self.metrics) != set(METRICS):
            raise ValueError("Expected distinct participants and exactly three metrics")
        return self

    @property
    def components(self) -> dict[str, float]:
        return {key: self.metrics[key].normalised for key in METRICS}

    @property
    def weight(self) -> float:
        return sum(self.components.values())


def load_event(path: Path) -> Event:
    return Event.model_validate(json.loads(path.read_text()))


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    temporary.replace(path)
