"""Tests for REBOUND IAS15 OrbitDriver and external forces from Ledger (Step 3.1)."""

import json
from pathlib import Path
import numpy as np
import pytest
import yaml

from octo.core import constants
from octo.core.exchange import Exchange
from octo.core.ledger import Ledger
from octo.core.state import BodyState, State
from octo.core.thresholds import load_thresholds, AssumedThresholdWarning
from octo.drivers.orbit import (
    OrbitDriver,
    orbital_period,
    measure_rebound_performance,
)


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


@pytest.fixture
def sun_earth_barycentric_state() -> State:
    """Create a physically consistent two-body Sun-Earth State in barycentric frame."""
    m_sun = constants.GM_SUN / constants.G
    m_earth = constants.M_EARTH
    mu_tot = constants.G * (m_sun + m_earth)
    r_earth = constants.AU
    v_earth = np.sqrt(mu_tot / r_earth)

    # Heliocentric initial positions
    r_sun_h = np.zeros(3, dtype=np.float64)
    v_sun_h = np.zeros(3, dtype=np.float64)
    r_earth_h = np.array([r_earth, 0.0, 0.0], dtype=np.float64)
    v_earth_h = np.array([0.0, v_earth, 0.0], dtype=np.float64)

    # Shift to center of mass
    r_com = (m_sun * r_sun_h + m_earth * r_earth_h) / (m_sun + m_earth)
    v_com = (m_sun * v_sun_h + m_earth * v_earth_h) / (m_sun + m_earth)

    state = State(t=0.0)
    state.add_body(
        BodyState(
            name="Sun",
            mass_kg=m_sun,
            position_m=r_sun_h - r_com,
            velocity_m_s=v_sun_h - v_com,
        )
    )
    state.add_body(
        BodyState(
            name="Earth",
            mass_kg=m_earth,
            position_m=r_earth_h - r_com,
            velocity_m_s=v_earth_h - v_com,
        )
    )
    return state


def test_orbit_driver_initializes_from_state_and_config(
    sun_earth_barycentric_state: State, base_config: dict
):
    """OrbitDriver initializes a REBOUND IAS15 simulation with bodies from State and tolerances from config."""
    driver = OrbitDriver(sun_earth_barycentric_state, config=base_config)
    assert driver.sim.integrator.name.decode() == "ias15"
    assert driver.sim.G == pytest.approx(constants.G, rel=1e-12)
    assert driver.sim.N == 2
    assert driver.sim.integrator.epsilon == pytest.approx(
        base_config["integrator"]["rtol"], rel=1e-12
    )


def test_sun_earth_one_year_returns_to_start_within_tolerances(
    sun_earth_barycentric_state: State, base_config: dict, ref_data: dict
):
    """1 orbital period returns to initial position/velocity within reference.json tolerances."""
    int_ref = ref_data["one_year_orbit_integration"]
    m_sun = sun_earth_barycentric_state.get_body("Sun").mass_kg
    m_earth = sun_earth_barycentric_state.get_body("Earth").mass_kg
    mu_tot = constants.G * (m_sun + m_earth)
    period = 2.0 * np.pi * np.sqrt((constants.AU**3) / mu_tot)

    r0_earth = sun_earth_barycentric_state.get_body("Earth").position_m.copy()
    v0_earth = sun_earth_barycentric_state.get_body("Earth").velocity_m_s.copy()

    driver = OrbitDriver(sun_earth_barycentric_state, config=base_config)
    updated_state = driver.step(period)

    rf_earth = updated_state.get_body("Earth").position_m
    vf_earth = updated_state.get_body("Earth").velocity_m_s

    pos_rel_err = float(np.linalg.norm(rf_earth - r0_earth) / constants.AU)
    vel_rel_err = float(np.linalg.norm(vf_earth - v0_earth) / np.linalg.norm(v0_earth))

    assert pos_rel_err < int_ref["pos_rel_tol"]
    assert vel_rel_err < int_ref["vel_rel_tol"]


def test_sun_earth_kepler_period_agreement(
    sun_earth_barycentric_state: State, base_config: dict, ref_data: dict
):
    """Orbital period matches Kepler third law and closed-form values in reference.json."""
    period_yr = ref_data["orbital_period_1au_yr"]["value"]
    rel_tol = ref_data["orbital_period_1au_yr"]["rel_tol"]

    m_sun = sun_earth_barycentric_state.get_body("Sun").mass_kg
    mu_sun = constants.G * m_sun
    analytic_period_s = orbital_period(constants.AU, mu_sun)
    analytic_period_yr = analytic_period_s / constants.YEAR

    assert pytest.approx(analytic_period_yr, rel=rel_tol) == period_yr


def test_orbit_driver_conservation_audit_no_drift(
    sun_earth_barycentric_state: State, base_config: dict
):
    """Ledger.audit() reports zero flags (no drift) across 1 orbit under REBOUND IAS15."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=sun_earth_barycentric_state, thresholds=thresholds)

    driver = OrbitDriver(sun_earth_barycentric_state, ledger=ledger, config=base_config)

    m_sun = sun_earth_barycentric_state.get_body("Sun").mass_kg
    m_earth = sun_earth_barycentric_state.get_body("Earth").mass_kg
    mu_tot = constants.G * (m_sun + m_earth)
    period = 2.0 * np.pi * np.sqrt((constants.AU**3) / mu_tot)

    # Step orbit in 10 macro steps
    n_steps = 10
    dt = period / n_steps
    curr_state = sun_earth_barycentric_state
    for _ in range(n_steps):
        curr_state = driver.step(dt)
        flags = ledger.audit(curr_state, curr_state.t)
        assert flags == [], f"Conservation drift detected: {flags}"


def test_orbit_driver_external_forces_from_ledger(
    sun_earth_barycentric_state: State, base_config: dict
):
    """OrbitDriver correctly applies external forces booked into Ledger via additional_forces callback."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=sun_earth_barycentric_state, thresholds=thresholds)

    # Book a continuous radial thrust on Earth pushing outwards away from Sun
    thrust_n = 1.0e15  # 1 PN force
    exchange = Exchange(
        t=0.0,
        a="Sun",
        b="Earth",
        force_on_b=np.array([thrust_n, 0.0, 0.0], dtype=np.float64),
        point=sun_earth_barycentric_state.get_body("Earth").position_m,
    )
    ledger.book(exchange, dt=86400.0)

    driver = OrbitDriver(sun_earth_barycentric_state, ledger=ledger, config=base_config)
    state_after = driver.step(86400.0)

    # Earth should have accelerated outward compared to unforced trajectory
    unforced_driver = OrbitDriver(
        sun_earth_barycentric_state.clone(), ledger=None, config=base_config
    )
    unforced_state = unforced_driver.step(86400.0)

    r_forced = state_after.get_body("Earth").position_m
    r_unforced = unforced_state.get_body("Earth").position_m
    assert r_forced[0] > r_unforced[0]


def test_orbit_driver_walltime_benchmark_and_extrapolation(base_config: dict):
    """Measure wall time for 1 simulated year with Python force callback and extrapolate to 10,000 years."""
    perf = measure_rebound_performance(sim_years=1.0, with_callback=True, config=base_config)
    assert perf["wall_time_1yr_s"] < 1.0, f"Integration too slow: {perf['wall_time_1yr_s']} s"
    assert perf["extrapolated_10kyr_s"] > 0.0
    print(f"\n[BENCHMARK] 1 yr wall time: {perf['wall_time_1yr_s']:.4f} s | 10k yr: {perf['extrapolated_10kyr_s']:.2f} s ({perf['extrapolated_10kyr_s']/60.0:.2f} min)")
