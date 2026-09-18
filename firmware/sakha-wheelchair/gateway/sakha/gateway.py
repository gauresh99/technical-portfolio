from __future__ import annotations

from dataclasses import dataclass, field

from .adapters import BluetoothLink, SpeakerVerifier, SpeechRecognizer
from .commands import WheelchairCommand, parse_command
from .safety import SafetyPolicy


@dataclass
class VoiceGateway:
    verifier: SpeakerVerifier
    recognizer: SpeechRecognizer
    bluetooth: BluetoothLink
    default_speed: int = 160
    safety: SafetyPolicy = field(default_factory=SafetyPolicy)

    def handle_audio(self, audio: bytes) -> WheelchairCommand | None:
        if not self.verifier.matches_owner(audio):
            self.bluetooth.send("STOP\n")
            return None

        transcript = self.recognizer.transcribe(audio)
        command = parse_command(transcript, self.default_speed)
        if command is None:
            self.bluetooth.send("STOP\n")
            return None

        safe_command = self.safety.clamp(command)
        self.bluetooth.send(safe_command.to_wire())
        return safe_command
