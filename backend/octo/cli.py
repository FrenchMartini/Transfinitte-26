"""OrbitShift (octo) Command Line Interface.

Usage:
    python -m octo.cli config/base.yaml --report
    python -m octo.cli config/base.yaml --target-radius 2.0 --report
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import yaml

from octo.core import constants
from octo.core.flags import FlagRegistry
from octo.core.thresholds import load_thresholds, has_assumed_thresholds
from octo.core.validator import RulebookValidator
from py.simulate import run_full_spiral_simulation
from py.generate_acceptance_report import generate_acceptance_report


def parse_args(args: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="octo",
        description="OrbitShift (octo) CLI — Deterministic Multi-Physics Orbital Transition Engine",
    )
    parser.add_argument(
        "config",
        type=Path,
        help="Path to YAML configuration file (e.g. config/base.yaml)",
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Generate acceptance report markdown after simulation completes",
    )
    parser.add_argument(
        "--target-radius",
        type=float,
        default=None,
        dest="target_radius_au",
        help="Override target orbital semi-major axis in AU (default: read from config or 2.7 AU)",
    )
    parser.add_argument(
        "--dt-days",
        type=float,
        default=None,
        help="Integration macro-step in days (default: read from config)",
    )
    parser.add_argument(
        "--coast-years",
        type=float,
        default=50.0,
        help="Unpowered ballistic coast duration in years (default: 50.0)",
    )
    parser.add_argument(
        "--downsample-frames",
        type=int,
        default=2500,
        help="Number of downsampled frames in replay JSON (default: 2500)",
    )
    return parser.parse_args(args)


def main(args: list[str] | None = None) -> int:
    parsed = parse_args(args)

    if not parsed.config.is_file():
        print(f"Error: configuration file '{parsed.config}' not found.", file=sys.stderr)
        return 1

    with open(parsed.config, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}

    thresholds = load_thresholds()
    target_au = parsed.target_radius_au
    if target_au is None:
        target_au = float(cfg.get("target_orbit", {}).get("semi_major_axis_au", thresholds["orbit_targets"]["target_radius_au"]["value"]))

    dt_days = parsed.dt_days
    if dt_days is None:
        dt_days = float(cfg.get("integrator", {}).get("dt_macro_days", 14.0))

    print("=" * 60)
    print("ORBITSHIFT (`octo`) SIMULATION CLI")
    print(f"Configuration:   {parsed.config}")
    print(f"Target Orbit:    {target_au:.4f} AU")
    print(f"Step Size (dt):  {dt_days:.1f} days")
    print(f"Coast Duration:  {parsed.coast_years:.1f} years")
    print("=" * 60)

    res = run_full_spiral_simulation(
        target_radius_au=target_au,
        dt_days=dt_days,
        coast_years=parsed.coast_years,
        downsample_frames=parsed.downsample_frames,
    )

    print("\n" + "=" * 60)
    print("MISSION RESULTS & WINNING CONDITIONS")
    print("=" * 60)
    print(f"Arrival Time:     {res['arrival_year']:.2f} years")
    print(f"Final Semi-Major: {res['final_a_au']:.4f} AU")
    print(f"Final Eccentricity: {res['final_e']:.6f}")
    print(f"Total Propellant: {res['total_propellant_kg']:.3e} kg")
    print(f"Wall Time:        {res['wall_time_s']:.2f} s")
    print(f"Validation Pass:  {res['validation_passed']}")
    print("-" * 60)
    print("Winning Conditions:")
    for cond, passed in res["winning_conditions"].items():
        status_sym = "[PASS]" if passed else "[FAIL]"
        print(f"  {status_sym} {cond}")
    print("=" * 60)

    if parsed.report:
        sim_json = Path(res["simulation_json_path"])
        root_dir = parsed.config.resolve().parent.parent
        bench_json = root_dir / "reports" / "benchmarks.json"
        if not bench_json.is_file():
            bench_json = root_dir / "results" / "reference.json"
        rep_out = root_dir / "reports" / "final_acceptance_report.md"
        generate_acceptance_report(sim_json, bench_json, output_md_path=rep_out)
        print(f"Acceptance report generated at: {rep_out}")

    return 0 if res["validation_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
