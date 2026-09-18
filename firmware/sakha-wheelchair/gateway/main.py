from __future__ import annotations

from sakha.adapters import DemoSpeakerVerifier, DemoSpeechRecognizer, MemoryBluetoothLink
from sakha.gateway import VoiceGateway


def main() -> int:
    link = MemoryBluetoothLink(sent=[])
    gateway = VoiceGateway(
        verifier=DemoSpeakerVerifier(),
        recognizer=DemoSpeechRecognizer("go forward"),
        bluetooth=link,
    )
    command = gateway.handle_audio(b"owner voice sample")
    print(command)
    print("sent:", "".join(link.sent).strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

