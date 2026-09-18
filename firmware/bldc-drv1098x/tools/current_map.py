#!/usr/bin/env python3
"""Analyze reverse-exhaust current measurements.

The internship measurements are not recovered, so this tool expects a CSV that
the user can fill from bench notes:

mode,speed_percent,current_a,supply_v
low,28,0.18,24.1
medium,48,0.34,24.0
high,70,0.72,23.8

It prints electrical power and compares each point with the simple fan-law
expectation that power grows roughly with speed cubed.
"""

from __future__ import annotations

import csv
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Measurement:
    mode: str
    speed_percent: float
    current_a: float
    supply_v: float

    @property
    def power_w(self) -> float:
        return self.current_a * self.supply_v


def read_measurements(path: Path) -> list[Measurement]:
    rows: list[Measurement] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            rows.append(
                Measurement(
                    mode=row["mode"].strip(),
                    speed_percent=float(row["speed_percent"]),
                    current_a=float(row["current_a"]),
                    supply_v=float(row["supply_v"]),
                )
            )
    return rows


def summarize(rows: list[Measurement]) -> list[str]:
    if not rows:
        return ["no measurements"]

    baseline = max(rows, key=lambda row: row.speed_percent)
    lines = ["mode,speed_percent,current_a,supply_v,power_w,cubic_expected_w,error_w"]
    for row in rows:
        ratio = row.speed_percent / baseline.speed_percent if baseline.speed_percent else 0.0
        expected = baseline.power_w * ratio**3
        lines.append(
            f"{row.mode},{row.speed_percent:.1f},{row.current_a:.3f},"
            f"{row.supply_v:.2f},{row.power_w:.2f},{expected:.2f},{row.power_w - expected:.2f}"
        )
    return lines


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: current_map.py measurements.csv", file=sys.stderr)
        return 2
    rows = read_measurements(Path(argv[1]))
    print("\n".join(summarize(rows)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

