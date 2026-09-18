from __future__ import annotations

from dataclasses import dataclass

from .scoring import AnswerScore


@dataclass(frozen=True)
class FeedbackItem:
    label: str
    message: str
    severity: str


def build_feedback(score: AnswerScore) -> list[FeedbackItem]:
    items: list[FeedbackItem] = []
    if score.keyword_coverage < 0.35:
        items.append(
            FeedbackItem(
                "resume coverage",
                "Answer did not mention enough resume-specific technical anchors.",
                "high",
            )
        )
    elif score.keyword_coverage < 0.7:
        items.append(
            FeedbackItem(
                "resume coverage",
                "Answer mentioned some expected anchors but could tie them to implementation details.",
                "medium",
            )
        )

    if score.vocal_confidence < 0.45:
        items.append(
            FeedbackItem(
                "delivery",
                "Vocal signal suggests pace, pauses, or volume may be weakening confidence.",
                "medium",
            )
        )

    if score.facial_confidence < 0.35:
        items.append(
            FeedbackItem(
                "facial signal",
                "Facial-emotion layer reads low confidence; treat this as a soft signal, not a diagnosis.",
                "low",
            )
        )

    if not items:
        items.append(
            FeedbackItem(
                "overall",
                "Answer covered the expected anchors with steady delivery.",
                "info",
            )
        )
    return items

