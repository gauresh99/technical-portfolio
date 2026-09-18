from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class VocalFeatures:
    rms_volume: float
    words_per_minute: float
    pause_ratio: float


def score_vocal_confidence(features: VocalFeatures) -> float:
    volume_score = _triangular(features.rms_volume, low=0.03, ideal=0.12, high=0.35)
    pace_score = _triangular(features.words_per_minute, low=85.0, ideal=145.0, high=205.0)
    pause_score = 1.0 - max(0.0, min(1.0, features.pause_ratio / 0.45))
    return 0.38 * volume_score + 0.34 * pace_score + 0.28 * pause_score


def _triangular(value: float, low: float, ideal: float, high: float) -> float:
    if value <= low or value >= high:
        return 0.0
    if value == ideal:
        return 1.0
    if value < ideal:
        return (value - low) / (ideal - low)
    return (high - value) / (high - ideal)

