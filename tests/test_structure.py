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
