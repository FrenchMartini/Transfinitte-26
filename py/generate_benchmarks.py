"""Compute and export the 10 Participant Guide Section 6 validation benchmarks to reports/benchmarks.json.

All expected values, tolerances, and source pages are loaded from results/reference.json.
Every benchmark is evaluated dynamically using Python simulation/physics code (REBOUND IAS15,
orbital mechanics, numerical Biot-Savart / Euler-Bernoulli integration, and habitability radiative balance).
"""

import json
import math
from pathlib import Path
import sys
from typing import Any
import numpy as np
import rebound

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from octo.core import constants
from octo.drivers.habitability import compute_equilibrium_temperature, compute_insolation
from octo.drivers.orbit import hohmann_transfer

REF_PATH = ROOT_DIR / "results" / "reference.json"
DEFAULT_OUT_PATH = ROOT_DIR / "reports" / "benchmarks.json"


def _compute_system_energy(sim: rebound.Simulation) -> float:
    """Compute exact N-body mechanical energy (kinetic + potential) in Joules."""
    return float(sim.energy())


def run_and_write_guide_benchmarks(
    output_path: str | Path = DEFAULT_OUT_PATH,
    ref_path: str | Path = REF_PATH,
) -> dict[str, Any]:
    """Execute all 10 Participant Guide Section 6 benchmarks and write reports/benchmarks.json."""
    with open(ref_path, "r", encoding="utf-8") as f:
        ref_all = json.load(f)
    cfg = ref_all["guide_section6_benchmarks"]

    benchmarks: list[dict[str, Any]] = []

    # -------------------------------------------------------------------------
    # Benchmark 1: Wire, I = 10 A, L = 2 m (x), B = 0.5 T (y) -> 10 N along +z
    # -------------------------------------------------------------------------
    b1_cfg = cfg["b1_lorentz_wire"]
    i_vec_l = float(b1_cfg["current_a"]) * np.array(b1_cfg["length_vec_m"], dtype=np.float64)
    b_vec = np.array(b1_cfg["b_field_vec_t"], dtype=np.float64)
    f_vec = np.cross(i_vec_l, b_vec)
    fz_val = float(f_vec[2])
    b1_err = abs(fz_val - float(b1_cfg["expected_force_z_n"]))
    b1_pass = bool(b1_err <= float(b1_cfg["abs_tol"]) and abs(f_vec[0]) <= float(b1_cfg["abs_tol"]) and abs(f_vec[1]) <= float(b1_cfg["abs_tol"]))
    benchmarks.append({
        "id": int(b1_cfg["id"]),
        "name": b1_cfg["name"],
        "value": fz_val,
        "expected": float(b1_cfg["expected_force_z_n"]),
        "expected_display": "10.0 N along +z",
        "computed": f"{fz_val:.4f} N along +z (err: {b1_err:.1e} N)",
        "tolerance": float(b1_cfg["abs_tol"]),
        "tolerance_display": "1e-9 N",
        "source_page": b1_cfg["source_page"],
        "passed": b1_pass,
        "status": "PASS" if b1_pass else "FAIL",
        "notes": "F = I (L x B) vector cross product",
    })

    # -------------------------------------------------------------------------
    # Benchmark 2: Closed loop in a uniform field -> Net force 0 (tol 1e-9 of I*L*B)
    # -------------------------------------------------------------------------
    b2_cfg = cfg["b2_closed_loop_uniform_b"]
    curr_a = float(b2_cfg["current_a"])
    side_m = float(b2_cfg["side_length_m"])
    b_unif = np.array(b2_cfg["b_field_vec_t"], dtype=np.float64)
    # Discretize a closed circle of perimeter 4 * side_m into 360 segments
    n_seg = 360
    angles = np.linspace(0.0, 2.0 * math.pi, n_seg + 1)
    radius_loop = (4.0 * side_m) / (2.0 * math.pi)
    pts = np.column_stack([
        radius_loop * np.cos(angles),
        radius_loop * np.sin(angles),
        0.25 * radius_loop * np.sin(angles),
    ])
    dl_vecs = np.diff(pts, axis=0)
    seg_forces = curr_a * np.cross(dl_vecs, b_unif)
    net_force_vec = np.array([
        math.fsum(seg_forces[:, 0]),
        math.fsum(seg_forces[:, 1]),
        math.fsum(seg_forces[:, 2]),
    ])
    net_force_mag = float(np.linalg.norm(net_force_vec))
    ilb_scale = curr_a * (4.0 * side_m) * float(np.linalg.norm(b_unif))
    b2_tol = float(b2_cfg["rel_tol_ilb"]) * ilb_scale
    b2_pass = bool(net_force_mag <= b2_tol)
    benchmarks.append({
        "id": int(b2_cfg["id"]),
        "name": b2_cfg["name"],
        "value": net_force_mag,
        "expected": float(b2_cfg["expected_net_force_n"]),
        "expected_display": "Net force 0 N",
        "computed": f"{net_force_mag:.2e} N",
        "tolerance": float(b2_cfg["rel_tol_ilb"]),
        "tolerance_display": "1e-9 of I*L*B",
        "source_page": b2_cfg["source_page"],
        "passed": b2_pass,
        "status": "PASS" if b2_pass else "FAIL",
        "notes": "Discrete 360-segment closed loop integral sum(I dl x B)",
    })

    # -------------------------------------------------------------------------
    # Benchmark 3: Long wire, 1 kA at 1 m -> 2.000 x 10^-4 T (tol 1e-6)
    # -------------------------------------------------------------------------
    b3_cfg = cfg["b3_biot_savart_long_wire"]
    mu0_over_4pi = 1.0e-7
    i_wire = float(b3_cfg["current_a"])
    r_obs = float(b3_cfg["distance_m"])
    half_len = float(b3_cfg["wire_half_length_m"])
    n_wire = int(b3_cfg["num_segments"])
    # Numerical midpoint quadrature of Biot-Savart law along [-half_len, +half_len]
    dz = (2.0 * half_len) / n_wire
    z_mid = np.linspace(-half_len + 0.5 * dz, half_len - 0.5 * dz, n_wire)
    dist_cubed = (z_mid**2 + r_obs**2) ** 1.5
    b_computed = float(mu0_over_4pi * i_wire * r_obs * dz * np.sum(1.0 / dist_cubed))
    b3_exp = float(b3_cfg["expected_b_t"])
    b3_rel_err = abs(b_computed - b3_exp) / b3_exp
    b3_pass = bool(b3_rel_err <= float(b3_cfg["rel_tol"]))
    benchmarks.append({
        "id": int(b3_cfg["id"]),
        "name": b3_cfg["name"],
        "value": b_computed,
        "expected": b3_exp,
        "expected_display": "2.000e-4 T",
        "computed": f"{b_computed:.6e} T (rel err: {b3_rel_err:.2e})",
        "tolerance": float(b3_cfg["rel_tol"]),
        "tolerance_display": "1e-6",
        "source_page": b3_cfg["source_page"],
        "passed": b3_pass,
        "status": "PASS" if b3_pass else "FAIL",
        "notes": "Numerical Biot-Savart quadrature along finite wire",
    })

    # -------------------------------------------------------------------------
    # Benchmark 4: Kepler orbit, a = 1 AU, e = 0.3, 10 periods -> Back to start
    # -------------------------------------------------------------------------
    b4_cfg = cfg["b4_kepler_eccentric_10_periods"]
    a_m = float(b4_cfg["semi_major_axis_au"]) * constants.AU
    ecc = float(b4_cfg["eccentricity"])
    n_periods = int(b4_cfg["num_periods"])
    m_sun = constants.GM_SUN / constants.G
    m_planet = constants.M_EARTH
    mu_tot = constants.G * (m_sun + m_planet)

    # Start at perihelion r_p = a(1 - e), v_p = sqrt(mu_tot * (1 + e) / (a * (1 - e)))
    r_p = a_m * (1.0 - ecc)
    v_p = math.sqrt(mu_tot * (1.0 + ecc) / (a_m * (1.0 - ecc)))
    period_s = 2.0 * math.pi * math.sqrt((a_m**3) / mu_tot)

    sim4 = rebound.Simulation()
    sim4.integrator = "ias15"
    sim4.G = constants.G
    sim4.add(m=m_sun, x=0.0, y=0.0, z=0.0, vx=0.0, vy=0.0, vz=0.0)
    sim4.add(m=m_planet, x=r_p, y=0.0, z=0.0, vx=0.0, vy=v_p, vz=0.0)
    sim4.move_to_com()

    r0_rel = np.array([
        sim4.particles[1].x - sim4.particles[0].x,
        sim4.particles[1].y - sim4.particles[0].y,
        sim4.particles[1].z - sim4.particles[0].z,
    ])
    e0_b4 = _compute_system_energy(sim4)
    sim4.integrate(n_periods * period_s)
    rf_rel = np.array([
        sim4.particles[1].x - sim4.particles[0].x,
        sim4.particles[1].y - sim4.particles[0].y,
        sim4.particles[1].z - sim4.particles[0].z,
    ])
    ef_b4 = _compute_system_energy(sim4)

    pos_rel_err_a = float(np.linalg.norm(rf_rel - r0_rel) / a_m)
    energy_rel_err_b4 = float(abs(ef_b4 - e0_b4) / abs(e0_b4))
    b4_pass = bool(
        pos_rel_err_a <= float(b4_cfg["pos_rel_tol_a"])
        and energy_rel_err_b4 <= float(b4_cfg["energy_rel_tol"])
    )
    benchmarks.append({
        "id": int(b4_cfg["id"]),
        "name": b4_cfg["name"],
        "value": {
            "pos_rel_err": pos_rel_err_a,
            "energy_rel_err": energy_rel_err_b4,
        },
        "expected": {
            "pos_rel_err": 0.0,
            "energy_rel_err": 0.0,
        },
        "expected_display": "Return to start (pos < 1e-6 a, dE < 1e-9)",
        "computed": f"pos err: {pos_rel_err_a:.2e} a, dE/E0: {energy_rel_err_b4:.2e}",
        "tolerance": {
            "pos_rel_tol_a": float(b4_cfg["pos_rel_tol_a"]),
            "energy_rel_tol": float(b4_cfg["energy_rel_tol"]),
        },
        "tolerance_display": "1e-6 a; energy 1e-9",
        "source_page": b4_cfg["source_page"],
        "passed": b4_pass,
        "status": "PASS" if b4_pass else "FAIL",
        "notes": "REBOUND IAS15 10-period eccentric orbit integration",
    })

    # -------------------------------------------------------------------------
    # Benchmark 5: Solar system, 5 years, no push -> Energy constant (tol 1e-9)
    # -------------------------------------------------------------------------
    b5_cfg = cfg["b5_solar_system_5yr_no_push"]
    sim5 = rebound.Simulation()
    sim5.integrator = "ias15"
    sim5.G = constants.G
    sim5.add(m=m_sun, x=0.0, y=0.0, z=0.0, vx=0.0, vy=0.0, vz=0.0)
    # Earth
    r_e = constants.AU
    v_e = math.sqrt(constants.GM_SUN / r_e)
    sim5.add(m=constants.M_EARTH, x=r_e, y=0.0, z=0.0, vx=0.0, vy=v_e, vz=0.0)
    # Mars (1.524 AU)
    r_mars = 1.524 * constants.AU
    v_mars = math.sqrt(constants.GM_SUN / r_mars)
    sim5.add(m=6.4171e23, x=0.0, y=r_mars, z=0.0, vx=-v_mars, vy=0.0, vz=0.0)
    # Jupiter (5.204 AU)
    r_jup = 5.204 * constants.AU
    v_jup = math.sqrt(constants.GM_SUN / r_jup)
    sim5.add(m=1.8982e27, x=-r_jup, y=0.0, z=0.0, vx=0.0, vy=-v_jup, vz=0.0)
    sim5.move_to_com()

    e0_b5 = _compute_system_energy(sim5)
    sim5.integrate(float(b5_cfg["duration_years"]) * constants.YEAR)
    ef_b5 = _compute_system_energy(sim5)
    energy_rel_err_b5 = float(abs(ef_b5 - e0_b5) / abs(e0_b5))
    b5_pass = bool(energy_rel_err_b5 <= float(b5_cfg["energy_rel_tol"]))
    benchmarks.append({
        "id": int(b5_cfg["id"]),
        "name": b5_cfg["name"],
        "value": energy_rel_err_b5,
        "expected": float(b5_cfg["expected_energy_rel_drift"]),
        "expected_display": "Energy constant (drift < 1e-9)",
        "computed": f"dE / E0: {energy_rel_err_b5:.2e}",
        "tolerance": float(b5_cfg["energy_rel_tol"]),
        "tolerance_display": "1e-9",
        "source_page": b5_cfg["source_page"],
        "passed": b5_pass,
        "status": "PASS" if b5_pass else "FAIL",
        "notes": "REBOUND IAS15 5-year unforced multi-planet N-body integration",
    })

    # -------------------------------------------------------------------------
    # Benchmark 6: Earth-Moon barycentre period -> 365.256 days (tol 0.1 day)
    # -------------------------------------------------------------------------
    b6_cfg = cfg["b6_earth_moon_barycentre_period"]
    m_em = constants.M_EARTH + constants.M_MOON
    mu_sun_em = constants.G * (m_sun + m_em)
    v_emb = math.sqrt(mu_sun_em / constants.AU)
    v_moon_rel = math.sqrt(constants.G * m_em / constants.R_EARTH_MOON)
    mu_ratio = constants.M_MOON / m_em

    sim6 = rebound.Simulation()
    sim6.integrator = "ias15"
    sim6.G = constants.G
    sim6.add(m=m_sun, x=0.0, y=0.0, z=0.0, vx=0.0, vy=0.0, vz=0.0)
    sim6.add(
        m=constants.M_EARTH,
        x=constants.AU - mu_ratio * constants.R_EARTH_MOON,
        y=0.0,
        z=0.0,
        vx=0.0,
        vy=v_emb - mu_ratio * v_moon_rel,
        vz=0.0,
    )
    sim6.add(
        m=constants.M_MOON,
        x=constants.AU + (1.0 - mu_ratio) * constants.R_EARTH_MOON,
        y=0.0,
        z=0.0,
        vx=0.0,
        vy=v_emb + (1.0 - mu_ratio) * v_moon_rel,
        vz=0.0,
    )
    sim6.move_to_com()

    def _emb_y(t_sec: float) -> float:
        sim6.integrate(t_sec)
        ps, pe, pm = sim6.particles[0], sim6.particles[1], sim6.particles[2]
        y_emb = (constants.M_EARTH * pe.y + constants.M_MOON * pm.y) / m_em - ps.y
        return float(y_emb)

    # Bracket full period around 365.25 days using secant refinement on y_EMB(t) = 0
    t_low = 365.0 * 86400.0
    t_high = 365.5 * 86400.0
    y_low = _emb_y(t_low)
    y_high = _emb_y(t_high)
    t_cross = t_low - y_low * (t_high - t_low) / (y_high - y_low)
    y_cross = _emb_y(t_cross)
    # One more Newton-like step using dy/dt ~ v_emb
    t_cross = t_cross - y_cross / v_emb
    emb_period_days = float(t_cross / 86400.0)
    b6_exp = float(b6_cfg["expected_period_days"])
    b6_err_days = abs(emb_period_days - b6_exp)
    b6_pass = bool(b6_err_days <= float(b6_cfg["abs_tol_days"]))
    benchmarks.append({
        "id": int(b6_cfg["id"]),
        "name": b6_cfg["name"],
        "value": emb_period_days,
        "expected": b6_exp,
        "expected_display": "365.256 days",
        "computed": f"{emb_period_days:.4f} days (err: {b6_err_days:.4f} d)",
        "tolerance": float(b6_cfg["abs_tol_days"]),
        "tolerance_display": "0.1 day",
        "source_page": b6_cfg["source_page"],
        "passed": b6_pass,
        "status": "PASS" if b6_pass else "FAIL",
        "notes": "REBOUND IAS15 3-body Sun-Earth-Moon barycentre zero-crossing period",
    })

    # -------------------------------------------------------------------------
    # Benchmark 7: Hohmann 1 -> 1.524 AU -> 2.94 + 2.65 km/s, ~259 days
    # -------------------------------------------------------------------------
    b7_cfg = cfg["b7_hohmann_mars"]
    h_res = hohmann_transfer(
        float(b7_cfg["r1_au"]) * constants.AU,
        float(b7_cfg["r2_au"]) * constants.AU,
        constants.GM_SUN,
    )
    dv1_km_s = float(h_res["dv1_m_s"] / 1000.0)
    dv2_km_s = float(h_res["dv2_m_s"] / 1000.0)
    tx_days = float(h_res["transfer_time_s"] / 86400.0)

    b7_pass = bool(
        abs(dv1_km_s - float(b7_cfg["expected_dv1_km_s"])) <= float(b7_cfg["dv_abs_tol_km_s"])
        and abs(dv2_km_s - float(b7_cfg["expected_dv2_km_s"])) <= float(b7_cfg["dv_abs_tol_km_s"])
        and abs(tx_days - float(b7_cfg["expected_days"])) <= float(b7_cfg["time_abs_tol_days"])
    )
    benchmarks.append({
        "id": int(b7_cfg["id"]),
        "name": b7_cfg["name"],
        "value": {
            "dv1_km_s": dv1_km_s,
            "dv2_km_s": dv2_km_s,
            "transfer_days": tx_days,
        },
        "expected": {
            "dv1_km_s": float(b7_cfg["expected_dv1_km_s"]),
            "dv2_km_s": float(b7_cfg["expected_dv2_km_s"]),
            "transfer_days": float(b7_cfg["expected_days"]),
        },
        "expected_display": "2.94 + 2.65 km/s, ~259 days",
        "computed": f"{dv1_km_s:.3f} + {dv2_km_s:.3f} km/s, {tx_days:.1f} days",
        "tolerance": {
            "dv_abs_tol_km_s": float(b7_cfg["dv_abs_tol_km_s"]),
            "time_abs_tol_days": float(b7_cfg["time_abs_tol_days"]),
        },
        "tolerance_display": "0.02 km/s; 2 days",
        "source_page": b7_cfg["source_page"],
        "passed": b7_pass,
        "status": "PASS" if b7_pass else "FAIL",
        "notes": "Vis-viva Hohmann transfer 1.0 AU -> 1.524 AU",
    })

    # -------------------------------------------------------------------------
    # Benchmark 8: Push 10^-8 m/s^2 along velocity, 1 year -> a grows ~3,170 km
    # -------------------------------------------------------------------------
    b8_cfg = cfg["b8_tangential_push_1yr"]
    a_push = float(b8_cfg["accel_m_s2"])
    sim8 = rebound.Simulation()
    sim8.integrator = "ias15"
    sim8.G = constants.G
    # IAS15 must know that the additional force depends on particle velocity,
    # otherwise it omits velocity corrector iterations causing a ~0.5% numerical lag.
    sim8.force_is_velocity_dependent = 1
    sim8.add(m=m_sun, x=0.0, y=0.0, z=0.0, vx=0.0, vy=0.0, vz=0.0)
    v0_earth = math.sqrt(constants.G * (m_sun + constants.M_EARTH) / constants.AU)
    sim8.add(m=constants.M_EARTH, x=constants.AU, y=0.0, z=0.0, vx=0.0, vy=v0_earth, vz=0.0)

    def _af_tangential(sim_ptr):
        s = sim_ptr.contents
        ps, pe = s.particles[0], s.particles[1]
        dvx, dvy, dvz = pe.vx - ps.vx, pe.vy - ps.vy, pe.vz - ps.vz
        v_mag = math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz)
        pe.ax += a_push * (dvx / v_mag)
        pe.ay += a_push * (dvy / v_mag)
        pe.az += a_push * (dvz / v_mag)

    sim8.additional_forces = _af_tangential
    sim8.integrate(float(b8_cfg["duration_years"]) * constants.YEAR)
    ps8, pe8 = sim8.particles[0], sim8.particles[1]
    dx8, dy8 = pe8.x - ps8.x, pe8.y - ps8.y
    dvx8, dvy8 = pe8.vx - ps8.vx, pe8.vy - ps8.vy
    r8 = math.sqrt(dx8 * dx8 + dy8 * dy8)
    v8 = math.sqrt(dvx8 * dvx8 + dvy8 * dvy8)
    mu8 = constants.G * (m_sun + constants.M_EARTH)
    eps8 = 0.5 * v8 * v8 - mu8 / r8
    a8_m = -mu8 / (2.0 * eps8)
    delta_a_km = float((a8_m - constants.AU) / 1000.0)
    b8_exp = float(b8_cfg["expected_delta_a_km"])
    b8_rel_err = abs(delta_a_km - b8_exp) / b8_exp
    b8_pass = bool(b8_rel_err <= float(b8_cfg["rel_tol"]))
    benchmarks.append({
        "id": int(b8_cfg["id"]),
        "name": b8_cfg["name"],
        "value": delta_a_km,
        "expected": b8_exp,
        "expected_display": "a grows ~3,170 km",
        "computed": f"+{delta_a_km:.2f} km (err: {b8_rel_err * 100.0:.3f}%)",
        "tolerance": float(b8_cfg["rel_tol"]),
        "tolerance_display": "1%",
        "source_page": b8_cfg["source_page"],
        "passed": b8_pass,
        "status": "PASS" if b8_pass else "FAIL",
        "notes": "REBOUND IAS15 1-year tangential acceleration integration",
    })

    # -------------------------------------------------------------------------
    # Benchmark 9: Cantilever under self-weight -> qL^2/2 and qL^4/(8EI) (tol 1%)
    # -------------------------------------------------------------------------
    b9_cfg = cfg["b9_cantilever_self_weight"]
    beam_l = float(b9_cfg["length_m"])
    q_load = float(b9_cfg["distributed_load_n_m"])
    ei = float(b9_cfg["flexural_rigidity_n_m2"])
    n_el = int(b9_cfg["num_elements"])
    dx_b = beam_l / n_el
    x_nodes = np.linspace(0.0, beam_l, n_el + 1)
    # Integrate shear V(x) and moment M(x) from free tip (x = L) back to fixed root (x = 0)
    shear = np.zeros(n_el + 1)
    moment = np.zeros(n_el + 1)
    for i in range(n_el - 1, -1, -1):
        shear[i] = shear[i + 1] + q_load * dx_b
        moment[i] = moment[i + 1] + 0.5 * (shear[i] + shear[i + 1]) * dx_b
    # Integrate slope theta(x) and deflection w(x) from fixed root (x = 0) to free tip (x = L)
    slope = np.zeros(n_el + 1)
    deflection = np.zeros(n_el + 1)
    for i in range(n_el):
        slope[i + 1] = slope[i] + 0.5 * (moment[i] + moment[i + 1]) / ei * dx_b
        deflection[i + 1] = deflection[i] + 0.5 * (slope[i] + slope[i + 1]) * dx_b

    m_exact = 0.5 * q_load * (beam_l**2)
    w_exact = (q_load * (beam_l**4)) / (8.0 * ei)
    m_ratio = float(moment[0] / m_exact)
    w_ratio = float(deflection[-1] / w_exact)
    b9_rel_err = max(abs(m_ratio - 1.0), abs(w_ratio - 1.0))
    b9_pass = bool(b9_rel_err <= float(b9_cfg["rel_tol"]))
    benchmarks.append({
        "id": int(b9_cfg["id"]),
        "name": b9_cfg["name"],
        "value": {
            "root_moment_n_m": float(moment[0]),
            "tip_deflection_m": float(deflection[-1]),
            "moment_ratio": m_ratio,
            "deflection_ratio": w_ratio,
        },
        "expected": {
            "root_moment_n_m": m_exact,
            "tip_deflection_m": w_exact,
            "moment_ratio": 1.0,
            "deflection_ratio": 1.0,
        },
        "expected_display": "M = qL^2/2, w = qL^4/(8EI)",
        "computed": f"M/M_exact = {m_ratio:.6f}, w/w_exact = {w_ratio:.6f}",
        "tolerance": float(b9_cfg["rel_tol"]),
        "tolerance_display": "1%",
        "source_page": b9_cfg["source_page"],
        "passed": b9_pass,
        "status": "PASS" if b9_pass else "FAIL",
        "notes": f"Numerical {n_el}-element Euler-Bernoulli cantilever integration",
    })

    # -------------------------------------------------------------------------
    # Benchmark 10: Equilibrium temperature, 1 AU, albedo 0.306 -> ~254 K (tol 2 K)
    # -------------------------------------------------------------------------
    b10_cfg = cfg["b10_equilibrium_temperature_1au"]
    s_1au = compute_insolation(float(b10_cfg["radius_au"]) * constants.AU, mirror_active=False)
    teq_k = float(compute_equilibrium_temperature(s_1au, albedo=float(b10_cfg["albedo"])))
    b10_exp = float(b10_cfg["expected_temp_k"])
    b10_err = abs(teq_k - b10_exp)
    b10_pass = bool(b10_err <= float(b10_cfg["abs_tol_k"]))
    benchmarks.append({
        "id": int(b10_cfg["id"]),
        "name": b10_cfg["name"],
        "value": teq_k,
        "expected": b10_exp,
        "expected_display": "~254 K",
        "computed": f"{teq_k:.2f} K (err: {b10_err:.2f} K)",
        "tolerance": float(b10_cfg["abs_tol_k"]),
        "tolerance_display": "2 K",
        "source_page": b10_cfg["source_page"],
        "passed": b10_pass,
        "status": "PASS" if b10_pass else "FAIL",
        "notes": "Radiative blackbody equilibrium Teq = [S(1-A)/(4*sigma)]^(1/4)",
    })

    all_passed = all(b["passed"] for b in benchmarks)
    doc = {
        "source_document": "Planetary Propulsion Simulation Hackathon — Participant Guide",
        "source_section": "Section 6: Validation benchmarks (Page 9)",
        "all_passed": all_passed,
        "passed_count": sum(1 for b in benchmarks if b["passed"]),
        "total_count": len(benchmarks),
        "benchmarks": benchmarks,
    }

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)

    return doc


if __name__ == "__main__":
    result = run_and_write_guide_benchmarks()
    print(f"Wrote {result['passed_count']}/{result['total_count']} benchmarks to {DEFAULT_OUT_PATH}")
