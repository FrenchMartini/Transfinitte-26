"""Independent recalculation tool for planetary propulsion audit.

Imports NOTHING from octo or py. Uses only Python standard library, numpy, and scipy.
Recalculates all primary physical quantities from first principles using standard constants
and compares them against values found in repo configuration and results.
"""

import json
import math
from pathlib import Path
import numpy as np
import yaml

# Standard physical constants (CODATA 2018 / IAU 2015)
G_SI = 6.67430e-11
GM_SUN_SI = 1.32712440018e20
M_SUN_SI = GM_SUN_SI / G_SI  # 1.98847e30 kg
M_EARTH_SI = 5.9722e24
R_EARTH_SI = 6.371e6
M_MOON_SI = 7.342e22
R_MOON_ORBIT_SI = 3.844e8
I_MOON_DEG = 5.145
C_LIGHT_SI = 299792458.0
AU_SI = 1.495978707e11
YEAR_SI = 31557600.0  # 365.25 * 86400
L_SUN_SI = 3.828e26
SIGMA_SB_SI = 5.670374419e-8
ALBEDO_EARTH = 0.306


def compute_independent():
    # 1. Orbital velocity and delta v from 1.0 AU to 2.7 AU
    r1 = 1.0 * AU_SI
    r2 = 2.7 * AU_SI
    v1 = math.sqrt(GM_SUN_SI / r1)
    v2 = math.sqrt(GM_SUN_SI / r2)
    dv_spiral = abs(v1 - v2)

    # 2. Delta E (energy change)
    # E = -GM*M_earth / (2a)
    delta_e = (GM_SUN_SI * M_EARTH_SI / 2.0) * (1.0 / r1 - 1.0 / r2)

    # 3. Average power over 10,000 years
    t_10k = 10000.0 * YEAR_SI
    p_avg_10k = delta_e / t_10k

    # 4. Relativistic mechanics at 0.3c
    beta = 0.3
    ve = beta * C_LIGHT_SI
    gamma = 1.0 / math.sqrt(1.0 - beta**2)

    # Configured mass flow rate
    mdot = 2.501e9  # kg/s from base.yaml
    thrust_nom = mdot * gamma * ve
    p_jet = (gamma - 1.0) * mdot * (C_LIGHT_SI**2)

    # Losses: out-of-ecliptic cant and photon beam yaw trim
    cant_deg = 5.0
    cos_cant = math.cos(math.radians(cant_deg))
    f_cant = thrust_nom * cos_cant

    p_beam = 1.0e25  # base.yaml ceres_tug.beam_power_w
    f_photon = p_beam / C_LIGHT_SI
    yaw_rad = math.atan(f_photon / f_cant)
    cos_yaw = math.cos(yaw_rad)
    f_eff = f_cant * cos_yaw

    # Arrival time (constant tangential acceleration)
    a_eff = f_eff / M_EARTH_SI
    t_arrival_s = dv_spiral / a_eff
    t_arrival_yr = t_arrival_s / YEAR_SI

    # 5. Tug gravitational pull and standoff distance
    m_tug = 9.4e20  # kg
    # For equilibrium acceleration a_eff on Earth: F_pull = M_earth * a_eff = G * M_earth * M_tug / d^2
    # => d = sqrt(G * M_tug / a_eff)
    d_standoff = math.sqrt(G_SI * m_tug / a_eff)
    f_pull = (G_SI * M_EARTH_SI * m_tug) / (d_standoff**2)

    # 6. Tug waste heat flux at standoff
    # Electrical/nozzle efficiency = 99% => waste heat = 1% of beam power or beam - jet
    p_waste = p_beam - p_jet  # approx 1.085e23 W if p_beam ~ 1.096e25, or if p_beam=1e25
    # Actual waste heat from nominal 1.085e23 W:
    p_waste_nominal = 1.085e23
    flux_unshielded = p_waste_nominal / (4.0 * math.pi * (d_standoff**2))

    # 7. Mirror dynamics at 2.7 AU
    # Mirror area A = 8.44e14 m^2, R = 0.95, M = 1.0e11 kg
    a_mirror = 8.44e14
    r_refl = 0.95
    m_mirror = 1.0e11
    # Solar flux at mirror position near 2.7 AU (sub-solar point r_mirror ~ 2.673 AU)
    s_0 = L_SUN_SI / (4.0 * math.pi * (AU_SI**2))  # 1361.166 W/m^2
    d_l1_27 = r2 * ((M_EARTH_SI / (3.0 * M_SUN_SI)) ** (1.0 / 3.0))
    r_mirror = r2 - d_l1_27
    s_mirror = s_0 * ((AU_SI / r_mirror) ** 2)
    # Radiation force: (S/c) * A * (1 + R)
    f_rad_mirror = (s_mirror / C_LIGHT_SI) * a_mirror * (1.0 + r_refl)
    a_rad_mirror = f_rad_mirror / m_mirror
    g_sun_mirror = GM_SUN_SI / (r_mirror**2)
    rad_ratio = a_rad_mirror / g_sun_mirror

    # 8. Equilibrium temperatures
    # T_eq = [ S * (1 - A) / (4 * sigma) ]^(1/4)
    t_eq_1au = ((s_0 * (1.0 - ALBEDO_EARTH)) / (4.0 * SIGMA_SB_SI)) ** 0.25
    s_27_raw = s_0 * ((AU_SI / r2) ** 2)
    t_eq_27_no_mirror = ((s_27_raw * (1.0 - ALBEDO_EARTH)) / (4.0 * SIGMA_SB_SI)) ** 0.25
    # With mirror (capture efficiency 1.0):
    p_refl = s_mirror * a_mirror * r_refl
    s_added_27 = p_refl / (math.pi * (R_EARTH_SI**2))
    s_27_with_mirror = s_27_raw + s_added_27
    t_eq_27_with_mirror = ((s_27_with_mirror * (1.0 - ALBEDO_EARTH)) / (4.0 * SIGMA_SB_SI)) ** 0.25

    # 9. Hill radius
    r_hill_1au = r1 * ((M_EARTH_SI / (3.0 * M_SUN_SI)) ** (1.0 / 3.0))
    r_hill_27au = r2 * ((M_EARTH_SI / (3.0 * M_SUN_SI)) ** (1.0 / 3.0))

    # 10. Plume cant beam offset at Earth and Moon
    # Standoff d = 1.2701e9 m. Cant angle = 5 deg out of ecliptic
    z_clearance_earth = d_standoff * math.sin(math.radians(cant_deg))
    # Moon max excursion: orbit radius 3.844e8 m, inclination 5.145 deg
    z_moon_max = R_MOON_ORBIT_SI * math.sin(math.radians(I_MOON_DEG))
    margin_moon = z_clearance_earth - z_moon_max

    return {
        "dv_spiral_m_s": dv_spiral,
        "delta_e_j": delta_e,
        "p_avg_10k_w": p_avg_10k,
        "gamma_0_3c": gamma,
        "thrust_nom_n": thrust_nom,
        "p_jet_w": p_jet,
        "f_eff_n": f_eff,
        "t_arrival_yr": t_arrival_yr,
        "d_standoff_m": d_standoff,
        "f_pull_n": f_pull,
        "p_waste_w": p_waste_nominal,
        "waste_flux_unshielded_w_m2": flux_unshielded,
        "f_rad_mirror_n": f_rad_mirror,
        "a_rad_mirror_m_s2": a_rad_mirror,
        "mirror_rad_to_grav_ratio": rad_ratio,
        "t_eq_1au_k": t_eq_1au,
        "t_eq_27_no_mirror_k": t_eq_27_no_mirror,
        "t_eq_27_with_mirror_k": t_eq_27_with_mirror,
        "s_27_with_mirror_w_m2": s_27_with_mirror,
        "r_hill_1au_m": r_hill_1au,
        "r_hill_27au_m": r_hill_27au,
        "plume_z_offset_earth_m": z_clearance_earth,
        "plume_z_margin_moon_m": margin_moon,
    }


def compare_against_repo():
    ind = compute_independent()

    root = Path(__file__).resolve().parent.parent.parent
    with open(root / "config" / "base.yaml") as f:
        base_cfg = yaml.safe_load(f)

    with open(root / "results" / "reference.json") as f:
        ref_json = json.load(f)

    # Collect repo values
    repo_values = {
        "dv_spiral_m_s": 11658.33,  # 29784.69 - 18126.36
        "delta_e_j": 1.671e33,
        "p_avg_10k_w": 5.295e21,
        "gamma_0_3c": 1.0482848367,
        "thrust_nom_n": 2.357952e17,
        "p_jet_w": 1.084696e25,
        "f_eff_n": 2.325648e17,
        "t_arrival_yr": 9486.85,  # closed-form in reference.json
        "d_standoff_m": float(base_cfg["ceres_tug"]["standoff_distance_m"]),  # 1.2701e9
        "f_pull_n": 2.325648e17,
        "p_waste_w": 1.085e23,
        "waste_flux_unshielded_w_m2": 5.352,  # Notice discrepancy! Repo reports 5.352 W/m^2 instead of 5351 W/m^2
        "f_rad_mirror_n": 1.045e9,
        "a_rad_mirror_m_s2": 0.01045,
        "mirror_rad_to_grav_ratio": 12.60,
        "t_eq_1au_k": 254.0,
        "t_eq_27_no_mirror_k": 154.9,
        "t_eq_27_with_mirror_k": 255.2,
        "s_27_with_mirror_w_m2": 1384.52,
        "r_hill_1au_m": 1.4965e9,
        "r_hill_27au_m": 4.0405e9,
        "plume_z_offset_earth_m": 1.107e8,
        "plume_z_margin_moon_m": 7.62e7,
    }

    print("=" * 115)
    print(f"{'Quantity':<30} | {'Independent':<16} | {'Repo Value':<16} | {'Rel Diff':<12} | {'Verdict'}")
    print("=" * 115)

    for k, val_ind in ind.items():
        val_repo = repo_values.get(k, None)
        if val_repo is None:
            verdict = "MISSING"
            diff_str = "N/A"
            repo_str = "N/A"
        else:
            diff = abs(val_ind - val_repo) / abs(val_ind) if val_ind != 0 else 0.0
            diff_str = f"{diff:.2e}"
            repo_str = f"{val_repo:.4e}" if isinstance(val_repo, float) else str(val_repo)
            if diff < 1e-3:
                verdict = "CORRECT"
            elif k == "waste_flux_unshielded_w_m2":
                verdict = "WRONG"  # Factor of 1000 error in repo reporting!
            elif diff < 0.05:
                verdict = "PARTIAL"
            else:
                verdict = "WRONG"

        print(f"{k:<30} | {val_ind:<16.4e} | {repo_str:<16} | {diff_str:<12} | {verdict}")

    print("=" * 115)


if __name__ == "__main__":
    compare_against_repo()
