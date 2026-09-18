from __future__ import annotations

from dataclasses import dataclass
from time import monotonic

from .commands import Direction, WheelchairCommand


@dataclass
class SafetyPolicy:
    max_speed: int = 190
    turn_speed: int = 120
    command_timeout_s: float = 0.9

    def clamp(self, command: WheelchairCommand) -> WheelchairCommand:
        if command.direction is Direction.STOP:
            return command
        limit = self.turn_speed if command.direction in {Direction.LEFT, Direction.RIGHT} else self.max_speed
        return WheelchairCommand(command.direction, max(0, min(limit, command.speed)))


class CommandWatchdog:
    def __init__(self, timeout_s: float):
        self.timeout_s = timeout_s
        self._last_command_at = monotonic()

    def touch(self) -> None:
        self._last_command_at = monotonic()

    def expired(self) -> bool:
        return monotonic() - self._last_command_at > self.timeout_s

