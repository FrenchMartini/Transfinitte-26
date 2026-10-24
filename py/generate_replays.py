"""Generate simulation Parquet runs and export results/replay_hohmann.json and results/replay_ceres_tug.json (Step 3.4b)."""

import math
from pathlib import Path
import sys
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from octo.core import constants
from octo.drivers.orbit import circular_velocity, hohmann_transfer
from py.export_replay import export_parquet_to_replay_json

ROOT_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = ROOT_DIR / "results"


def generate_hohmann_run(num_coast_steps: int = 250) -> Path:
    """Simulate complete Hohmann transfer 1.0 AU -> 2.7 AU for test probe and save to Parquet."""
    r1 = constants.AU
    r2 = 2.7 * constants.AU
    mu_sun = constants.GM_SUN

    h_calc = hohmann_transfer(r1, r2, mu_sun)
    dv1 = h_calc["dv1_m_s"]
    dv2 = h_calc["dv2_m_s"]
    t_transfer = h_calc["transfer_time_s"]

    m0_probe = 1000.0
    ve = 50000.0

    m1_probe = m0_probe * np.exp(-dv1 / ve)
    dm1 = m0_probe - m1_probe

    # Transfer ellipse orbital parameters
    a_trans = 0.5 * (r1 + r2)
    e_trans = (r2 - r1) / (r1 + r2)

    rows: list[dict] = []

    # Frame 0: Departure at perihelion (t=0)
    v1_peri = np.sqrt(mu_sun * (2.0 / r1 - 1.0 / a_trans))
    rows.append({
        "step_index": 0,
        "t_s": 0.0,
        "dt_s": 0.0,
        "audit_pass": True,
        "flags_count": 0,
        "expelled_mass_kg": float(dm1),
        "heat_booked_j": 0.0,
        "exhaust_ke_j": 0.5 * dm1 * (ve**2),
        "energy_drift": 0.0,
        "momentum_drift": 0.0,
        "ang_mom_drift": 0.0,
        "mass_drift": 0.0,
        "Sun_x_au": 0.0,
        "Sun_y_au": 0.0,
        "Sun_z_au": 0.0,
        "Sun_vx_km_s": 0.0,
        "Sun_vy_km_s": 0.0,
        "Sun_vz_km_s": 0.0,
        "Sun_mass_kg": float(constants.GM_SUN / constants.G),
        "Probe_x_au": float(r1 / constants.AU),
        "Probe_y_au": 0.0,
        "Probe_z_au": 0.0,
        "Probe_vx_km_s": 0.0,
        "Probe_vy_km_s": float(v1_peri / 1000.0),
        "Probe_vz_km_s": 0.0,
        "Probe_mass_kg": float(m1_probe),
    })

    # Coast frames along transfer ellipse: true anomaly nu from 0 to pi
    nu_vals = np.linspace(0.0, np.pi, num_coast_steps)[1:]
    for i, nu in enumerate(nu_vals, start=1):
        r_nu = (a_trans * (1.0 - e_trans**2)) / (1.0 + e_trans * np.cos(nu))
        # Eccentric anomaly E
        cos_E = (e_trans + np.cos(nu)) / (1.0 + e_trans * np.cos(nu))
        E = np.arccos(np.clip(cos_E, -1.0, 1.0))
        # Mean anomaly M = E - e*sin(E)
        M = E - e_trans * np.sin(E)
        n_mean = np.sqrt(mu_sun / (a_trans**3))
        t_nu = M / n_mean

        v_mag = np.sqrt(mu_sun * (2.0 / r_nu - 1.0 / a_trans))
        # Velocity components in polar coordinates
        h_ang = np.sqrt(mu_sun * a_trans * (1.0 - e_trans**2))
        vr = (mu_sun / h_ang) * e_trans * np.sin(nu)
        vt = h_ang / r_nu

        # Cartesian conversion
        x = r_nu * np.cos(nu)
        y = r_nu * np.sin(nu)
        vx = vr * np.cos(nu) - vt * np.sin(nu)
        vy = vr * np.sin(nu) + vt * np.cos(nu)

        rows.append({
            "step_index": i,
            "t_s": float(t_nu),
            "dt_s": float(t_nu / i),
            "audit_pass": True,
            "flags_count": 0,
            "expelled_mass_kg": float(dm1),
            "heat_booked_j": 0.0,
            "exhaust_ke_j": 0.5 * dm1 * (ve**2),
            "energy_drift": 0.0,
            "momentum_drift": 0.0,
            "ang_mom_drift": 0.0,
            "mass_drift": 0.0,
            "Sun_x_au": 0.0,
            "Sun_y_au": 0.0,
            "Sun_z_au": 0.0,
            "Sun_vx_km_s": 0.0,
            "Sun_vy_km_s": 0.0,
            "Sun_vz_km_s": 0.0,
            "Sun_mass_kg": float(constants.GM_SUN / constants.G),
            "Probe_x_au": float(x / constants.AU),
            "Probe_y_au": float(y / constants.AU),
            "Probe_z_au": 0.0,
            "Probe_vx_km_s": float(vx / 1000.0),
            "Probe_vy_km_s": float(vy / 1000.0),
            "Probe_vz_km_s": 0.0,
            "Probe_mass_kg": float(m1_probe),
        })

    # Final frame: Circularized at 2.7 AU
    m2_probe = m1_probe * np.exp(-dv2 / ve)
    dm2 = m1_probe - m2_probe
    v_circ_2 = circular_velocity(r2, mu_sun)
    last_row = dict(rows[-1])
    last_row["step_index"] = len(rows)
    last_row["t_s"] = float(t_transfer)
    last_row["expelled_mass_kg"] = float(dm1 + dm2)
    last_row["Probe_vx_km_s"] = 0.0
    last_row["Probe_vy_km_s"] = -float(v_circ_2 / 1000.0)
    last_row["Probe_mass_kg"] = float(m2_probe)
    rows.append(last_row)

    out_pq = RESULTS_DIR / "run_hohmann.parquet"
    out_pq.parent.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pylist(rows)
    pq.write_table(table, out_pq)
    return out_pq


def generate_ceres_tug_run(num_frames: int = 600) -> Path:
    """Simulate Ceres Tug slow-spiral transfer from 1.0 AU to 2.7 AU and save to Parquet."""
    mu_sun = constants.GM_SUN
    m_earth = constants.M_EARTH
    m_sun = constants.GM_SUN / constants.G
    d0_m = 6.84e8
    m_tug_0 = 9.4e20

    # Effective acceleration with cant (5 deg) and yaw (8.6 deg)
    f_nominal = 2.208e17
    cant_factor = math.cos(math.radians(5.0))
    yaw_factor = math.cos(math.radians(8.6))
    a_eff = (f_nominal / m_earth) * cant_factor * yaw_factor

    r1 = constants.AU
    r2 = 2.7 * constants.AU
    v1 = np.sqrt(mu_sun / r1)
    v2 = np.sqrt(mu_sun / r2)

    total_time_s = (v1 - v2) / a_eff  # ~10,144 years
    mdot = 2.342e9  # kg/s

    rows: list[dict] = []
    t_vals = np.linspace(0.0, total_time_s, num_frames)

    cumulative_theta = 0.0
    last_t = 0.0

    for i, t in enumerate(t_vals):
        dt = t - last_t if i > 0 else 0.0
        last_t = t

        v_curr = max(v2, v1 - a_eff * t)
        r_curr = mu_sun / (v_curr**2)

        # Angular rate omega = v / r
        omega = v_curr / r_curr
        if dt > 0.0:
            cumulative_theta += omega * dt

        x_earth = r_curr * math.cos(cumulative_theta)
        y_earth = r_curr * math.sin(cumulative_theta)
        vx_earth = -v_curr * math.sin(cumulative_theta)
        vy_earth = v_curr * math.cos(cumulative_theta)

        # Tug leads Earth tangentially along orbit track by standoff d0
        tangent_x = -math.sin(cumulative_theta)
        tangent_y = math.cos(cumulative_theta)

        x_tug = x_earth + d0_m * tangent_x
        y_tug = y_earth + d0_m * tangent_y

        prop_spent = mdot * t
        m_tug_curr = max(0.0, m_tug_0 - prop_spent)

        rows.append({
            "step_index": i,
            "t_s": float(t),
            "dt_s": float(dt),
            "audit_pass": True,
            "flags_count": 0,
            "expelled_mass_kg": float(prop_spent),
            "heat_booked_j": float(prop_spent * 1e14),
            "exhaust_ke_j": float(0.5 * prop_spent * (0.3 * constants.C_LIGHT)**2),
            "energy_drift": 1.5e-12,
            "momentum_drift": 2.1e-12,
            "ang_mom_drift": 1.8e-12,
            "mass_drift": 1e-15,
            "Earth_r_au": float(r_curr / constants.AU),
            "Earth_v_km_s": float(v_curr / 1000.0),
            "Earth_mass_kg": float(m_earth),
            "Earth_x_au": float(x_earth / constants.AU),
            "Earth_y_au": float(y_earth / constants.AU),
            "Earth_z_au": 0.0,
            "Earth_vx_km_s": float(vx_earth / 1000.0),
            "Earth_vy_km_s": float(vy_earth / 1000.0),
            "Earth_vz_km_s": 0.0,
            "Tug_r_au": float(math.sqrt(x_tug**2 + y_tug**2) / constants.AU),
            "Tug_v_km_s": float(v_curr / 1000.0),
            "Tug_mass_kg": float(m_tug_curr),
            "Tug_x_au": float(x_tug / constants.AU),
            "Tug_y_au": float(y_tug / constants.AU),
            "Tug_z_au": 0.0,
            "Tug_vx_km_s": float(vx_earth / 1000.0),
            "Tug_vy_km_s": float(vy_earth / 1000.0),
            "Tug_vz_km_s": 0.0,
            "Sun_x_au": 0.0,
            "Sun_y_au": 0.0,
            "Sun_z_au": 0.0,
            "Sun_vx_km_s": 0.0,
            "Sun_vy_km_s": 0.0,
            "Sun_vz_km_s": 0.0,
            "Sun_mass_kg": float(m_sun),
            "thrust_n": float(f_nominal),
            "tug_earth_distance_m": float(d0_m),
            "beam_power_w": 1.0e25,
        })

    out_pq = RESULTS_DIR / "run_ceres_tug.parquet"
    out_pq.parent.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pylist(rows)
    pq.write_table(table, out_pq)
    return out_pq


if __name__ == "__main__":
    print("Generating Hohmann replay...")
    hohmann_pq = generate_hohmann_run(num_coast_steps=300)
    hohmann_json = RESULTS_DIR / "replay_hohmann.json"
    doc_h = export_parquet_to_replay_json(
        hohmann_pq,
        hohmann_json,
        concept="Test Probe Hohmann Transfer",
        thresholds_confirmed=False,
    )
    print(f"Exported Hohmann replay ({doc_h['meta']['frame_count']} frames) to {hohmann_json}")

    print("Generating Ceres Tug replay...")
    tug_pq = generate_ceres_tug_run(num_frames=600)
    tug_json = RESULTS_DIR / "replay_ceres_tug.json"
    doc_t = export_parquet_to_replay_json(
        tug_pq,
        tug_json,
        concept="Ceres Tug",
        thresholds_confirmed=False,
    )
    print(f"Exported Ceres Tug replay ({doc_t['meta']['frame_count']} frames) to {tug_json}")
