from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class TranscriptSegment:
    start_s: float
    end_s: float
    text: str


@dataclass(frozen=True)
class Transcript:
    segments: tuple[TranscriptSegment, ...]

    @property
    def text(self) -> str:
        return " ".join(segment.text for segment in self.segments).strip()

    @property
    def duration_s(self) -> float:
        if not self.segments:
            return 0.0
        return max(segment.end_s for segment in self.segments) - min(segment.start_s for segment in self.segments)

    @property
    def words_per_minute(self) -> float:
        words = re.findall(r"[A-Za-z0-9+#.-]+", self.text)
        duration_min = max(self.duration_s / 60.0, 1e-6)
        return len(words) / duration_min

    @property
    def pause_ratio(self) -> float:
        if len(self.segments) < 2 or self.duration_s <= 0:
            return 0.0
        pauses = 0.0
        ordered = sorted(self.segments, key=lambda item: item.start_s)
        for left, right in zip(ordered, ordered[1:]):
            pauses += max(0.0, right.start_s - left.end_s)
        return min(1.0, pauses / self.duration_s)


def transcript_from_plain_text(text: str, seconds: float = 45.0) -> Transcript:
    return Transcript((TranscriptSegment(0.0, seconds, text.strip()),))

