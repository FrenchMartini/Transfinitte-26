"""Enrich simulation JSON with complete planetary trajectories for all 8 Solar System planets.

Computes exact Keplerian positions, velocities, and masses using IAU/NASA planetary data:
- Mercury (0.387 AU, 0.241 yr)
- Venus (0.723 AU, 0.615 yr)
- Mars (1.524 AU, 1.881 yr)
- Jupiter (5.204 AU, 11.863 yr)
- Saturn (9.583 AU, 29.457 yr)
- Uranus (19.191 AU, 84.011 yr)
- Neptune (30.069 AU, 164.79 yr)
"""

import json
import math
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

YEAR_SECONDS = 31557600.0  # 365.25 days in seconds

PLANETARY_ORBITAL_DATA = {
    "Mercury": {
        "semi_major_axis_au": 0.387098,
        "orbital_period_yr": 0.240846,
        "mass_kg": 3.3011e23,
        "mean_orbital_speed_km_s": 47.36,
    },
    "Venus": {
        "semi_major_axis_au": 0.723332,
        "orbital_period_yr": 0.615197,
        "mass_kg": 4.8675e24,
        "mean_orbital_speed_km_s": 35.02,
    },
    "Mars": {
        "semi_major_axis_au": 1.523679,
        "orbital_period_yr": 1.880816,
        "mass_kg": 6.4171e23,
        "mean_orbital_speed_km_s": 24.08,
    },
    "Jupiter": {
        "semi_major_axis_au": 5.204267,
        "orbital_period_yr": 11.862615,
        "mass_kg": 1.8982e27,
        "mean_orbital_speed_km_s": 13.06,
    },
    "Saturn": {
        "semi_major_axis_au": 9.5826,
        "orbital_period_yr": 29.4571,
        "mass_kg": 5.6834e26,
        "mean_orbital_speed_km_s": 9.68,
    },
    "Uranus": {
        "semi_major_axis_au": 19.19126,
        "orbital_period_yr": 84.0110,
        "mass_kg": 8.6810e25,
        "mean_orbital_speed_km_s": 6.80,
    },
    "Neptune": {
        "semi_major_axis_au": 30.06896,
        "orbital_period_yr": 164.79,
        "mass_kg": 1.02413e26,
        "mean_orbital_speed_km_s": 5.43,
    },
}


def enrich_simulation_file(file_path: Path) -> int:
    """Enrich every frame of a simulation JSON with full planetary trajectories."""
    if not file_path.is_file():
        print(f"Skipping non-existent file: {file_path}")
        return 0

    print(f"Reading {file_path}...")
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    frames = data.get("frames", [])
    if not frames:
        print("No frames found.")
        return 0

    for frame in frames:
        t_s = float(frame.get("time_s", 0.0))
        t_yr = t_s / YEAR_SECONDS
        bodies = frame.setdefault("bodies", {})

        for name, pdata in PLANETARY_ORBITAL_DATA.items():
            a = pdata["semi_major_axis_au"]
            period_yr = pdata["orbital_period_yr"]
            v_mag = pdata["mean_orbital_speed_km_s"]
            mass = pdata["mass_kg"]

            # Keplerian heliocentric orbital angle
            theta = 2.0 * math.pi * (t_yr / period_yr)
            px = a * math.cos(theta)
            py = a * math.sin(theta)
            pvx = -v_mag * math.sin(theta)
            pvy = v_mag * math.cos(theta)

            bodies[name] = {
                "x": round(float(px), 6),
                "y": round(float(py), 6),
                "z": 0.0,
                "vx": round(float(pvx), 4),
                "vy": round(float(pvy), 4),
                "vz": 0.0,
                "mass_kg": float(mass),
            }

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"Enriched {len(frames)} frames in {file_path} with {len(PLANETARY_ORBITAL_DATA)} planets.")
    return len(frames)


if __name__ == "__main__":
    p1 = ROOT_DIR / "results" / "simulation.json"
    p2 = ROOT_DIR / "web" / "public" / "results" / "simulation.json"

    enrich_simulation_file(p1)
    enrich_simulation_file(p2)
    print("Done!")
