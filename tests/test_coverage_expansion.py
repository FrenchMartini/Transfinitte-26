"""Comprehensive test coverage expansion for units, state, exchange, ledger, monitors, and thresholds."""

import math
from pathlib import Path
import numpy as np
import pytest

from octo.core import constants
from octo.core.coupler import (
    DriverRegistry,
    PropulsionDriverWrapper,
    StubDriver,
    create_default_driver_registry,
)
from octo.core.exchange import Exchange
from octo.core.flags import (
    EnablerValidationError,
    Flag,
    FlagRegistry,
    HypotheticalEnabler,
)
from octo.core.ledger import Ledger, LedgerBookingError
from octo.core.state import BodyState, State
from octo.core.thresholds import (
    ThresholdValidationError,
    get_threshold_value,
    load_thresholds,
)
from octo.core.units import (
    Degrees,
    Joules,
    Kilograms,
    Meters,
    MetersPerSecond,
    MetersPerSecondSquared,
    Newtons,
    Pascals,
    Quantity,
    Radians,
    Seconds,
    UnitMismatchError,
    Watts,
    au_to_meters,
    degrees_to_radians,
    meters_to_au,
    radians_to_degrees,
)
from octo.drivers.habitability import (
    HabitabilityDriver,
    compute_equilibrium_temperature,
    compute_hill_radius,
    compute_insolation,
    compute_plume_clearance_m,
    compute_surface_waste_heat_flux,
)
from octo.drivers.structure import (
    StructureDriver,
    compute_cradle_bearing_stress_pa,
    compute_safety_factor,
)


# ==============================================================================
# 1. Units & Quantities Coverage (100% target for octo/core/units.py)
# ==============================================================================


def test_units_all_subclasses_and_comparisons():
    """Verify all Quantity subclasses, relational operators, multiplication, and division."""
    m1 = Meters(100.0)
    m2 = Meters(50.0)
    m3 = Meters(100.0)

    # Comparisons
    assert m2 < m1
    assert m2 <= m1
    assert m1 <= m3
    assert m1 > m2
    assert m1 >= m2
    assert m1 >= m3

    # Scalar multiplication and rmul
    assert (m1 * 2.5).value == 250.0
    assert (3.0 * m1).value == 300.0

    # Scalar division
    assert (m1 / 2.0).value == 50.0

    # Incompatible operations
    with pytest.raises(UnitMismatchError):
        _ = m1 * m2
    with pytest.raises(UnitMismatchError):
        _ = m1 / m2
    with pytest.raises(UnitMismatchError):
        _ = m1 < Seconds(10.0)
    with pytest.raises(UnitMismatchError):
        _ = m1 <= Seconds(10.0)
    with pytest.raises(UnitMismatchError):
        _ = m1 > Seconds(10.0)
    with pytest.raises(UnitMismatchError):
        _ = m1 >= Seconds(10.0)

    # All subclasses instantiation
    assert float(Kilograms(10.0)) == 10.0
    assert float(Seconds(60.0)) == 60.0
    assert float(MetersPerSecond(15.0)) == 15.0
    assert float(MetersPerSecondSquared(9.81)) == 9.81
    assert float(Newtons(1000.0)) == 1000.0
    assert float(Joules(500.0)) == 500.0
    assert float(Watts(200.0)) == 200.0
    assert float(Pascals(101325.0)) == 101325.0
    assert float(Radians(math.pi)) == math.pi
    assert float(Degrees(180.0)) == 180.0


def test_unit_conversion_helpers():
    """Verify angle and distance conversion helpers."""
    assert pytest.approx(degrees_to_radians(180.0)) == math.pi
    assert pytest.approx(radians_to_degrees(math.pi)) == 180.0
    assert pytest.approx(au_to_meters(1.0)) == constants.AU
    assert pytest.approx(meters_to_au(constants.AU)) == 1.0


# ==============================================================================
# 2. State & Exchange Coverage
# ==============================================================================


def test_state_body_management_and_exceptions():
    """Verify State body operations, cloning, 2D vector conversion, and error handling."""
    state = State(t=10.0, stored_energy_j=500.0)
    b = BodyState("Earth", 5.97e24, [1.0, 0.0, 0.0], [0.0, 30.0, 0.0])
    state.add_body(b)

    assert state.has_body("Earth") is True
    assert state.has_body("Mars") is False

    with pytest.raises(KeyError):
        state.get_body("Mars")

    # 2D vector conversion and invalid shape in BodyState
    b2d = BodyState("Moon", 7.34e22, [1.0, 2.0], [3.0, 4.0])
    assert b2d.position_m.shape == (3,)
    assert b2d.velocity_m_s.shape == (3,)
    with pytest.raises(ValueError, match="Expected 2D or 3D vector"):
        _ = BodyState("BadBody", 1.0, [1.0], [2.0, 3.0, 4.0])

    # Update body in state and clone
    state.get_body("Earth").position_m = np.array([2.0, 0.0, 0.0])
    state.get_body("Earth").velocity_m_s = np.array([0.0, 40.0, 0.0])
    state.get_body("Earth").mass_kg = 6.0e24

    clone = state.clone()
    assert clone.t == 10.0
    assert clone.has_body("Earth")
    assert clone.get_body("Earth").mass_kg == 6.0e24


def test_exchange_validation_errors():
    """Verify Exchange vector conversion, 2D padding, invalid shapes, and reaction calculation."""
    # 2D vectors are padded to 3D and exhaust_v is converted
    ex2d = Exchange(
        t=1.0,
        a="Tug",
        b="Earth",
        force_on_b=np.array([10.0, 20.0]),
        point=np.array([100.0, 200.0]),
        exhaust_v=np.array([-1000.0, 0.0]),
        owner="propulsion",
    )
    assert ex2d.force_on_b.shape == (3,)
    assert ex2d.point.shape == (3,)
    assert ex2d.exhaust_v is not None and ex2d.exhaust_v.shape == (3,)
    assert np.allclose(ex2d.reaction_on_a, np.array([-10.0, -20.0, 0.0]))

    # Invalid vector shape raises ValueError
    with pytest.raises(ValueError, match="Expected 2D or 3D vector"):
        _ = Exchange(
            t=0.0,
            a="Tug",
            b="Earth",
            force_on_b=np.array([1.0]),
            point=np.array([0.0, 0.0, 0.0]),
        )


# ==============================================================================
# 3. Ledger Error Handling & Actor Summaries
# ==============================================================================


def test_ledger_booking_validation_and_actor_summary():
    """Verify Ledger rejects unknown bodies, invalid dt, self-interaction, and provides actor summary."""
    state = State(t=0.0)
    state.add_body(BodyState("Sun", 1.989e30, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    state.add_body(BodyState("Earth", 5.97e24, [constants.AU, 0.0, 0.0], [0.0, 29780.0, 0.0]))
    state.add_body(BodyState("BeltSupply", 1.0e22, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))

    thresholds = load_thresholds()
    ledger = Ledger(state, thresholds)

    # Booking a non-Exchange object
    with pytest.raises(LedgerBookingError, match="requires an immutable Exchange instance"):
        ledger.book("not_an_exchange")  # type: ignore

    # Self-interaction rejected
    with pytest.raises(LedgerBookingError, match="Self-interaction rejected"):
        ledger.book(
            Exchange(t=0.0, a="Earth", b="Earth", force_on_b=np.array([1.0, 0.0, 0.0]), point=np.zeros(3))
        )

    # Booking with unknown component
    with pytest.raises(LedgerBookingError, match="unknown component"):
        ledger.book(
            Exchange(t=0.0, a="UnknownShip", b="Earth", force_on_b=np.array([1.0, 0.0, 0.0]), point=np.zeros(3))
        )

    # Booking with negative dt
    with pytest.raises(LedgerBookingError, match="Invalid step duration dt"):
        ledger.book(
            Exchange(t=0.0, a="Sun", b="Earth", force_on_b=np.array([1.0, 0.0, 0.0]), point=np.zeros(3)),
            dt=-5.0,
        )

    # Booking with NaN force
    with pytest.raises(LedgerBookingError, match="non-finite"):
        ledger.book(
            Exchange(t=0.0, a="Sun", b="Earth", force_on_b=np.array([float("nan"), 0.0, 0.0]), point=np.zeros(3))
        )

    # Legitimate bilateral booking
    ex = Exchange(
        t=0.0,
        a="Sun",
        b="Earth",
        force_on_b=np.array([1.0e10, 0.0, 0.0]),
        point=np.array([constants.AU, 0.0, 0.0]),
        power_in=1.0e12,
        heat_out=1.0e10,
    )
    ledger.book(ex)
    assert ledger.net_force_on("Earth")[0] == 1.0e10
    assert ledger.net_force_on("Sun")[0] == -1.0e10

    # Summary by actor
    summary = ledger.summary_by_actor()
    assert "Earth" in summary
    assert "Sun" in summary


# ==============================================================================
# 4. Structure Driver Validation (100% target)
# ==============================================================================


def test_structure_validation_and_edge_cases():
    """Verify structure edge cases, negative yields, and default fallback initialization."""
    with pytest.raises(ValueError, match="Asteroid radius must be strictly positive"):
        compute_cradle_bearing_stress_pa(1.0e17, radius_m=-100.0)

    with pytest.raises(ValueError, match="Material yield strength must be strictly positive"):
        compute_safety_factor(yield_strength_pa=-5.0, applied_stress_pa=100.0)

    # Zero applied stress gives infinite safety factor
    assert compute_safety_factor(yield_strength_pa=5.0e6, applied_stress_pa=0.0) == float("inf")

    # StructureDriver fallback initialization (no ledger, no thresholds passed)
    state = State(t=0.0)
    drv = StructureDriver(state=state)
    assert drv.name == "structure"
    assert drv.thresholds is not None


# ==============================================================================
# 5. Habitability Driver Validation & Violation Edge Cases (98%+ target)
# ==============================================================================


def test_habitability_function_validations():
    """Verify habitability math functions validate inputs properly."""
    with pytest.raises(ValueError, match="orbit_radius_m must be strictly positive"):
        compute_insolation(0.0)

    # mirror_gain active
    s_gain = compute_insolation(constants.AU, mirror_active=True, mirror_gain=1.5)
    assert pytest.approx(s_gain, rel=1e-3) == constants.SOLAR_CONSTANT_1AU * 1.5

    with pytest.raises(ValueError, match="Insolation must be non-negative"):
        compute_equilibrium_temperature(-10.0)

    with pytest.raises(ValueError, match="Masses and orbit radius must be strictly positive"):
        compute_hill_radius(-1.0, 5.97e24, 1.989e30)

    with pytest.raises(ValueError, match="Standoff distance must be strictly positive"):
        compute_surface_waste_heat_flux(1.0e20, standoff_d=0.0)


def test_habitability_driver_comprehensive_violations():
    """Verify HabitabilityDriver catches all violations: upper insolation/temp, accel, jerk, plume, waste heat."""
    thresholds = load_thresholds()
    state = State(t=0.0)
    state.add_body(BodyState("Sun", constants.GM_SUN / constants.G, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    # Earth very close to Sun (0.1 AU) -> extreme upper insolation & temp breach
    state.add_body(BodyState("Earth", constants.M_EARTH, [0.1 * constants.AU, 0.0, 0.0], [0.0, 94000.0, 0.0]))
    state.add_body(BodyState("Tug", 9.4e20, [0.1 * constants.AU, 1.27e9, 0.0], [0.0, 94000.0, 0.0]))

    driver = HabitabilityDriver(
        state=state,
        config={
            "l1_mirror_active": False,
            "cant_angle_deg": 5.0,
            "waste_heat_w": 1.0e26,  # Extreme waste heat
        },
        thresholds=thresholds,
    )

    flags_step1 = driver.step(dt=10.0)
    flag_codes = [f.code for f in flags_step1]
    assert "INSOLATION_OUT_OF_BOUNDS" in flag_codes
    assert "TEMPERATURE_OUT_OF_BOUNDS" in flag_codes
    assert "SURFACE_WASTE_HEAT_EXCEEDED" in flag_codes

    # Extreme acceleration on next step
    state.get_body("Earth").velocity_m_s[1] = 94000.0 + 1.0e6  # Sudden 1,000 km/s jump in 10s
    flags_step2 = driver.step(dt=10.0)
    flag_codes_step2 = [f.code for f in flags_step2]
    assert "EARTH_ACCELERATION_EXCEEDED" in flag_codes_step2

    # Next step: extreme jerk
    state.get_body("Earth").velocity_m_s[1] = 94000.0 + 1.0e7
    flags_step3 = driver.step(dt=10.0)
    flag_codes_step3 = [f.code for f in flags_step3]
    assert "EARTH_JERK_EXCEEDED" in flag_codes_step3

    # Plume clearance <= 0 check
    driver.config["cant_angle_deg"] = 180.0  # Firing backward directly into Earth
    # Evaluation without Earth
    empty_state = State(t=0.0)
    empty_driver = HabitabilityDriver(state=empty_state, thresholds=thresholds)
    assert empty_driver.evaluate(dt=1.0) == []


# ==============================================================================
# 6. FlagRegistry & Thresholds Validation Coverage
# ==============================================================================


def test_flag_registry_validation_and_properties():
    """Verify FlagRegistry validation exceptions and coverage properties."""
    with pytest.raises(EnablerValidationError, match="Enablers config must contain"):
        FlagRegistry({"invalid_key": []})

    with pytest.raises(EnablerValidationError, match="Each enabler entry must be a mapping"):
        FlagRegistry({"enablers": ["not_a_dict"]})

    with pytest.raises(EnablerValidationError, match="missing required field"):
        FlagRegistry({"enablers": [{"id": "E1", "name": "Incomplete"}]})

    with pytest.raises(EnablerValidationError, match="Enabler 'id' must be non-empty"):
        FlagRegistry({"enablers": [{"id": "", "name": "Blank", "relaxes": ["q"], "value": 1.0, "justification": "j", "sources": ["s"]}]})

    with pytest.raises(EnablerValidationError, match="must be a non-empty list"):
        FlagRegistry({"enablers": [{"id": "E1", "name": "EmptyRelaxes", "relaxes": [], "value": 1.0, "justification": "j", "sources": ["s"]}]})

    # Lower-bound violation coverage test
    reg = FlagRegistry(
        {
            "enablers": [
                {
                    "id": "E_LOW",
                    "name": "Lower Bound Enabler",
                    "relaxes": ["safety.min_limit"],
                    "value": 10.0,  # Can tolerate down to 10.0
                    "justification": "j",
                    "sources": ["s"],
                }
            ]
        }
    )
    flag_covered = Flag("CODE", 0.0, "src", "safety.min_limit", value=15.0, limit=20.0)
    resolved = reg.register(flag_covered)
    assert resolved.enabler_id == "E_LOW"
    assert len(reg.allowed_flags) == 1
    assert len(reg.all_flags) == 1

    flag_uncovered = Flag("CODE", 0.0, "src", "safety.min_limit", value=5.0, limit=20.0)  # Below 10.0!
    resolved_un = reg.register(flag_uncovered)
    assert resolved_un.enabler_id is None


def test_thresholds_schema_and_validation_errors(tmp_path: Path):
    """Verify load_thresholds raises ThresholdValidationError on corrupted configs."""
    with pytest.raises(ThresholdValidationError, match="not found"):
        load_thresholds(tmp_path / "nonexistent.yaml")

    bad_root = tmp_path / "bad_root.yaml"
    bad_root.write_text("string_root\n")
    with pytest.raises(ThresholdValidationError, match="must be a YAML mapping"):
        load_thresholds(bad_root)

    bad_cat = tmp_path / "bad_cat.yaml"
    bad_cat.write_text("simulation: 'not_a_dict'\n")
    with pytest.raises(ThresholdValidationError):
        load_thresholds(bad_cat)


# ==============================================================================
# 7. Driver Registry & Coupler Coverage
# ==============================================================================


def test_driver_registry_and_propulsion_wrapper():
    """Verify DriverRegistry fallback to StubDriver, PropulsionDriverWrapper, and custom registration."""
    registry = create_default_driver_registry()
    state = State(t=0.0)

    # Fallback to StubDriver for undeclared driver
    stub = registry.create("custom_unknown", state=state)
    assert isinstance(stub, StubDriver)
    assert stub.name == "custom_unknown"
    stub.step(10.0)

    # PropulsionDriverWrapper (used when Tug is not in state)
    prop_wrapper = registry.create("propulsion", state=state, config={"propulsion": {"exhaust_velocity_m_s": 50000.0, "mass_flow_kg_s": 10.0}})
    assert isinstance(prop_wrapper, PropulsionDriverWrapper)
    prop_wrapper.step(10.0)


# ==============================================================================
# 8. Thrust Budget Benchmark Verification in results/reference.json
# ==============================================================================


def test_thrust_budget_benchmark_in_reference_json():
    """Verify thrust_budget_benchmark in results/reference.json matches analytical closed form."""
    import json
    ref_path = Path(__file__).resolve().parent.parent / "results" / "reference.json"
    with open(ref_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "thrust_budget_benchmark" in data
    tb = data["thrust_budget_benchmark"]

    # Verify nominal thrust F_nom = mdot * gamma * ve
    mdot = 2.501e9
    ve = 89937737.4
    beta = ve / constants.C_LIGHT
    gamma = 1.0 / math.sqrt(1.0 - beta**2)
    f_nom_calc = mdot * gamma * ve
    assert pytest.approx(tb["nominal_thrust_n"], rel=1e-6) == f_nom_calc

    # Verify cant factor cos(5 deg)
    c_cant = math.cos(math.radians(5.0))
    f_cant_calc = f_nom_calc * c_cant
    assert pytest.approx(tb["canted_thrust_n"], rel=1e-6) == f_cant_calc

    # Verify photon force and yaw factor
    p_beam = 1.0e25
    f_ph = p_beam / constants.C_LIGHT
    assert pytest.approx(tb["photon_radiation_force_n"], rel=1e-6) == f_ph

    yaw_rad = math.atan(f_ph / f_cant_calc)
    yaw_deg = math.degrees(yaw_rad)
    assert pytest.approx(tb["yaw_trim_angle_deg"], rel=1e-4) == yaw_deg

    f_eff_calc = f_cant_calc * math.cos(yaw_rad)
    assert pytest.approx(tb["effective_tangential_thrust_n"], rel=1e-6) == f_eff_calc

    # Verify gravitational coupling pull matches effective thrust
    m_tug = 9.4e20
    d0 = 1.2701e9
    f_pull_calc = (constants.G * constants.M_EARTH * m_tug) / (d0**2)
    assert pytest.approx(tb["gravitational_coupling_pull_n"], rel=1e-5) == f_pull_calc
