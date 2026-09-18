#!/usr/bin/env python3
"""Decode a DRV1098x register dump captured during bring-up."""

from __future__ import annotations

import sys
from pathlib import Path


NAMES = {
    0x10: "Status",
    0x11: "MotorSpeed1",
    0x12: "MotorSpeed2",
    0x15: "MotorKt1",
    0x16: "MotorKt2",
    0x17: "MotorCurrent1",
    0x18: "MotorCurrent2",
    0x1A: "SupplyVoltage",
    0x1B: "SpeedCmd",
    0x1C: "spdCmdBuffer",
    0x1E: "FaultCode",
}

FAULTS = {
    0: "lock0 current limit",
    1: "lock1 abnormal speed",
    2: "lock2 abnormal Kt",
    3: "fault3 no motor",
    4: "lock4 open-loop stuck",
    5: "lock5 closed-loop stuck",
}


def parse_dump(path: Path) -> dict[int, int]:
    registers: dict[int, int] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if "=" in line:
            left, right = line.split("=", 1)
        else:
            left, right = line.split(None, 1)
        registers[int(left, 0)] = int(right, 0)
    return registers


def decode(registers: dict[int, int]) -> list[str]:
    lines: list[str] = []
    for reg in sorted(registers):
        lines.append(f"0x{reg:02X} {NAMES.get(reg, 'unknown'):<16} 0x{registers[reg]:02X}")

    if 0x11 in registers and 0x12 in registers:
        speed_raw = (registers[0x11] << 8) | registers[0x12]
        lines.append(f"motor_speed_hz={speed_raw / 10:.1f}")
    if 0x17 in registers and 0x18 in registers:
        current_raw = ((registers[0x17] & 0x07) << 8) | registers[0x18]
        if current_raw >= 1023:
            current = 3.0 * (current_raw - 1023) / 512
        else:
            current = 3.0 * current_raw / 512
        lines.append(f"motor_current_a={current:.3f}")
    if 0x1A in registers:
        lines.append(f"supply_v={registers[0x1A] * 30 / 256:.2f}")
    if 0x1E in registers:
        fault = registers[0x1E]
        active = [name for bit, name in FAULTS.items() if fault & (1 << bit)]
        lines.append("faults=" + (", ".join(active) if active else "none"))
    return lines


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: register_dump.py dump.txt", file=sys.stderr)
        return 2
    print("\n".join(decode(parse_dump(Path(argv[1])))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

