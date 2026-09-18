from __future__ import annotations

from dataclasses import asdict, dataclass

from .scoring import AnswerScore, AnswerSignals


@dataclass(frozen=True)
class ScoreTrace:
    transcript: str
    keyword_coverage: float
    vocal_confidence: float
    facial_confidence: float
    combined: float
    notes: tuple[str, ...]

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def build_trace(signals: AnswerSignals, score: AnswerScore) -> ScoreTrace:
    notes = (
        "keyword_coverage is exact keyword coverage, not semantic grading",
        "vocal_confidence uses interpretable volume/pace/pause features",
        "facial_confidence post-processes pretrained classifier outputs",
    )
    return ScoreTrace(
        transcript=signals.transcript,
        keyword_coverage=score.keyword_coverage,
        vocal_confidence=score.vocal_confidence,
        facial_confidence=score.facial_confidence,
        combined=score.combined,
        notes=notes,
    )

