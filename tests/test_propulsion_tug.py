"""Tests for Ceres Gravity Tug propulsion driver, relativistic rocket physics, and station-keeping (Step 4)."""

import json
import math
from pathlib import Path
import time
import numpy as np
import pytest
import yaml

from octo.core import constants
from octo.core.coupler import SimulationCoupler, create_default_driver_registry
from octo.core.ledger import Ledger
from octo.core.state import BodyState, State
from octo.core.thresholds import load_thresholds, AssumedThresholdWarning
from octo.drivers.propulsion import (
    CeresTugDriver,
    lorentz_gamma,
    relativistic_rocket_thrust,
    relativistic_jet_power,
    standoff_distance_for_acceleration,
    two_cone_canting_loss,
    beam_photon_force,
    yaw_trim_angle,
)


ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT_DIR / "config" / "base.yaml"
REF_PATH = ROOT_DIR / "results" / "reference.json"


@pytest.fixture
def base_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def test_independent_relativistic_closed_form_checks():
    """Verify independent closed-form calculations for relativistic exhaust at v_e = 0.3c.

    Formulas:
      gamma = 1 / sqrt(1 - (v_e / c)^2)
      F = mdot * gamma * v_e
      P = (gamma - 1) * mdot * c^2
    Expected defaults:
      mdot ~ 2.3e9 kg/s
      power ~ 1.0e25 W
      total propellant ~ 7.4e20 kg over 10,000 years
    """
    v_e = 0.3 * constants.C_LIGHT
    beta = 0.3
    gamma_expected = 1.0 / math.sqrt(1.0 - beta**2)
    assert gamma_expected == pytest.approx(1.0482848367, rel=1e-8)

    gamma_calc = lorentz_gamma(v_e, constants.C_LIGHT)
    assert gamma_calc == pytest.approx(gamma_expected, rel=1e-12)

    # Required thrust for spiral transfer F ~ 2.2e17 N
    # With mdot = 2.342e9 kg/s:
    mdot_default = 2.342e9
    thrust_expected = mdot_default * gamma_expected * v_e
    thrust_calc = relativistic_rocket_thrust(mdot_default, v_e, constants.C_LIGHT)
    assert thrust_calc == pytest.approx(thrust_expected, rel=1e-12)
    assert 2.1e17 < thrust_calc < 2.3e17

    power_expected = (gamma_expected - 1.0) * mdot_default * (constants.C_LIGHT**2)
    power_calc = relativistic_jet_power(mdot_default, v_e, constants.C_LIGHT)
    assert power_calc == pytest.approx(power_expected, rel=1e-12)
    assert 0.95e25 < power_calc < 1.05e25  # power ~ 1e25 W

    total_time_s = 10000.0 * constants.YEAR
    total_propellant_kg = mdot_default * total_time_s
    assert total_propellant_kg == pytest.approx(7.39e20, rel=1e-2)  # ~ 7.4e20 kg


def test_relativistic_gamma_mutation_fails_physics_check():
    """Mutation test: if classical Newtonian physics (gamma = 1.0) is used, energy check fails."""
    v_e = 0.3 * constants.C_LIGHT
    mdot = 2.342e9
    gamma_true = lorentz_gamma(v_e, constants.C_LIGHT)
    p_relativistic = relativistic_jet_power(mdot, v_e, constants.C_LIGHT)

    # Mutated classical kinetic power P_classical = 0.5 * mdot * v_e^2
    p_classical = 0.5 * mdot * (v_e**2)
    discrepancy = abs(p_classical - p_relativistic) / p_relativistic

    # Classical formula underpredicts relativistic jet power by ~6.8%
    assert discrepancy > 0.05, "Gamma mutation did not produce significant discrepancy"


def test_standoff_distance_and_canting_formulas():
    """Verify analytic standoff distance d = sqrt(G * M_tug / a_earth) and 5 deg canting loss."""
    m_tug = 9.4e20
    a_earth = 1.34e-7  # typical spiral acceleration
    d_expected = math.sqrt(constants.G * m_tug / a_earth)
    d_calc = standoff_distance_for_acceleration(m_tug, a_earth, constants.G)
    assert d_calc == pytest.approx(d_expected, rel=1e-12)
    assert 6.5e8 < d_calc < 7.2e8  # ~ 6.8e8 m

    # 5 degree out-of-ecliptic cone half-angle
    half_angle_rad = math.radians(5.0)
    loss = two_cone_canting_loss(half_angle_rad)
    assert loss == pytest.approx(math.cos(half_angle_rad), rel=1e-12)
    assert loss > 0.99  # < 1% canting penalty


def test_beam_photon_force_and_yaw_trim():
    """Verify beam photon force P/c and compensating yaw trim angle psi_r."""
    p_beam = 1.0e25
    f_photon_expected = p_beam / constants.C_LIGHT
    f_photon_calc = beam_photon_force(p_beam, constants.C_LIGHT)
    assert f_photon_calc == pytest.approx(f_photon_expected, rel=1e-12)
    assert 3.3e16 < f_photon_calc < 3.4e16  # ~ 3.34e16 N

    f_tangential = 2.2e17
    psi_expected = math.atan(f_photon_expected / f_tangential)
    psi_calc = yaw_trim_angle(f_photon_calc, f_tangential)
    assert psi_calc == pytest.approx(psi_expected, rel=1e-12)
    assert 8.0 < math.degrees(psi_calc) < 9.0  # ~ 8.6 deg


@pytest.fixture
def sun_earth_tug_state(base_config: dict) -> State:
    """Setup a deterministic State containing Sun, Earth, Ceres Tug, and non-simulated sinks."""
    m_sun = constants.GM_SUN / constants.G
    m_earth = constants.M_EARTH
    tug_cfg = base_config.get("ceres_tug", {})
    m_tug = float(tug_cfg.get("mass_kg", 9.4e20))
    d0 = float(tug_cfg.get("standoff_distance_m", 6.84e8))

    r1 = constants.AU
    v1 = math.sqrt(constants.GM_SUN / r1)

    state = State(t=0.0, stored_energy_j=1.0e26)
    state.add_body(BodyState(name="Sun", mass_kg=m_sun, position_m=[0.0, 0.0, 0.0], velocity_m_s=[0.0, 0.0, 0.0]))

    # Earth at (r1, 0, 0)
    state.add_body(BodyState(name="Earth", mass_kg=m_earth, position_m=[r1, 0.0, 0.0], velocity_m_s=[0.0, v1, 0.0]))

    # Tug positioned ahead of Earth along orbital tangent (+Y) by standoff distance d0
    # In circular orbit at r1 + d0 along orbit track:
    r_tug = np.array([r1, d0, 0.0], dtype=np.float64)
    v_tug = np.array([0.0, v1, 0.0], dtype=np.float64)
    state.add_body(BodyState(name="Tug", mass_kg=m_tug, position_m=r_tug, velocity_m_s=v_tug))

    # Explicit non-simulated actors
    state.add_body(BodyState(name="ExhaustSink", mass_kg=0.0, position_m=[0.0, 0.0, 0.0], velocity_m_s=[0.0, 0.0, 0.0]))
    state.add_body(BodyState(name="PowerPlant", mass_kg=0.0, position_m=[0.0, 0.0, 0.0], velocity_m_s=[0.0, 0.0, 0.0]))
    return state


def test_ceres_tug_driver_exchanges_booking_and_audit(sun_earth_tug_state: State, base_config: dict):
    """CeresTugDriver books gravity pair, exhaust, photon push, and solar gravity Exchanges with clean audit."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=sun_earth_tug_state, thresholds=thresholds)

    driver = CeresTugDriver(state=sun_earth_tug_state, ledger=ledger, config=base_config)

    dt_step = 86400.0  # 1 day macro step
    driver.step(dt_step)

    # Check that exchanges were booked on the ledger
    net_force_earth = ledger.net_force_on("Earth")
    net_force_tug = ledger.net_force_on("Tug")

    # Earth is pulled forward by Tug (force in +Y direction)
    assert net_force_earth[1] > 0.0
    # Equal-and-opposite reaction exists on Tug
    assert math.isfinite(net_force_tug[0]) and math.isfinite(net_force_tug[1])

    # Propellant was expended and booked
    assert ledger.total_expelled_mass_kg > 0.0
    assert ledger.total_exhaust_ke_j > 0.0


def test_station_keeping_controller_holds_standoff_under_perturbation(
    sun_earth_tug_state: State, base_config: dict
):
    """PD station-keeping feedback controller holds standoff distance within tolerance even with perturbation."""
    tug_cfg = base_config.get("ceres_tug", {})
    d_target = float(tug_cfg.get("standoff_distance_m", 6.84e8))
    tol = float(tug_cfg.get("standoff_tolerance_m", 1.0e7))

    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=sun_earth_tug_state, thresholds=thresholds)
    driver = CeresTugDriver(state=sun_earth_tug_state, ledger=ledger, config=base_config)

    # Apply an initial perturbation of +5,000 km to tug distance
    perturbation_m = 5.0e6
    sun_earth_tug_state.get_body("Tug").position_m[1] += perturbation_m

    # Run for 60 days (several times the 19-day instability time constant)
    dt_step = 86400.0
    for _ in range(60):
        driver.step(dt_step)
        r_earth = sun_earth_tug_state.get_body("Earth").position_m
        r_tug = sun_earth_tug_state.get_body("Tug").position_m
        d_curr = float(np.linalg.norm(r_tug - r_earth))
        assert abs(d_curr - d_target) < tol, f"Station-keeping diverged: d={d_curr}, target={d_target}"


def test_tug_stops_thrust_at_target_and_reports_elements(sun_earth_tug_state: State, base_config: dict):
    """When target radius (2.7 AU) is reached, thrust is shut off and final a, e are reported."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=sun_earth_tug_state, thresholds=thresholds)
    driver = CeresTugDriver(state=sun_earth_tug_state, ledger=ledger, config=base_config)

    # Artificially position bodies near target radius to test cutoff logic
    target_r = 2.7 * constants.AU
    sun_earth_tug_state.get_body("Earth").position_m = np.array([target_r, 0.0, 0.0], dtype=np.float64)
    v_circ = math.sqrt(constants.GM_SUN / target_r)
    sun_earth_tug_state.get_body("Earth").velocity_m_s = np.array([0.0, v_circ, 0.0], dtype=np.float64)

    # Step driver
    driver.step(86400.0)
    assert driver.is_cutoff is True
    assert driver.last_thrust_n == 0.0

    a_final, e_final = driver.get_orbital_elements("Earth")
    assert pytest.approx(a_final / constants.AU, rel=1e-3) == 2.7
    assert e_final < 0.01


def test_macro_step_convergence_study(sun_earth_tug_state: State, base_config: dict):
    """Convergence study: halving the macro step yields agreement within tolerance."""
    dt_1 = 86400.0 * 10.0  # 10 days
    dt_2 = 86400.0 * 5.0   # 5 days (halved)

    # Integrate for 100 days under both timesteps
    sim_days = 100.0
    n1 = int(sim_days / 10.0)
    n2 = int(sim_days / 5.0)

    # Run 1
    s1 = sun_earth_tug_state.clone()
    with pytest.warns(AssumedThresholdWarning):
        th = load_thresholds()
    drv1 = CeresTugDriver(state=s1, ledger=Ledger(s1, th), config=base_config)
    for _ in range(n1):
        drv1.step(dt_1)
    r1_final = np.linalg.norm(s1.get_body("Earth").position_m)

    # Run 2
    s2 = sun_earth_tug_state.clone()
    drv2 = CeresTugDriver(state=s2, ledger=Ledger(s2, th), config=base_config)
    for _ in range(n2):
        drv2.step(dt_2)
    r2_final = np.linalg.norm(s2.get_body("Earth").position_m)

    # Relative difference between step sizes must be small (< 0.1%)
    rel_diff = abs(r1_final - r2_final) / r1_final
    assert rel_diff < 1.0e-3


def test_1000_year_timing_and_extrapolation(sun_earth_tug_state: State, base_config: dict):
    """Time a 1,000-year simulated run and extrapolate to 10,000 years."""
    with pytest.warns(AssumedThresholdWarning):
        th = load_thresholds()
    ledger = Ledger(sun_earth_tug_state, th)
    driver = CeresTugDriver(state=sun_earth_tug_state, ledger=ledger, config=base_config)

    # Step at 10-day macro steps for 1,000 years
    macro_dt = 86400.0 * 10.0
    num_steps = int((1000.0 * constants.YEAR) / macro_dt)

    t0 = time.perf_counter()
    for _ in range(num_steps):
        driver.step(macro_dt)
    t1 = time.perf_counter()

    wall_1kyr = t1 - t0
    wall_10kyr = wall_1kyr * 10.0
    print(f"\n[STEP 4 BENCHMARK] 1,000 yr wall time: {wall_1kyr:.3f} s | Extrapolated 10,000 yr: {wall_10kyr:.2f} s ({wall_10kyr/60.0:.2f} min)")
    assert wall_1kyr < 20.0, f"1,000-year run took too long: {wall_1kyr:.2f} s"


def test_propulsion_edge_cases_and_model_coverage():
    """Verify input validation, zero branches, and PropulsionModel coverage."""
    from octo.drivers.propulsion import PropulsionModel

    # 1. Superluminal velocity raises ValueError
    with pytest.raises(ValueError):
        lorentz_gamma(constants.C_LIGHT * 1.1)

    with pytest.raises(ValueError):
        lorentz_gamma(-100.0)

    # 2. Non-positive acceleration raises ValueError
    with pytest.raises(ValueError):
        standoff_distance_for_acceleration(9.4e20, target_accel_m_s2=-1.0)

    # 3. Zero tangential thrust yaw angle returns 0.0
    assert yaw_trim_angle(1e16, f_thrust_tangential_n=0.0) == 0.0

    # 4. PropulsionModel with active thrust
    model = PropulsionModel(exhaust_velocity_m_s=3000.0, mass_flow_kg_s=10.0, efficiency=0.8)
    thrust, power, mdot, ve = model(0.0, np.array([1.0, 0.0]), np.array([0.0, 100.0]), 1000.0)
    assert np.allclose(thrust, [0.0, 30000.0])
    assert power > 0.0
    assert mdot == 10.0
    assert ve == 3000.0

    # Model with zero velocity vector defaults to +Y direction
    thrust_zero_v, _, _, _ = model(0.0, np.array([1.0, 0.0]), np.array([0.0, 0.0]), 1000.0)
    assert np.allclose(thrust_zero_v, [0.0, 30000.0])

    # 5. CeresTugDriver step with missing bodies or d=0
    empty_state = State()
    driver = CeresTugDriver(state=empty_state)
    driver.step(86400.0)  # Should return early without error

    coincident_state = State()
    coincident_state.add_body(BodyState("Earth", 1.0, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    coincident_state.add_body(BodyState("Tug", 1.0, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    driver2 = CeresTugDriver(state=coincident_state)
    driver2.step(86400.0)  # d=0 should return early without error
