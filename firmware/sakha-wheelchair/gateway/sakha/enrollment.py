from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class EnrollmentRecord:
    user_id: str
    voiceprint_hash: str
    language_codes: tuple[str, ...]


class EnrollmentStore:
    """Tiny file-backed stand-in for the phone app's enrollment state.

    The original API/vendor is not recovered. This class models the important
    product behavior: commands are not accepted until the owner has an enrolled
    reference voiceprint.
    """

    def __init__(self, path: Path):
        self.path = path

    def enroll(self, user_id: str, sample_audio: bytes, languages: tuple[str, ...]) -> EnrollmentRecord:
        record = EnrollmentRecord(
            user_id=user_id,
            voiceprint_hash=self._hash(sample_audio),
            language_codes=languages,
        )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(record.__dict__, indent=2), encoding="utf-8")
        return record

    def load(self) -> EnrollmentRecord | None:
        if not self.path.exists():
            return None
        data = json.loads(self.path.read_text(encoding="utf-8"))
        return EnrollmentRecord(
            user_id=data["user_id"],
            voiceprint_hash=data["voiceprint_hash"],
            language_codes=tuple(data["language_codes"]),
        )

    def matches_local_demo(self, sample_audio: bytes) -> bool:
        record = self.load()
        return bool(record and record.voiceprint_hash == self._hash(sample_audio))

    @staticmethod
    def _hash(sample_audio: bytes) -> str:
        return hashlib.sha256(sample_audio).hexdigest()

