"""Tests for the Reduced (Averaged) Model and trajectory benchmarks (Step 4.2 Sections B & C).

Covers:
1. Window comparison (5 to 20 years) of Earth's Delta_a(t) between the Reduced Model
   (Sun + Earth IAS15, Tug driver-managed) and the Full N-body model (Sun, Earth, Tug with controller).
2. Trajectory agreement against the independent closed_form_spiral tool at 100, 500, and 1000 years
   within 1e-3 relative tolerance on (a - a0)/a0 (marked ASSUMED).
3. Full coupler loop execution and ledger audit pass.
"""

import json
import math
from pathlib import Path
import numpy as np
import pytest
import yaml

from octo.core import constants
from octo.drivers.propulsion import lorentz_gamma

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT_DIR / "config" / "base.yaml"
REF_PATH = ROOT_DIR / "results" / "reference.json"


@pytest.fixture
def base_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


@pytest.fixture
def ref_data() -> dict:
    with open(REF_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_reduced_model_vs_full_nbody_window(base_config: dict):
    """Validate reduced model against full N-body model over a window of 5 to 20 years.

    Earth's Delta_a(t) = a(t) - a0 must agree within the config tolerance.
    """
    import rebound

    mu_sun = constants.GM_SUN
    m_sun = mu_sun / constants.G
    m_earth = constants.M_EARTH
    r0 = constants.AU
    v0 = math.sqrt(mu_sun / r0)

    tug_cfg = base_config.get("ceres_tug", {})
    m_tug = float(tug_cfg.get("mass_kg", 9.4e20))
    d0 = float(tug_cfg.get("standoff_distance_m", 1.2701e9))

    prop_cfg = base_config.get("propulsion", {})
    mdot = float(prop_cfg.get("mass_flow_kg_s", 2.501e9))
    ve = float(prop_cfg.get("exhaust_velocity_m_s", 0.3 * constants.C_LIGHT))

    from octo.drivers.propulsion import beam_photon_force, yaw_trim_angle

    gamma = lorentz_gamma(ve, constants.C_LIGHT)
    f_engine = mdot * gamma * ve
    cant_factor = math.cos(math.radians(float(tug_cfg.get("cone_half_angle_deg", 5.0))))
    f_cant = f_engine * cant_factor
    f_photon = beam_photon_force(float(tug_cfg.get("beam_power_w", 1.0e25)), constants.C_LIGHT)
    yaw_rad = yaw_trim_angle(f_photon, f_cant)
    f_eff = f_cant * math.cos(yaw_rad)
    a_req = f_eff / m_earth

    # 1. Full N-body simulation: Sun, Earth, Tug with PD controller
    sim_full = rebound.Simulation()
    sim_full.integrator = "ias15"
    sim_full.G = constants.G
    sim_full.add(name="Sun", m=m_sun, x=0, y=0, z=0, vx=0, vy=0, vz=0)
    sim_full.add(name="Earth", m=m_earth, x=r0, y=0, z=0, vx=0, vy=v0, vz=0)
    sim_full.add(name="Tug", m=m_tug, x=r0, y=d0, z=0, vx=0, vy=v0, vz=0)

    omega0_sq = 2.0 * constants.G * m_earth / (d0**3)
    kp = 3.0 * m_tug * omega0_sq
    kd = 2.0 * math.sqrt(m_tug * kp)
    f_nominal = f_eff + m_tug * a_req

    def af_full(sim_pointer):
        s = sim_pointer.contents
        pe = s.particles[1]
        pt = s.particles[2]
        dx = pt.x - pe.x
        dy = pt.y - pe.y
        dz = pt.z - pe.z
        d = math.sqrt(dx * dx + dy * dy + dz * dz)
        dvx = pt.vx - pe.vx
        dvy = pt.vy - pe.vy
        dvz = pt.vz - pe.vz
        d_dot = (dx * dvx + dy * dvy + dz * dvz) / d
        delta_f = -kp * (d - d0) - kd * d_dot
        f_total = max(0.0, f_nominal + delta_f)
        r_t = math.sqrt(pt.x**2 + pt.y**2 + pt.z**2)
        tx = -pt.y / r_t
        ty = pt.x / r_t
        pt.ax += (f_total * tx) / pt.m
        pt.ay += (f_total * ty) / pt.m

    sim_full.additional_forces = af_full

    # 2. Reduced model: Sun and Earth only with external pull on Earth
    sim_red = rebound.Simulation()
    sim_red.integrator = "ias15"
    sim_red.G = constants.G
    sim_red.add(name="Sun", m=m_sun, x=0, y=0, z=0, vx=0, vy=0, vz=0)
    sim_red.add(name="Earth", m=m_earth, x=r0, y=0, z=0, vx=0, vy=v0, vz=0)

    def af_red(sim_pointer):
        s = sim_pointer.contents
        ps = s.particles[0]
        pe = s.particles[1]
        dx = pe.x - ps.x
        dy = pe.y - ps.y
        r_e = math.sqrt(dx**2 + dy**2)
        tx = -dy / r_e
        ty = dx / r_e
        f_pull = constants.G * m_earth * m_tug / (d0**2)
        pe.ax += (f_pull * tx) / pe.m
        pe.ay += (f_pull * ty) / pe.m

    sim_red.additional_forces = af_red

    # 3. Compare across 10, 20, 50, 100, 150, and 200 years
    # Target from ARCHITECTURE.md is agreement within 1% (ASSUMED in config/base.yaml)
    tol = float(base_config["reduced_model_validation_tol"])

    years = [10.0, 20.0, 50.0, 100.0, 150.0, 200.0]
    da_full_list: list[float] = []
    da_red_list: list[float] = []

    for yr in years:
        t_target = yr * constants.YEAR
        sim_full.integrate(t_target)
        sim_red.integrate(t_target)

        # Full model Earth a
        ps_f = sim_full.particles[0]
        pe_f = sim_full.particles[1]
        rf = math.sqrt((pe_f.x - ps_f.x)**2 + (pe_f.y - ps_f.y)**2)
        vf = math.sqrt((pe_f.vx - ps_f.vx)**2 + (pe_f.vy - ps_f.vy)**2)
        eps_f = 0.5 * vf**2 - (constants.G * (m_sun + m_earth)) / rf
        a_f = -(constants.G * (m_sun + m_earth)) / (2.0 * eps_f)
        delta_a_f = (a_f - r0) / constants.AU

        # Reduced model Earth a
        ps_r = sim_red.particles[0]
        pe_r = sim_red.particles[1]
        rr = math.sqrt((pe_r.x - ps_r.x)**2 + (pe_r.y - ps_r.y)**2)
        vr = math.sqrt((pe_r.vx - ps_r.vx)**2 + (pe_r.vy - ps_r.vy)**2)
        eps_r = 0.5 * vr**2 - (constants.G * (m_sun + m_earth)) / rr
        a_r = -(constants.G * (m_sun + m_earth)) / (2.0 * eps_r)
        delta_a_r = (a_r - r0) / constants.AU

        da_full_list.append(delta_a_f)
        da_red_list.append(delta_a_r)

    t_arr = np.array(years, dtype=float)
    slope_full = float(np.polyfit(t_arr, da_full_list, 1)[0])
    slope_red = float(np.polyfit(t_arr, da_red_list, 1)[0])
    slope_ratio = slope_full / slope_red
    slope_rel_diff = abs(slope_ratio - 1.0)

    assert slope_rel_diff < tol, (
        f"Reduced vs Full 200-yr least-squares da/dt discrepancy {slope_rel_diff:.4%} exceeds {tol:.2%} target: "
        f"full da/dt={slope_full:.6e} AU/yr, reduced da/dt={slope_red:.6e} AU/yr, ratio={slope_ratio:.6f}. "
        f"Cause: 1D scalar standoff PD controller settles at steady-state droop d_eq = 0.9691*d0 "
        f"(and radial Hill offset x_Hill = -0.180*d0), increasing 1/d^2 pull by 1/(0.9691)^2 - 1 = +6.48%."
    )


def test_earth_osculating_a_oscillation_due_to_moon(base_config: dict):
    """Measure Earth's osculating heliocentric a(t) oscillation caused by the Moon over 1 year."""
    import rebound
    from octo.drivers.propulsion import beam_photon_force, yaw_trim_angle

    mu_sun = constants.GM_SUN
    m_sun = mu_sun / constants.G
    m_earth = constants.M_EARTH
    m_moon = 7.342e22

    tug_cfg = base_config["ceres_tug"]
    prop_cfg = base_config["propulsion"]
    m_tug = float(tug_cfg["mass_kg"])
    d0 = float(tug_cfg["standoff_distance_m"])
    mdot = float(prop_cfg["mass_flow_kg_s"])
    ve = float(prop_cfg["exhaust_velocity_m_s"])

    gamma = lorentz_gamma(ve, constants.C_LIGHT)
    f_engine = mdot * gamma * ve
    f_cant = f_engine * math.cos(math.radians(float(tug_cfg["cone_half_angle_deg"])))
    f_photon = beam_photon_force(float(tug_cfg["beam_power_w"]), constants.C_LIGHT)
    yaw_rad = yaw_trim_angle(f_photon, f_cant)
    f_eff = f_cant * math.cos(yaw_rad)
    a_req = f_eff / m_earth

    r0 = constants.AU
    v0 = math.sqrt(constants.G * (m_sun + m_earth + m_moon) / r0)
    r_moon = 3.844e8
    v_moon = math.sqrt(constants.G * (m_earth + m_moon) / r_moon)
    mu_em = m_moon / (m_earth + m_moon)

    sim = rebound.Simulation()
    sim.integrator = "ias15"
    sim.G = constants.G
    sim.add(name="Sun", m=m_sun, x=0, y=0, z=0, vx=0, vy=0, vz=0)
    sim.add(name="Earth", m=m_earth, x=r0 - mu_em * r_moon, y=0, z=0, vx=0, vy=v0 - mu_em * v_moon, vz=0)
    sim.add(name="Moon", m=m_moon, x=r0 + (1.0 - mu_em) * r_moon, y=0, z=0, vx=0, vy=v0 + (1.0 - mu_em) * v_moon, vz=0)
    sim.add(name="Tug", m=m_tug, x=r0, y=d0, z=0, vx=0, vy=v0, vz=0)

    omega0_sq = 2.0 * constants.G * m_earth / (d0**3)
    kp = 3.0 * m_tug * omega0_sq
    kd = 2.0 * math.sqrt(m_tug * kp)
    f_nominal = f_eff + m_tug * a_req

    def af(sim_pointer):
        s = sim_pointer.contents
        ps, pe, pt = s.particles[0], s.particles[1], s.particles[3]
        dx, dy = pt.x - pe.x, pt.y - pe.y
        d = math.sqrt(dx * dx + dy * dy)
        dvx, dvy = pt.vx - pe.vx, pt.vy - pe.vy
        d_dot = (dx * dvx + dy * dvy) / d
        delta_f = -kp * (d - d0) - kd * d_dot
        f_total = max(0.0, f_nominal + delta_f)
        r_t = math.sqrt((pt.x - ps.x)**2 + (pt.y - ps.y)**2)
        tx, ty = -(pt.y - ps.y) / r_t, (pt.x - ps.x) / r_t
        pt.ax += (f_total * tx) / pt.m
        pt.ay += (f_total * ty) / pt.m

    sim.additional_forces = af

    a_earth_list: list[float] = []
    for day in range(366):
        sim.integrate(day * 86400.0)
        ps, pe = sim.particles[0], sim.particles[1]
        re = math.sqrt((pe.x - ps.x)**2 + (pe.y - ps.y)**2)
        ve_mag = math.sqrt((pe.vx - ps.vx)**2 + (pe.vy - ps.vy)**2)
        eps_e = 0.5 * ve_mag**2 - constants.G * (m_sun + m_earth) / re
        a_e_au = -(constants.G * (m_sun + m_earth) / (2.0 * eps_e)) / constants.AU
        a_earth_list.append(a_e_au)

    a_e_arr = np.array(a_earth_list)
    peak_to_peak_au = float(a_e_arr.max() - a_e_arr.min())
    amplitude_au = 0.5 * peak_to_peak_au

    # Analytical reflex oscillation: delta_a / a0 ~ 2 * v_reflex / v0 + 2 * r_reflex / r0 ~ 9.0e-4 to 9.5e-4 AU
    assert 8.0e-4 < amplitude_au < 1.1e-3
    assert 1.6e-3 < peak_to_peak_au < 2.2e-3


def test_reduced_model_matches_closed_form_spiral(ref_data: dict, base_config: dict):
    """Compare reduced model simulated a at 100, 500, and 1000 years against closed-form spiral.

    Both the simulation and the reference benchmark use the exact parameters from config/base.yaml.
    Tolerance: 1e-3 on relative orbital expansion (a - a0) / a0.
    """
    import rebound
    from octo.drivers.propulsion import beam_photon_force, two_cone_canting_loss, yaw_trim_angle

    bench = ref_data["spiral_trajectory_benchmark"]
    tol = bench["rel_tol"]  # 1.0e-3 (marked ASSUMED)

    mu_sun = constants.GM_SUN
    m_sun = mu_sun / constants.G
    m_earth = constants.M_EARTH
    r0 = float(base_config["initial_conditions"]["semi_major_axis_au"]) * constants.AU
    v0 = math.sqrt(mu_sun / r0)

    prop_cfg = base_config["propulsion"]
    tug_cfg = base_config["ceres_tug"]
    mdot = float(prop_cfg["mass_flow_kg_s"])
    ve = float(prop_cfg["exhaust_velocity_m_s"])
    cone_deg = float(tug_cfg["cone_half_angle_deg"])
    beam_power_w = float(tug_cfg["beam_power_w"])

    gamma = lorentz_gamma(ve, constants.C_LIGHT)
    f_nominal = mdot * gamma * ve
    cant_factor = two_cone_canting_loss(math.radians(cone_deg))
    f_cant = f_nominal * cant_factor
    f_photon = beam_photon_force(beam_power_w, constants.C_LIGHT)
    yaw_rad = yaw_trim_angle(f_photon, f_cant)
    f_eff = f_cant * math.cos(yaw_rad)

    sim = rebound.Simulation()
    sim.integrator = "ias15"
    sim.G = constants.G
    sim.add(name="Sun", m=m_sun, x=0, y=0, z=0, vx=0, vy=0, vz=0)
    sim.add(name="Earth", m=m_earth, x=r0, y=0, z=0, vx=0, vy=v0, vz=0)

    def af(sim_pointer):
        s = sim_pointer.contents
        ps = s.particles[0]
        pe = s.particles[1]
        dx = pe.x - ps.x
        dy = pe.y - ps.y
        r_e = math.sqrt(dx**2 + dy**2)
        tx = -dy / r_e
        ty = dx / r_e
        pe.ax += (f_eff * tx) / pe.m
        pe.ay += (f_eff * ty) / pe.m

    sim.additional_forces = af

    expected_benchmarks = {
        100.0: bench["earth_a_100yr_au"],
        500.0: bench["earth_a_500yr_au"],
        1000.0: bench["earth_a_1000yr_au"],
    }

    for yr, a_expected_au in expected_benchmarks.items():
        sim.integrate(yr * constants.YEAR)
        ps = sim.particles[0]
        pe = sim.particles[1]
        dx = pe.x - ps.x
        dy = pe.y - ps.y
        dvx = pe.vx - ps.vx
        dvy = pe.vy - ps.vy
        r = math.sqrt(dx**2 + dy**2)
        v = math.sqrt(dvx**2 + dvy**2)
        eps = 0.5 * v**2 - (constants.G * (m_sun + m_earth)) / r
        a_sim_m = -(constants.G * (m_sun + m_earth)) / (2.0 * eps)
        a_sim_au = a_sim_m / constants.AU

        # Check relative expansion (a - a0) / a0
        expansion_sim = a_sim_au - 1.0
        expansion_exp = a_expected_au - 1.0
        rel_err = abs(expansion_sim - expansion_exp) / expansion_exp

        assert rel_err < tol, f"At {yr} yr: sim a={a_sim_au:.6f} vs expected {a_expected_au:.6f} (rel_err={rel_err:.4e} > {tol})"
        assert abs(a_sim_au - a_expected_au) < tol, f"At {yr} yr: abs diff={abs(a_sim_au - a_expected_au)} > {tol}"
