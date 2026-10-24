#!/usr/bin/env python3
"""Independent closed-form slow spiral trajectory calculation (Step 4.2 & Step 4.3).

CRITICAL REQUIREMENT:
Imports NOTHING from the octo package. Uses only standard library math, sys, json, pathlib, and yaml.

Governing equations:
  gamma = 1 / sqrt(1 - (v_e / c)^2)
  F_nom = mdot * gamma * v_e
  F_cant = F_nom * cos(cant_angle)
  F_photon = P_beam / c
  yaw_angle = arctan(F_photon / F_cant)
  F_eff = F_nom * cos(cant_angle) * cos(yaw_angle)
  v(t) = v0 - (F_eff / M_earth) * t
  r(t) = GM_sun / (v(t)^2)
"""

import json
import math
from pathlib import Path
import sys
import yaml

# Standard physical constants (CODATA / IAU SI units)
GM_SUN = 1.32712440018e20        # m^3 / s^2
M_EARTH = 5.9722e24              # kg
AU = 1.495978707e11              # m
YEAR = 31557600.0                # s (Julian year)
C_LIGHT = 299792458.0            # m / s

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = ROOT_DIR / "config" / "base.yaml"
DEFAULT_REF_PATH = ROOT_DIR / "results" / "reference.json"


def compute_spiral_orbit(
    t_years: float,
    f_thrust_n: float,
    cant_angle_deg: float,
    yaw_angle_deg: float,
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


def compute_benchmark_from_config(config_path: str | Path = DEFAULT_CONFIG_PATH) -> dict[str, float]:
    """Read propulsion and ceres_tug inputs from config/base.yaml and compute closed-form spiral benchmarks."""
    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    prop_cfg = cfg["propulsion"]
    tug_cfg = cfg["ceres_tug"]
    init_cfg = cfg.get("initial_conditions", {})
    target_cfg = cfg.get("target_orbit", {})

    mdot = float(prop_cfg["mass_flow_kg_s"])
    ve = float(prop_cfg["exhaust_velocity_m_s"])
    beta = ve / C_LIGHT
    gamma = 1.0 / math.sqrt(1.0 - beta**2)
    f_nom = mdot * gamma * ve

    cant_deg = float(tug_cfg["cone_half_angle_deg"])
    cant_rad = math.radians(cant_deg)
    f_cant = f_nom * math.cos(cant_rad)

    p_beam = float(tug_cfg["beam_power_w"])
    f_photon = p_beam / C_LIGHT
    yaw_rad = math.atan(f_photon / f_cant)
    yaw_deg = math.degrees(yaw_rad)

    f_eff = f_nom * math.cos(cant_rad) * math.cos(yaw_rad)
    a_eff = f_eff / M_EARTH

    r0_au = float(init_cfg.get("semi_major_axis_au", 1.0))
    target_au = float(target_cfg.get("semi_major_axis_au", 2.7))

    v0 = math.sqrt(GM_SUN / (r0_au * AU))
    v_target = math.sqrt(GM_SUN / (target_au * AU))
    arrival_time_yr = ((v0 - v_target) / a_eff) / YEAR

    res_100 = compute_spiral_orbit(100.0, f_nom, cant_deg, yaw_deg, r0_au=r0_au)
    res_500 = compute_spiral_orbit(500.0, f_nom, cant_deg, yaw_deg, r0_au=r0_au)
    res_1000 = compute_spiral_orbit(1000.0, f_nom, cant_deg, yaw_deg, r0_au=r0_au)

    return {
        "f_nominal_n": f_nom,
        "f_effective_n": f_eff,
        "cant_angle_deg": cant_deg,
        "yaw_angle_deg": yaw_deg,
        "earth_a_100yr_au": res_100["r_au"],
        "earth_a_500yr_au": res_500["r_au"],
        "earth_a_1000yr_au": res_1000["r_au"],
        "closed_form_arrival_yr": arrival_time_yr,
    }


def compute_benchmark_table(
    f_thrust_n: float | None = None,
    cant_angle_deg: float | None = None,
    yaw_angle_deg: float | None = None,
    config_path: str | Path = DEFAULT_CONFIG_PATH,
) -> dict[str, float]:
    """Compute reference table for 100, 500, and 1000 years (defaults to reading config/base.yaml)."""
    if f_thrust_n is None or cant_angle_deg is None or yaw_angle_deg is None:
        return compute_benchmark_from_config(config_path)

    res_100 = compute_spiral_orbit(100.0, f_thrust_n, cant_angle_deg, yaw_angle_deg)
    res_500 = compute_spiral_orbit(500.0, f_thrust_n, cant_angle_deg, yaw_angle_deg)
    res_1000 = compute_spiral_orbit(1000.0, f_thrust_n, cant_angle_deg, yaw_angle_deg)

    return {
        "f_nominal_n": f_thrust_n,
        "f_effective_n": res_100["f_eff_n"],
        "cant_angle_deg": cant_angle_deg,
        "yaw_angle_deg": yaw_angle_deg,
        "earth_a_100yr_au": res_100["r_au"],
        "earth_a_500yr_au": res_500["r_au"],
        "earth_a_1000yr_au": res_1000["r_au"],
    }


def update_reference_json(
    config_path: str | Path = DEFAULT_CONFIG_PATH,
    ref_path: str | Path = DEFAULT_REF_PATH,
) -> dict[str, float]:
    """Regenerate spiral_trajectory_benchmark in results/reference.json from config/base.yaml."""
    computed = compute_benchmark_from_config(config_path)
    with open(ref_path, "r", encoding="utf-8") as f:
        ref_doc = json.load(f)

    old_entry = ref_doc.get("spiral_trajectory_benchmark", {})
    rel_tol = old_entry.get("rel_tol", 1.0e-3)

    ref_doc["spiral_trajectory_benchmark"] = {
        "f_nominal_n": round(computed["f_nominal_n"], 6),
        "f_effective_n": round(computed["f_effective_n"], 6),
        "cant_angle_deg": round(computed["cant_angle_deg"], 6),
        "yaw_angle_deg": round(computed["yaw_angle_deg"], 6),
        "earth_a_100yr_au": round(computed["earth_a_100yr_au"], 6),
        "earth_a_500yr_au": round(computed["earth_a_500yr_au"], 6),
        "earth_a_1000yr_au": round(computed["earth_a_1000yr_au"], 6),
        "closed_form_arrival_yr": round(computed["closed_form_arrival_yr"], 2),
        "rel_tol": rel_tol,
        "status": "ASSUMED",
        "source": "Independent closed-form slow spiral computed directly from config/base.yaml (tools/closed_form_spiral.py)",
    }

    with open(ref_path, "w", encoding="utf-8") as f:
        json.dump(ref_doc, f, indent=2)
        f.write("\n")

    return ref_doc["spiral_trajectory_benchmark"]


if __name__ == "__main__":
    update_flag = "--update-reference" in sys.argv
    res = compute_benchmark_from_config()
    print("=== Closed-Form Spiral Benchmark (from config/base.yaml) ===")
    print(f"F_nom:       {res['f_nominal_n']:.6e} N")
    print(f"F_eff:       {res['f_effective_n']:.6e} N")
    print(f"Cant angle:  {res['cant_angle_deg']:.4f} deg")
    print(f"Yaw angle:   {res['yaw_angle_deg']:.4f} deg")
    print(f"a(100 yr):   {res['earth_a_100yr_au']:.6f} AU")
    print(f"a(500 yr):   {res['earth_a_500yr_au']:.6f} AU")
    print(f"a(1000 yr):  {res['earth_a_1000yr_au']:.6f} AU")
    print(f"Arrival yr:  {res['closed_form_arrival_yr']:.2f} yr (at 2.7 AU)")
    if update_flag:
        updated = update_reference_json()
        print("\nUpdated results/reference.json -> spiral_trajectory_benchmark.")
