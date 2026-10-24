"""Tests for Step 8: Physical Structure Driver & Structural Safety Factor SF >= 1.5."""

import pytest
from octo.core import constants
from octo.core.coupler import SimulationCoupler, create_default_driver_registry
from octo.core.ledger import Ledger
from octo.core.state import BodyState, State
from octo.core.thresholds import get_threshold_value, load_thresholds
from octo.drivers.structure import (
    StructureDriver,
    compute_cradle_bearing_stress_pa,
    compute_safety_factor,
)


@pytest.fixture
def thresholds():
    return load_thresholds()


def test_thrust_cradle_stress_and_safety_factor(thresholds):
    """Verify thrust cradle bearing stress is ~0.318 MPa and safety factor SF is ~15.7 >= 1.5."""
    min_sf = float(get_threshold_value(thresholds, "structure", "min_safety_factor"))

    f_thrust = 2.325648e17  # N nominal Ceres tug thrust
    r_ceres = 4.73e5        # m Ceres volumetric mean radius (~473 km)

    stress_pa = compute_cradle_bearing_stress_pa(f_thrust, r_ceres)
    # Stress is around 0.33 MPa
    assert 1.0e5 < stress_pa < 1.0e6

    # Carbonaceous chondrite / ice-rock yield strength is ~5.0 MPa (5.0e6 Pa)
    rock_yield_pa = 5.0e6
    sf = compute_safety_factor(yield_strength_pa=rock_yield_pa, applied_stress_pa=stress_pa)

    assert sf >= min_sf
    assert pytest.approx(sf, rel=0.1) == 15.1


def test_structure_driver_evaluates_and_flags_overload(thresholds):
    """Verify StructureDriver runs nominal with zero flags and raises flag on extreme overload."""
    state = State(t=0.0)
    state.add_body(BodyState("Sun", constants.GM_SUN / constants.G, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    state.add_body(BodyState("Earth", constants.M_EARTH, [constants.AU, 0.0, 0.0], [0.0, 29784.7, 0.0]))
    state.add_body(BodyState("Tug", 9.4e20, [constants.AU, 1.2701e9, 0.0], [0.0, 29784.7, 0.0]))

    ledger = Ledger(state, thresholds)
    driver = StructureDriver(
        state=state,
        ledger=ledger,
        config={"ceres_tug": {"thrust_n": 2.3256e17, "radius_m": 4.73e5}},
        thresholds=thresholds,
    )

    # Step 1: Nominal
    flags = driver.evaluate(dt=86400.0)
    assert len(flags) == 0
    assert driver.current_safety_factor > 10.0

    # Step 2: Inject extreme thrust overload (100x nominal)
    driver.config["ceres_tug"]["thrust_n"] = 2.3256e19
    flags_overload = driver.evaluate(dt=86400.0)
    assert len(flags_overload) == 1
    assert flags_overload[0].code == "STRUCTURAL_SAFETY_FACTOR_VIOLATION"
    assert flags_overload[0].quantity == "structure.min_safety_factor"


def test_analytic_structural_elements_closed_form(thresholds):
    """Verify all 5 analytic elements (mount, radiator, shield, mirror support, tidal) pass SF >= 1.5."""
    from octo.drivers.structure import (
        compute_engine_mount_bearing_stress_pa,
        compute_radiator_panel_stress_pa,
        compute_shield_membrane_stress_pa,
        compute_mirror_support_buckling_load_n,
        compute_tidal_tensile_stress_pa,
    )

    min_sf = float(get_threshold_value(thresholds, "structure", "min_safety_factor"))
    assert min_sf == 1.5

    # 1. Engine Mount Bearing Stress: F = 2.3256e17 N, A = 3.0e9 m2, sigma_yield = 900 MPa
    f_thrust = 2.325648e17
    a_mount = 3.0e9
    sigma_mount = compute_engine_mount_bearing_stress_pa(f_thrust, a_mount)
    assert sigma_mount == pytest.approx(77521600.0, rel=1e-3)
    sf_mount = compute_safety_factor(9.0e8, sigma_mount)
    assert sf_mount >= min_sf
    assert sf_mount > 10.0

    # 2. Radiator Panel Stress: M = 1e9 kg, a = 3.85e-8 m/s2, A_root = 100 m2, sigma_yield = 250 MPa
    m_rad = 1.0e9
    accel = 3.846e-8
    a_root = 100.0
    sigma_rad = compute_radiator_panel_stress_pa(m_rad, accel, a_root)
    assert sigma_rad == pytest.approx(0.3846, rel=1e-3)
    sf_rad = compute_safety_factor(2.5e8, sigma_rad)
    assert sf_rad >= min_sf
    assert sf_rad > 1.0e8

    # 3. Shield Membrane Stress: P = 1e-9 Pa, R = 5e5 m, t = 1e-3 m, sigma_yield = 150 MPa
    p_rad = 1.0e-9
    r_shield = 5.0e5
    t_shield = 1.0e-3
    sigma_shield = compute_shield_membrane_stress_pa(p_rad, r_shield, t_shield)
    assert sigma_shield == pytest.approx(0.25, rel=1e-3)
    sf_shield = compute_safety_factor(1.5e8, sigma_shield)
    assert sf_shield >= min_sf
    assert sf_shield > 1.0e8

    # 4. Mirror Support Buckling: E = 230 GPa, I = 1e-3 m4, L_bay = 20 m
    e_mod = 2.3e11
    i_mom = 1.0e-3
    l_strut = 20.0
    p_cr = compute_mirror_support_buckling_load_n(e_mod, i_mom, l_strut)
    assert p_cr > 9.0e5  # ~5.67 MN critical buckling load per truss bay
    p_applied_per_mast = 1.048e9 / 10000.0  # 10,000 masts supporting 1.05 GN load = 104.8 kN
    sf_mirror = p_cr / p_applied_per_mast
    assert sf_mirror >= min_sf
    assert sf_mirror > 50.0

    # 5. Tug Tidal Load from Earth: M_earth = 5.9722e24 kg, M_tug = 9.4e20 kg, R_tug = 4.73e5 m, d = 1.277e9 m
    sigma_tidal = compute_tidal_tensile_stress_pa(
        m_primary_kg=5.9722e24,
        m_body_kg=9.4e20,
        r_body_m=4.73e5,
        distance_m=1.277e9,
    )
    assert sigma_tidal < 500.0  # ~242 Pa
    sf_tidal = compute_safety_factor(5.0e6, sigma_tidal)
    assert sf_tidal >= min_sf
    assert sf_tidal > 10000.0
