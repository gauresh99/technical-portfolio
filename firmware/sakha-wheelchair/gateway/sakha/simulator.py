from __future__ import annotations

from dataclasses import dataclass

from .commands import Direction, WheelchairCommand


@dataclass
class WheelchairState:
    x: float = 0.0
    y: float = 0.0
    heading_deg: float = 0.0
    moving: bool = False


class WheelchairSimulator:
    """Simple kinematic simulator for command sanity checks.

    It is not a physics model of the actual wheelchair. Its job is to catch
    command-protocol mistakes: wrong direction names, turn commands accidentally
    driving backward, and STOP commands failing to clear motion state.
    """

    def __init__(self) -> None:
        self.state = WheelchairState()

    def apply(self, command: WheelchairCommand, dt_s: float = 0.25) -> WheelchairState:
        speed = command.speed / 255.0
        if command.direction is Direction.STOP:
            self.state.moving = False
            return self.state
        if command.direction is Direction.LEFT:
            self.state.heading_deg = (self.state.heading_deg - 45.0 * speed * dt_s) % 360.0
            self.state.moving = True
            return self.state
        if command.direction is Direction.RIGHT:
            self.state.heading_deg = (self.state.heading_deg + 45.0 * speed * dt_s) % 360.0
            self.state.moving = True
            return self.state

        sign = 1.0 if command.direction is Direction.FORWARD else -1.0
        # Heading is kept simple: 0 degrees means forward along +Y.
        self.state.y += sign * speed * dt_s
        self.state.moving = True
        return self.state

