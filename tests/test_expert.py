import json

import pytest
from test_runs import FakeScorer, event_of_size

from conference_match.expert import ExpertAnswers, batch_order, make_packet, rank_reviews
from conference_match.models import write_json
from conference_match.review import Judgement, ReviewStore
from conference_match.runs import score_event


def setup_report(tmp_path):
    event = event_of_size(8)
    store = ReviewStore(tmp_path / "review", event)
    run = tmp_path / "run"
    score_event(event, run, "fake", lambda m: FakeScorer(m, []), progress=lambda _: None)
    ids = [p.id for p in store.session.proposals]

    def answers(reverse=False):
        return ExpertAnswers.model_validate(
            {
                "input_hash": store.session.input_hash,
                "judge": "test expert",
                "assessments": [
                    {
                        "proposal_id": i,
                        "choice": "right" if reverse else "left",
                        "reason": "Test evidence",
                        "ambiguous": False,
                    }
                    for i in ids
                ],
            }
        )

    report = rank_reviews(store.session, answers(), answers(True), run)
    return store, run, report, answers


def test_packet_has_full_context_without_labels_or_scores(tmp_path):
    store, _, _, _ = setup_report(tmp_path)
    proposal = store.session.proposals[0]
    store.judge(Judgement(proposal_id=proposal.id, choice="left", reason="PRIVATE HUMAN NOTE"))
    packet = make_packet(store.session)
    backwards = make_packet(store.session, reverse=True)
    encoded = json.dumps(packet)
    assert "PRIVATE HUMAN NOTE" not in encoded
    assert "judgements" not in packet and "history" not in packet
    assert packet["event"] == store.session.event.model_dump(mode="json")
    for a, b in zip(packet["comparisons"], backwards["comparisons"], strict=True):
        assert a["left"] == b["right"] and a["right"] == b["left"]
        assert a["metric"] == b["metric"]


def test_reverse_mapping_and_invalid_coverage(tmp_path):
    store, run, report, answers = setup_report(tmp_path)
    assert all(i.forward.choice == i.reverse.choice == "left" for i in report.items)
    missing = answers()
    missing.assessments.pop()
    with pytest.raises(ValueError, match="exactly once"):
        rank_reviews(store.session, missing, answers(True), run)
    duplicate = answers()
    duplicate.assessments[-1] = duplicate.assessments[0]
    with pytest.raises(ValueError, match="exactly once"):
        rank_reviews(store.session, duplicate, answers(True), run)
    different = answers()
    different.input_hash = "other"
    with pytest.raises(ValueError, match="different event"):
        rank_reviews(store.session, different, answers(True), run)
    unstable = rank_reviews(store.session, answers(), answers(), run)
    assert all(i.priority >= 4 and not i.agreement for i in unstable.items)


def test_batches_mix_audits_and_never_repeat_reviewed_questions(tmp_path):
    _, _, report, _ = setup_report(tmp_path)
    for index, item in enumerate(report.items):
        item.agreement = index % 5 == 0
        item.priority = 0 if item.agreement else 2
    reviewed = {report.items[1].proposal.id}
    batches = batch_order(report, reviewed)
    ids = [i for b in batches for i in b]
    assert len(ids) == len(set(ids)) == len(report.items) - 1
    assert not set(ids).intersection(reviewed)
    assert all(len(b) == 5 for b in batches[:-1])
    agreements = {i.proposal.id for i in report.items if i.agreement}
    assert all(set(b).intersection(agreements) for b in batches[: len(agreements)])
    assert batches == batch_order(report, reviewed)


def test_blind_session_batches_persist_and_export_display_orientation(tmp_path):
    store, _, report, _ = setup_report(tmp_path)
    path = tmp_path / "expert.json"
    write_json(path, report.model_dump(mode="json"))
    store.attach_expert(path)
    original = store.session.model_copy(deep=True)
    public = store.public_session(True)
    assert len(public["proposals"]) == 5
    assert public["has_run"] is False
    assert "batches" not in public
    serialised = json.dumps(public)
    for secret in ("Test evidence", "jev_choice", "jev_margin", "forward_judge", "priority"):
        assert secret not in serialised
    with pytest.raises(ValueError, match="Finish"):
        store.next_batch()
    outside = store.session.batches[1][0]
    with pytest.raises(ValueError, match="current batch"):
        store.judge(Judgement(proposal_id=outside, choice="left"))
    for id in store.session.batches[0]:
        store.judge(Judgement(proposal_id=id, choice="left"))
    assert store.public_session(True)["batch_complete"]
    exported = store.fixtures()
    proposals = {p.id: p for p in store.session.proposals}
    assert all(c.preferred == proposals[c.id].left for c in exported.comparisons)
    store.next_batch()
    assert store.public_session(True)["batch_number"] == 2
    resumed = ReviewStore(store.directory, store.session.event)
    resumed.attach_expert(path)
    assert resumed.session.proposals == original.proposals
    assert resumed.session.batch_index == 1
    with pytest.raises(ValueError, match="hidden"):
        resumed.allocation(None, "none")


def test_attach_rejects_stale_report_and_exposed_workspace(tmp_path):
    store, _, report, _ = setup_report(tmp_path)
    path = tmp_path / "expert.json"
    report.items[0].proposal.left = ("not", "these")
    write_json(path, report.model_dump(mode="json"))
    with pytest.raises(ValueError, match="definitions"):
        store.attach_expert(path)
    store.session.scores_revealed = True
    with pytest.raises(ValueError, match="revealed"):
        store.attach_expert(path)
