#!/usr/bin/env python3
"""Independent closed-form slow spiral trajectory calculation (Step 4.2 Section C).

CRITICAL REQUIREMENT:
Imports NOTHING from the octo package. Uses only standard library math, sys, and json.

Governing equations:
  v(t) = v0 - (F_eff / M_earth) * t
  r(t) = GM_sun / (v(t)^2)
  F_eff = F_thrust * cos(cant_angle) * cos(yaw_angle)
"""

import json
import math
import sys

# Standard physical constants (CODATA / IAU SI units)
GM_SUN = 1.32712440018e20        # m^3 / s^2
M_EARTH = 5.9722e24              # kg
AU = 1.495978707e11              # m
YEAR = 31557600.0                # s (Julian year)
C_LIGHT = 299792458.0            # m / s


def compute_spiral_orbit(
    t_years: float,
    f_thrust_n: float = 2.208e17,
    cant_angle_deg: float = 5.0,
    yaw_angle_deg: float = 8.6,
    r0_au: float = 1.0,
) -> dict[str, float]:
    """Compute orbital radius and velocity at t_years under constant tangential effective thrust."""
    cant_rad = math.radians(cant_angle_deg)
    yaw_rad = math.radians(yaw_angle_deg)
    f_eff = f_thrust_n * math.cos(cant_rad) * math.cos(yaw_rad)
    a_eff = f_eff / M_EARTH

    r0_m = r0_au * AU
    v0_m_s = math.sqrt(GM_SUN / r0_m)

    t_s = t_years * YEAR
    v_t = v0_m_s - a_eff * t_s
    if v_t <= 0.0:
        raise ValueError(f"Velocity non-positive at t={t_years} yr: {v_t} m/s")

    r_t_m = GM_SUN / (v_t**2)
    r_t_au = r_t_m / AU

    return {
        "t_years": t_years,
        "t_seconds": t_s,
        "f_thrust_n": f_thrust_n,
        "f_eff_n": f_eff,
        "a_eff_m_s2": a_eff,
        "v0_m_s": v0_m_s,
        "v_m_s": v_t,
        "r_m": r_t_m,
        "r_au": r_t_au,
    }


def compute_benchmark_table(
    f_thrust_n: float = 2.208e17,
    cant_angle_deg: float = 5.0,
    yaw_angle_deg: float = 8.6,
) -> dict[str, float]:
    """Compute reference table for 100, 500, and 1000 years with cant and yaw losses."""
    res_100 = compute_spiral_orbit(100.0, f_thrust_n, cant_angle_deg, yaw_angle_deg)
    res_500 = compute_spiral_orbit(500.0, f_thrust_n, cant_angle_deg, yaw_angle_deg)
    res_1000 = compute_spiral_orbit(1000.0, f_thrust_n, cant_angle_deg, yaw_angle_deg)

    return {
        "earth_a_100yr_au": round(res_100["r_au"], 4),
        "earth_a_500yr_au": round(res_500["r_au"], 4),
        "earth_a_1000yr_au": round(res_1000["r_au"], 4),
        "f_thrust_n": f_thrust_n,
        "f_eff_n": res_100["f_eff_n"],
        "cant_deg": cant_angle_deg,
        "yaw_deg": yaw_angle_deg,
    }


if __name__ == "__main__":
    table_nominal = compute_benchmark_table(f_thrust_n=2.208e17)
    print("=== Reference Spiral Table with Losses (Nominal F=2.208e17 N) ===")
    print(f"100 yr:  {table_nominal['earth_a_100yr_au']:.4f} AU")
    print(f"500 yr:  {table_nominal['earth_a_500yr_au']:.4f} AU")
    print(f"1000 yr: {table_nominal['earth_a_1000yr_au']:.4f} AU")
    print(f"Effective force: {table_nominal['f_eff_n']:.3e} N (losses: {100*(1 - table_nominal['f_eff_n']/2.208e17):.2f}%)")

    # Also compute with adopted 9500-yr thrust
    table_adopted = compute_benchmark_table(f_thrust_n=2.35787e17)
    print("\n=== Reference Spiral Table with Losses (Adopted F=2.358e17 N for 9500 yr) ===")
    print(f"100 yr:  {table_adopted['earth_a_100yr_au']:.4f} AU")
    print(f"500 yr:  {table_adopted['earth_a_500yr_au']:.4f} AU")
    print(f"1000 yr: {table_adopted['earth_a_1000yr_au']:.4f} AU")
