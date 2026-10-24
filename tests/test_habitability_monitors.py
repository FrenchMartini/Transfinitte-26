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
    driver = HabitabilityDriver(state=state, ledger=ledger, config={"l1_mirror_active": False})

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
        "l1_mirror_active": False,
    }

    registry = create_default_driver_registry()
    coupler = SimulationCoupler(state=state, ledger=ledger, config=config, driver_registry=registry)

    row = coupler.step(86400.0)
    assert row["audit_pass"] is True
    assert row["flags_count"] == 0


def test_mirror_geometry_and_unexplained_flags_when_disabled(thresholds):
    """Verify geometric mirror model at 2.7 AU: T_eq with/without mirror and unexplained flags."""
    from octo.drivers.habitability import compute_mirror_reflected_flux

    r_2_7 = 2.7 * constants.AU
    mirror_cfg = {
        "active": True,
        "area_m2": 8.44e14,
        "reflectivity": 0.95,
        "mass_kg": 1.0e11,
        "position": "L1",
        "orientation_deg": 0.0,
    }

    # 1. With mirror (efficiency = 1.0):
    s_reflected = compute_mirror_reflected_flux(r_2_7, mirror_cfg)
    assert s_reflected > 1100.0  # Delivers ~1198 W/m^2 to compensate 186.7 W/m^2 direct flux
    s_with_mirror = compute_insolation(r_2_7, mirror_active=True, mirror_config=mirror_cfg)
    t_eq_with = compute_equilibrium_temperature(s_with_mirror)
    assert pytest.approx(s_with_mirror, rel=1e-3) == 1384.52
    assert pytest.approx(t_eq_with, abs=1.0) == 255.2

    # Capture efficiency sweep: 0.1, 0.5, 1.0
    mirror_cfg_01 = dict(mirror_cfg, capture_efficiency=0.1)
    s_01 = compute_insolation(r_2_7, mirror_active=True, mirror_config=mirror_cfg_01)
    t_eq_01 = compute_equilibrium_temperature(s_01)
    assert pytest.approx(s_01, rel=1e-3) == 306.47
    assert pytest.approx(t_eq_01, abs=1.0) == 175.7

    mirror_cfg_05 = dict(mirror_cfg, capture_efficiency=0.5)
    s_05 = compute_insolation(r_2_7, mirror_active=True, mirror_config=mirror_cfg_05)
    t_eq_05 = compute_equilibrium_temperature(s_05)
    assert pytest.approx(s_05, rel=1e-3) == 785.60
    assert pytest.approx(t_eq_05, abs=1.0) == 222.3

    # 2. Without mirror:
    s_no_mirror = compute_insolation(r_2_7, mirror_active=False)
    t_eq_without = compute_equilibrium_temperature(s_no_mirror)
    # Raw flux drops to 1361 / (2.7^2) = 186.7 W/m^2, T_eq drops to ~154.9 K
    assert pytest.approx(s_no_mirror, rel=1e-3) == 186.69
    assert pytest.approx(t_eq_without, abs=1.0) == 154.9

    # 3. HabitabilityDriver evaluates Earth at 2.7 AU with mirror but without station-keeping modelled:
    # Must raise MIRROR_STATION_KEEPING_UNMODELLED because radiation force exceeds solar gravity
    state_sk = State(t=0.0)
    state_sk.add_body(BodyState("Sun", constants.GM_SUN / constants.G, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    state_sk.add_body(BodyState("Earth", constants.M_EARTH, [r_2_7, 0.0, 0.0], [0.0, 18130.0, 0.0]))
    driver_sk = HabitabilityDriver(
        state=state_sk,
        thresholds=thresholds,
        config={"climate_mirror": mirror_cfg},
    )
    flags_sk = driver_sk.evaluate(dt=86400.0)
    assert any(f.code == "MIRROR_STATION_KEEPING_UNMODELLED" for f in flags_sk)

    # 4. HabitabilityDriver evaluates Earth at 2.7 AU without mirror:
    # Explicit stricter limits (e.g. 200 W/m^2, 200 K) passed as arguments to verify failure when unshielded
    import copy
    explicit_thresholds = copy.deepcopy(thresholds)
    explicit_thresholds["earth_safety"]["min_insolation_w_m2"]["value"] = 200.0
    explicit_thresholds["earth_safety"]["min_equilibrium_temp_k"]["value"] = 200.0

    state = State(t=0.0)
    state.add_body(BodyState("Sun", constants.GM_SUN / constants.G, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    state.add_body(BodyState("Earth", constants.M_EARTH, [r_2_7, 0.0, 0.0], [0.0, 18130.0, 0.0]))
    driver = HabitabilityDriver(
        state=state,
        thresholds=explicit_thresholds,
        config={"climate_mirror": {"active": False}},
    )
    flags = driver.evaluate(dt=86400.0)
    flag_codes = [f.code for f in flags]
    assert "INSOLATION_OUT_OF_BOUNDS" in flag_codes
    assert "TEMPERATURE_OUT_OF_BOUNDS" in flag_codes

    # 4. Enabler check: The mirror is NOT in hypothetical_enablers.yaml (only power, belt supply, exhaust accelerator)
    # So both flags must remain UNEXPLAINED by any enabler
    registry = FlagRegistry.from_yaml("config/hypothetical_enablers.yaml", thresholds=explicit_thresholds)
    resolved_flags = registry.register_many(flags)
    assert all(rf.enabler_id is None for rf in resolved_flags)
    assert registry.has_unresolved_flags() is True
    assert len(registry.unresolved_flags) == len(flags)

