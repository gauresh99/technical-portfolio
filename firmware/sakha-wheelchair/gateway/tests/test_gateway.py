import unittest

from sakha.adapters import DemoSpeakerVerifier, DemoSpeechRecognizer, MemoryBluetoothLink
from sakha.commands import Direction, parse_command
from sakha.enrollment import EnrollmentStore
from sakha.gateway import VoiceGateway
from sakha.safety import SafetyPolicy
from sakha.simulator import WheelchairSimulator

from pathlib import Path
from tempfile import TemporaryDirectory


class CommandParserTests(unittest.TestCase):
    def test_english_command(self):
        cmd = parse_command("Please go forward")
        self.assertIsNotNone(cmd)
        self.assertEqual(cmd.direction, Direction.FORWARD)
        self.assertEqual(cmd.to_wire(), "MOVE FORWARD 160\n")

    def test_hindi_transliteration_command(self):
        cmd = parse_command("ruko")
        self.assertIsNotNone(cmd)
        self.assertEqual(cmd.direction, Direction.STOP)
        self.assertEqual(cmd.to_wire(), "STOP\n")


class GatewayTests(unittest.TestCase):
    def test_verified_speaker_sends_command(self):
        link = MemoryBluetoothLink(sent=[])
        gateway = VoiceGateway(
            verifier=DemoSpeakerVerifier(),
            recognizer=DemoSpeechRecognizer("left"),
            bluetooth=link,
            default_speed=120,
        )
        cmd = gateway.handle_audio(b"owner sample")
        self.assertEqual(cmd.direction, Direction.LEFT)
        self.assertEqual(link.sent, ["MOVE LEFT 120\n"])

    def test_unverified_speaker_fails_closed(self):
        link = MemoryBluetoothLink(sent=[])
        gateway = VoiceGateway(
            verifier=DemoSpeakerVerifier(),
            recognizer=DemoSpeechRecognizer("forward"),
            bluetooth=link,
        )
        self.assertIsNone(gateway.handle_audio(b"stranger sample"))
        self.assertEqual(link.sent, ["STOP\n"])

    def test_safety_clamps_forward_speed(self):
        link = MemoryBluetoothLink(sent=[])
        gateway = VoiceGateway(
            verifier=DemoSpeakerVerifier(),
            recognizer=DemoSpeechRecognizer("forward"),
            bluetooth=link,
            default_speed=255,
            safety=SafetyPolicy(max_speed=180),
        )
        cmd = gateway.handle_audio(b"owner sample")
        self.assertEqual(cmd.speed, 180)
        self.assertEqual(link.sent, ["MOVE FORWARD 180\n"])


class EnrollmentTests(unittest.TestCase):
    def test_enrollment_round_trip(self):
        with TemporaryDirectory() as tmp:
            store = EnrollmentStore(Path(tmp) / "owner.json")
            store.enroll("owner", b"voice sample", ("en-IN", "hi-IN"))
            self.assertTrue(store.matches_local_demo(b"voice sample"))
            self.assertFalse(store.matches_local_demo(b"other voice"))


class SimulatorTests(unittest.TestCase):
    def test_stop_clears_motion(self):
        sim = WheelchairSimulator()
        sim.apply(parse_command("forward"))
        self.assertTrue(sim.state.moving)
        sim.apply(parse_command("stop"))
        self.assertFalse(sim.state.moving)


if __name__ == "__main__":
    unittest.main()
