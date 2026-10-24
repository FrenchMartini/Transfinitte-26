"""Tests for Step 5: Physical Habitability, Insolation, Moon Retention, Kinematics, and Exhaust Monitors."""

import math
import numpy as np
import pytest

from octo.core import constants
from octo.core.coupler import SimulationCoupler, create_default_driver_registry
from octo.core.flags import Flag, FlagRegistry
from octo.core.ledger import Ledger
from octo.core.state import BodyState, State
from octo.core.thresholds import get_threshold_value, load_thresholds
from octo.drivers.habitability import (
    HabitabilityDriver,
    compute_equilibrium_temperature,
    compute_hill_radius,
    compute_insolation,
    compute_plume_clearance_m,
    compute_surface_waste_heat_flux,
)


@pytest.fixture
def thresholds():
    return load_thresholds()


def test_insolation_and_equilibrium_temperature_nominal_and_violation(thresholds):
    """Verify insolation and equilibrium temperature at 1 AU and out of bounds detection."""
    min_s = float(get_threshold_value(thresholds, "earth_safety", "min_insolation_w_m2"))
    max_s = float(get_threshold_value(thresholds, "earth_safety", "max_insolation_w_m2"))
    min_t = float(get_threshold_value(thresholds, "earth_safety", "min_equilibrium_temp_k"))
    max_t = float(get_threshold_value(thresholds, "earth_safety", "max_equilibrium_temp_k"))

    # 1 AU nominal
    s_1au = compute_insolation(constants.AU, mirror_active=False)
    assert pytest.approx(s_1au, rel=1e-3) == constants.SOLAR_CONSTANT_1AU
    assert min_s <= s_1au <= max_s

    t_1au = compute_equilibrium_temperature(s_1au)
    # T_eq at 1 AU with albedo 0.3 is ~255 K
    assert pytest.approx(t_1au, abs=2.0) == 254.7
    assert min_t <= t_1au <= max_t

    # 2.7 AU with L1 climate mirror
    s_2_7_mirror = compute_insolation(2.7 * constants.AU, mirror_active=True)
    assert min_s <= s_2_7_mirror <= max_s

    # Unmitigated 4.0 AU deep freeze
    s_deep = compute_insolation(4.0 * constants.AU, mirror_active=False)
    assert s_deep < min_s


def test_moon_hill_radius_retention(thresholds):
    """Verify Moon retention fraction stays well below 0.5 Hill radius limit."""
    max_hill_frac = float(get_threshold_value(thresholds, "earth_safety", "moon_retention_hill_fraction"))

    r_hill_1au = compute_hill_radius(
        orbit_radius_m=constants.AU,
        m_central_kg=constants.M_EARTH,
        m_primary_kg=constants.GM_SUN / constants.G,
    )
    # At 1 AU, R_Hill is ~1.496e9 m (1.496 million km)
    assert pytest.approx(r_hill_1au, rel=1e-2) == 1.496e9

    # Nominal Moon semi-major axis is ~384,400 km
    r_moon = 384400000.0
    frac_nominal = r_moon / r_hill_1au
    assert frac_nominal < max_hill_frac
    assert pytest.approx(frac_nominal, abs=0.02) == 0.257


def test_exhaust_plume_clearance_and_surface_waste_heat(thresholds):
    """Verify out-of-ecliptic plumes clear Earth/Moon and surface waste heat flux is safe."""
    max_heat = float(get_threshold_value(thresholds, "earth_safety", "max_surface_waste_heat_w_m2"))
    attenuation = float(get_threshold_value(thresholds, "earth_safety", "thermal_shield_attenuation"))

    standoff_d = 1.2701e9  # 1.27 million km
    cone_deg = 5.0
    clearance_m = compute_plume_clearance_m(standoff_d, cone_deg)

    # Vertical clearance at Earth distance is ~1.107e8 m (110,700 km > 3x max lunar vertical excursion)
    assert clearance_m > 1.0e8

    # Waste heat at 1.085e23 W with attenuation 1.0e-5
    p_waste = 1.085e23
    flux = compute_surface_waste_heat_flux(p_waste, standoff_d, attenuation)
    assert flux < max_heat
    assert flux > 0.0


def test_habitability_driver_step_and_flag_emission(thresholds):
    """Verify HabitabilityDriver steps cleanly on nominal conditions and raises flags on violation."""
    state = State(t=0.0)
    state.add_body(BodyState("Sun", constants.GM_SUN / constants.G, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    state.add_body(BodyState("Earth", constants.M_EARTH, [constants.AU, 0.0, 0.0], [0.0, 29784.7, 0.0]))
    state.add_body(BodyState("Moon", 7.342e22, [constants.AU + 384400000.0, 0.0, 0.0], [0.0, 29784.7 + 1022.0, 0.0]))
    state.add_body(BodyState("Tug", 9.4e20, [constants.AU, 1.2701e9, 0.0], [0.0, 29784.7, 0.0]))

    ledger = Ledger(state, thresholds)
    driver = HabitabilityDriver(state=state, ledger=ledger, config={"l1_mirror_active": True})

    # Step 1: Nominal
    flags = driver.evaluate(dt=86400.0)
    assert len(flags) == 0

    # Step 2: Perturb Earth position to 5.0 AU with mirror disabled
    driver.l1_mirror_active = False
    state.get_body("Earth").position_m[0] = 5.0 * constants.AU
    flags_frozen = driver.evaluate(dt=86400.0)
    flag_codes = [f.code for f in flags_frozen]
    assert "INSOLATION_OUT_OF_BOUNDS" in flag_codes
    assert "TEMPERATURE_OUT_OF_BOUNDS" in flag_codes


def test_habitability_coupler_integration(thresholds):
    """Verify HabitabilityDriver integrates with SimulationCoupler replacing StubDriver."""
    state = State(t=0.0)
    state.add_body(BodyState("Sun", constants.GM_SUN / constants.G, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    state.add_body(BodyState("Earth", constants.M_EARTH, [constants.AU, 0.0, 0.0], [0.0, 29784.7, 0.0]))
    state.add_body(BodyState("Tug", 9.4e20, [constants.AU, 1.2701e9, 0.0], [0.0, 29784.7, 0.0]))

    ledger = Ledger(state, thresholds)
    config = {
        "macro_step_s": 86400.0,
        "drivers": ["habitability"],
        "l1_mirror_active": True,
    }

    registry = create_default_driver_registry()
    coupler = SimulationCoupler(state=state, ledger=ledger, config=config, driver_registry=registry)

    row = coupler.step(86400.0)
    assert row["audit_pass"] is True
    assert row["flags_count"] == 0
