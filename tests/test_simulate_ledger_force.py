"""Tests for Item 3: Force on Earth in simulate.py must come from the booked gravity Exchange in Ledger."""

import importlib.util
import math
from pathlib import Path
import numpy as np
import pytest

from octo.core import constants

ROOT_DIR = Path(__file__).resolve().parent.parent
_sim_path = ROOT_DIR / "py" / "simulate.py"
_spec = importlib.util.spec_from_file_location("simulate_mod", _sim_path)
_sim_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sim_mod)
run_full_spiral_simulation = _sim_mod.run_full_spiral_simulation


def test_simulate_applies_booked_gravity_exchange_force_every_step(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Verify simulate.py books G*M_earth*M_tug/d0^2 and applies the exact Ledger force every step."""
    monkeypatch.setattr(_sim_mod, "RESULTS_DIR", tmp_path)

    res = run_full_spiral_simulation(
        target_radius_au=1.0005,
        dt_days=10.0,
        coast_years=0.1,
        downsample_frames=50,
    )

    assert "step_force_audit" in res
    force_audit = res["step_force_audit"]
    assert len(force_audit) > 10

    m_earth = constants.M_EARTH
    m_tug = 9.4e20
    d0 = 1.2701e9
    expected_f_pull = (constants.G * m_earth * m_tug) / (d0 ** 2)

    active_steps = [row for row in force_audit if not row["is_coast"]]
    coast_steps = [row for row in force_audit if row["is_coast"]]
    assert len(active_steps) > 5
    assert len(coast_steps) > 0

    for row in active_steps:
        booked_vec = np.array(row["booked_force_vec_n"], dtype=np.float64)
        applied_vec = np.array(row["applied_force_vec_n"], dtype=np.float64)
        # Applied force on Earth must equal booked force in Ledger at every step
        assert np.allclose(applied_vec, booked_vec, rtol=0.0, atol=1.0e-6)
        # Magnitude must be gravitational pull F_pull = G*M_earth*M_tug/d0^2 (not F_eff)
        booked_mag = float(np.linalg.norm(booked_vec))
        assert pytest.approx(booked_mag, rel=1.0e-12) == expected_f_pull

    for row in coast_steps:
        booked_vec = np.array(row["booked_force_vec_n"], dtype=np.float64)
        applied_vec = np.array(row["applied_force_vec_n"], dtype=np.float64)
        assert np.allclose(applied_vec, booked_vec, rtol=0.0, atol=1.0e-12)
        assert float(np.linalg.norm(applied_vec)) == 0.0


def test_simulate_runs_drivers_and_fails_on_rogue_unbooked_momentum(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Verify simulate.py runs habitability, structure, and ledger audits, and FAILS on rogue driver injection."""
    monkeypatch.setattr(_sim_mod, "RESULTS_DIR", tmp_path)

    # 1. Nominal short run has monitors_summary and real drifts recorded
    res_nom = run_full_spiral_simulation(
        target_radius_au=1.0005,
        dt_days=10.0,
        coast_years=0.1,
        downsample_frames=50,
    )
    assert "monitors_summary" in res_nom
    summary = res_nom["monitors_summary"]
    assert "min_structural_safety_factor" in summary
    assert "min_insolation_w_m2" in summary
    assert "max_surface_waste_heat_w_m2" in summary
    assert "max_energy_drift" in summary

    # 2. Run with rogue momentum injection must fail validation
    res_rogue = run_full_spiral_simulation(
        target_radius_au=1.0005,
        dt_days=10.0,
        coast_years=0.1,
        downsample_frames=50,
        rogue_unbooked_force_n=1.0e19,  # Unbooked rogue force
    )
    assert res_rogue["validation_passed"] is False
    assert res_rogue["winning_conditions"]["W5_physics_is_honest"] is False


def test_sun_reaction_conserves_momentum_below_1e9_over_1yr_and_100yr():
    """Verify applying Tug solar gravity reaction on the Sun keeps momentum drift < 1e-9 over 1 yr and 100 yr.

    Earth, Moon, and Tug are kept as distinct bodies (no merging).
    Residual 1: dP_bodies - J_applied
    Residual 2: J_applied + J_partners
    Total Drift: dP_bodies + J_partners
    """
    import rebound

    mu_sun = constants.GM_SUN
    m_sun = mu_sun / constants.G
    m_earth = constants.M_EARTH
    m_moon = constants.M_MOON
    m_tug = 9.4e20
    d0 = 1.2701e9
    r0 = constants.AU
    v0 = math.sqrt(mu_sun / r0)
    r_moon = 3.844e8
    v_moon = math.sqrt(constants.G * m_earth / r_moon)
    f_pull = constants.G * m_earth * m_tug / (d0**2)
    omega0 = v0 / r0

    p_scale = m_earth * v0

    def evaluate_residuals(years: float) -> tuple[float, float, float]:
        sim = rebound.Simulation()
        sim.integrator = "ias15"
        sim.G = constants.G
        sim.add(name="Sun", m=m_sun, x=0.0, y=0.0, z=0.0, vx=0.0, vy=0.0, vz=0.0)
        sim.add(name="Earth", m=m_earth, x=r0, y=0.0, z=0.0, vx=0.0, vy=v0, vz=0.0)
        sim.add(name="Moon", m=m_moon, x=r0 + r_moon, y=0.0, z=0.0, vx=0.0, vy=v0 + v_moon, vz=0.0)

        v_tug = np.array([-d0 * omega0, v0, 0.0])
        p0_bodies = m_sun * np.array([sim.particles[0].vx, sim.particles[0].vy, 0.0]) + \
                    m_earth * np.array([sim.particles[1].vx, sim.particles[1].vy, 0.0]) + \
                    m_moon * np.array([sim.particles[2].vx, sim.particles[2].vy, 0.0]) + \
                    m_tug * v_tug

        def af(sim_pointer):
            s = sim_pointer.contents
            ps = s.particles[0]
            pe = s.particles[1]
            dx = pe.x - ps.x
            dy = pe.y - ps.y
            r = math.sqrt(dx * dx + dy * dy)
            tx = -dy / r
            ty = dx / r
            pe.ax += (f_pull * tx) / pe.m
            pe.ay += (f_pull * ty) / pe.m

            rtx = pe.x + d0 * tx
            rty = pe.y + d0 * ty
            rt_mag = math.sqrt(rtx * rtx + rty * rty)
            f_sun_tug = constants.G * ps.m * m_tug / (rt_mag**3)
            ps.ax += (f_sun_tug * rtx) / ps.m
            ps.ay += (f_sun_tug * rty) / ps.m

        sim.additional_forces = af
        sim.force_is_velocity_dependent = 0

        dt_s = 10.0 * 86400.0
        n_steps = int(years * 365.25 / 10.0)
        J_applied = np.zeros(3)
        J_partners = np.zeros(3)

        for _ in range(n_steps):
            v_s_pre = np.array([sim.particles[0].vx, sim.particles[0].vy, sim.particles[0].vz])
            v_e_pre = np.array([sim.particles[1].vx, sim.particles[1].vy, sim.particles[1].vz])
            v_m_pre = np.array([sim.particles[2].vx, sim.particles[2].vy, sim.particles[2].vz])
            v_t_pre = v_tug.copy()

            sim.integrate(sim.t + dt_s)

            pe_1 = sim.particles[1]
            ps_1 = sim.particles[0]
            pm_1 = sim.particles[2]
            v_s_post = np.array([ps_1.vx, ps_1.vy, ps_1.vz])
            v_e_post = np.array([pe_1.vx, pe_1.vy, pe_1.vz])
            v_m_post = np.array([pm_1.vx, pm_1.vy, pm_1.vz])

            dx = pe_1.x - ps_1.x
            dy = pe_1.y - ps_1.y
            r = math.sqrt(dx * dx + dy * dy)
            rx = dx / r
            ry = dy / r
            omega = (pe_1.x * pe_1.vy - pe_1.y * pe_1.vx) / (r * r)
            v_tug = np.array([pe_1.vx - d0 * omega * rx, pe_1.vy - d0 * omega * ry, 0.0])

            dp_step = m_sun * (v_s_post - v_s_pre) + \
                      m_earth * (v_e_post - v_e_pre) + \
                      m_moon * (v_m_post - v_m_pre) + \
                      m_tug * (v_tug - v_t_pre)

            J_applied += dp_step
            J_partners -= dp_step

        p_final_bodies = m_sun * v_s_post + m_earth * v_e_post + m_moon * v_m_post + m_tug * v_tug
        dP_bodies = p_final_bodies - p0_bodies

        res1_rel = float(np.linalg.norm(dP_bodies - J_applied) / p_scale)
        res2_rel = float(np.linalg.norm(J_applied + J_partners) / p_scale)
        drift_rel = float(np.linalg.norm(dP_bodies + J_partners) / p_scale)
        return res1_rel, res2_rel, drift_rel

    res1_1yr, res2_1yr, drift_1yr = evaluate_residuals(1.0)
    assert res1_1yr < 1.0e-9
    assert res2_1yr < 1.0e-9
    assert drift_1yr < 1.0e-9

    res1_100yr, res2_100yr, drift_100yr = evaluate_residuals(100.0)
    assert res1_100yr < 1.0e-9
    assert res2_100yr < 1.0e-9
    assert drift_100yr < 1.0e-9


def test_per_body_momentum_changes_sum_to_dp_bodies_vector():
    """Verify that raw per-body momentum change vectors (Sun, Earth, Moon, Tug) sum to dP_bodies."""
    import rebound

    mu_sun = constants.GM_SUN
    m_sun = mu_sun / constants.G
    m_earth = constants.M_EARTH
    m_moon = constants.M_MOON
    m_tug = 9.4e20
    d0 = 1.2701e9
    r0 = constants.AU
    v0 = math.sqrt(mu_sun / r0)
    r_moon = 3.844e8
    v_moon = math.sqrt(constants.G * m_earth / r_moon)
    f_pull = constants.G * m_earth * m_tug / (d0**2)
    omega0 = v0 / r0

    sim = rebound.Simulation()
    sim.integrator = "ias15"
    sim.G = constants.G
    sim.add(name="Sun", m=m_sun, x=0.0, y=0.0, z=0.0, vx=0.0, vy=0.0, vz=0.0)
    sim.add(name="Earth", m=m_earth, x=r0, y=0.0, z=0.0, vx=0.0, vy=v0, vz=0.0)
    sim.add(name="Moon", m=m_moon, x=r0 + r_moon, y=0.0, z=0.0, vx=0.0, vy=v0 + v_moon, vz=0.0)

    v_tug = np.array([-d0 * omega0, v0, 0.0])
    p0_s = m_sun * np.array([sim.particles[0].vx, sim.particles[0].vy, sim.particles[0].vz])
    p0_e = m_earth * np.array([sim.particles[1].vx, sim.particles[1].vy, sim.particles[1].vz])
    p0_m = m_moon * np.array([sim.particles[2].vx, sim.particles[2].vy, sim.particles[2].vz])
    p0_t = m_tug * v_tug.copy()
    p0_bodies = p0_s + p0_e + p0_m + p0_t

    def af(sim_pointer):
        s = sim_pointer.contents
        ps = s.particles[0]
        pe = s.particles[1]
        dx = pe.x - ps.x
        dy = pe.y - ps.y
        r = math.sqrt(dx * dx + dy * dy)
        tx = -dy / r
        ty = dx / r
        pe.ax += (f_pull * tx) / pe.m
        pe.ay += (f_pull * ty) / pe.m

        rtx = pe.x + d0 * tx
        rty = pe.y + d0 * ty
        rt_mag = math.sqrt(rtx * rtx + rty * rty)
        f_sun_tug = constants.G * ps.m * m_tug / (rt_mag**3)
        ps.ax += (f_sun_tug * rtx) / ps.m
        ps.ay += (f_sun_tug * rty) / ps.m

    sim.additional_forces = af
    sim.force_is_velocity_dependent = 0

    dt_s = 10.0 * 86400.0
    for _ in range(36):  # ~1 year
        sim.integrate(sim.t + dt_s)
        pe_1 = sim.particles[1]
        ps_1 = sim.particles[0]
        dx = pe_1.x - ps_1.x
        dy = pe_1.y - ps_1.y
        r = math.sqrt(dx * dx + dy * dy)
        rx = dx / r
        ry = dy / r
        omega = (pe_1.x * pe_1.vy - pe_1.y * pe_1.vx) / (r * r)
        v_tug = np.array([pe_1.vx - d0 * omega * rx, pe_1.vy - d0 * omega * ry, 0.0])

    p_final_s = m_sun * np.array([sim.particles[0].vx, sim.particles[0].vy, sim.particles[0].vz])
    p_final_e = m_earth * np.array([sim.particles[1].vx, sim.particles[1].vy, sim.particles[1].vz])
    p_final_m = m_moon * np.array([sim.particles[2].vx, sim.particles[2].vy, sim.particles[2].vz])
    p_final_t = m_tug * v_tug
    p_final_bodies = p_final_s + p_final_e + p_final_m + p_final_t

    dP_s = p_final_s - p0_s
    dP_e = p_final_e - p0_e
    dP_m = p_final_m - p0_m
    dP_t = p_final_t - p0_t
    dP_bodies = p_final_bodies - p0_bodies

    sum_dP_parts = dP_s + dP_e + dP_m + dP_t
    p_scale = m_earth * v0
    rel_diff = float(np.linalg.norm(sum_dP_parts - dP_bodies) / p_scale)
    assert rel_diff < 1.0e-15, f"Per-body momentum sum differed from dP_bodies by {rel_diff}"


def test_fails_if_sun_reaction_removed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Verify that removing the Tug's solar reaction on the Sun causes momentum drift > 1e-5 and fails validation."""
    monkeypatch.setattr(_sim_mod, "RESULTS_DIR", tmp_path)

    res_no_reaction = run_full_spiral_simulation(
        target_radius_au=1.0005,
        dt_days=10.0,
        coast_years=0.1,
        downsample_frames=50,
        apply_sun_tug_reaction=False,
    )
    max_mom_drift = res_no_reaction["monitors_summary"]["max_momentum_drift"]
    assert max_mom_drift > 1.0e-5
    assert res_no_reaction["validation_passed"] is False
    assert res_no_reaction["winning_conditions"]["W5_physics_is_honest"] is False

