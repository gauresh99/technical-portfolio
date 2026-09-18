from __future__ import annotations

from dataclasses import dataclass


CONFIDENCE_WEIGHTS = {
    "neutral": 0.60,
    "happy": 0.78,
    "surprise": 0.48,
    "sad": 0.25,
    "fear": 0.15,
    "angry": 0.20,
    "disgust": 0.18,
}


@dataclass(frozen=True)
class EmotionFrame:
    timestamp_s: float
    probabilities: dict[str, float]


def emotion_confidence(frame: EmotionFrame) -> float:
    if not frame.probabilities:
        return 0.0
    score = 0.0
    total = 0.0
    for label, prob in frame.probabilities.items():
        p = max(0.0, float(prob))
        score += CONFIDENCE_WEIGHTS.get(label.lower(), 0.35) * p
        total += p
    return max(0.0, min(1.0, score / total if total else 0.0))


def smooth_emotion_confidence(frames: list[EmotionFrame], half_life_s: float = 3.0) -> float:
    if not frames:
        return 0.0

    end = max(frame.timestamp_s for frame in frames)
    weighted = 0.0
    total_weight = 0.0
    for frame in frames:
        age = max(0.0, end - frame.timestamp_s)
        weight = 0.5 ** (age / half_life_s)
        weighted += emotion_confidence(frame) * weight
        total_weight += weight
    return weighted / total_weight if total_weight else 0.0

