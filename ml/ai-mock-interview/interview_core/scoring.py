from __future__ import annotations

from dataclasses import dataclass

from .audio_features import VocalFeatures, score_vocal_confidence
from .emotion import EmotionFrame, smooth_emotion_confidence
from .resume_keywords import ResumeKeywords


@dataclass(frozen=True)
class AnswerSignals:
    transcript: str
    vocal: VocalFeatures
    emotion_frames: list[EmotionFrame]


@dataclass(frozen=True)
class AnswerScore:
    keyword_coverage: float
    vocal_confidence: float
    facial_confidence: float
    combined: float


def score_answer(keywords: ResumeKeywords, signals: AnswerSignals) -> AnswerScore:
    keyword = keywords.coverage(signals.transcript)
    vocal = score_vocal_confidence(signals.vocal)
    facial = smooth_emotion_confidence(signals.emotion_frames)
    combined = 0.46 * keyword + 0.30 * vocal + 0.24 * facial
    return AnswerScore(
        keyword_coverage=keyword,
        vocal_confidence=vocal,
        facial_confidence=facial,
        combined=combined,
    )

