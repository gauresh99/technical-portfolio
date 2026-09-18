from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .transcript import Transcript, transcript_from_plain_text


class SpeechToTextAdapter(Protocol):
    def transcribe(self, audio: bytes) -> Transcript:
        """Return a transcript from recorded answer audio."""


@dataclass
class DemoSpeechToText:
    text: str
    seconds: float = 45.0

    def transcribe(self, audio: bytes) -> Transcript:
        del audio
        return transcript_from_plain_text(self.text, self.seconds)

