from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class SpeakerVerifier(Protocol):
    def matches_owner(self, audio: bytes) -> bool:
        """Return True only when the enrolled owner's voice matches."""


class SpeechRecognizer(Protocol):
    def transcribe(self, audio: bytes) -> str:
        """Return recognized speech in English or Hindi transliteration."""


class BluetoothLink(Protocol):
    def send(self, payload: str) -> None:
        """Send a newline-terminated command to the HC-05 link."""


@dataclass
class DemoSpeakerVerifier:
    enrolled_phrase: bytes = b"owner"

    def matches_owner(self, audio: bytes) -> bool:
        return self.enrolled_phrase in audio


@dataclass
class DemoSpeechRecognizer:
    transcript: str

    def transcribe(self, audio: bytes) -> str:
        del audio
        return self.transcript


@dataclass
class MemoryBluetoothLink:
    sent: list[str]

    def send(self, payload: str) -> None:
        self.sent.append(payload)

