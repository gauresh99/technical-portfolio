from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Direction(str, Enum):
    FORWARD = "FORWARD"
    BACKWARD = "BACKWARD"
    LEFT = "LEFT"
    RIGHT = "RIGHT"
    STOP = "STOP"


@dataclass(frozen=True)
class WheelchairCommand:
    direction: Direction
    speed: int = 160

    def to_wire(self) -> str:
        if self.direction is Direction.STOP:
            return "STOP\n"
        speed = max(0, min(255, int(self.speed)))
        return f"MOVE {self.direction.value} {speed}\n"


COMMAND_ALIASES = {
    "forward": Direction.FORWARD,
    "go forward": Direction.FORWARD,
    "ahead": Direction.FORWARD,
    "aage": Direction.FORWARD,
    "age": Direction.FORWARD,
    "back": Direction.BACKWARD,
    "backward": Direction.BACKWARD,
    "peeche": Direction.BACKWARD,
    "piche": Direction.BACKWARD,
    "left": Direction.LEFT,
    "baaye": Direction.LEFT,
    "baye": Direction.LEFT,
    "right": Direction.RIGHT,
    "daaye": Direction.RIGHT,
    "daye": Direction.RIGHT,
    "stop": Direction.STOP,
    "ruk": Direction.STOP,
    "ruko": Direction.STOP,
}


def normalize_transcript(text: str) -> str:
    cleaned = " ".join(text.lower().strip().replace(".", " ").replace(",", " ").split())
    return cleaned


def parse_command(text: str, default_speed: int = 160) -> WheelchairCommand | None:
    normalized = normalize_transcript(text)
    if not normalized:
        return None

    if normalized in COMMAND_ALIASES:
        return WheelchairCommand(COMMAND_ALIASES[normalized], default_speed)

    for phrase, direction in COMMAND_ALIASES.items():
        if phrase in normalized:
            return WheelchairCommand(direction, default_speed)
    return None

