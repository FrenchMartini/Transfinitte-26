"""Tests for Step 2.1: units.py, exchange.py, state.py, and Flag dataclass in flags.py."""

import dataclasses
import numpy as np
import pytest

from octo.core import constants
from octo.core.units import (
    UnitMismatchError,
    Meters,
    Kilograms,
    Seconds,
    Newtons,
    Joules,
    Watts,
    Teslas,
    Amperes,
    au_to_meters,
    meters_to_au,
    years_to_seconds,
    seconds_to_years,
    km_to_meters,
    meters_to_km,
)
from octo.core.exchange import Exchange
from octo.core.state import BodyState, State
from octo.core.flags import Flag


def test_unit_wrappers_and_incompatible_type_error():
    """Typed boundary wrappers support same-unit arithmetic and raise UnitMismatchError on mix-up."""
    d1 = Meters(100.0)
    d2 = Meters(50.0)
    assert (d1 + d2).value == pytest.approx(150.0)
    assert (d1 - d2).value == pytest.approx(50.0)
    assert (d1 * 2.0).value == pytest.approx(200.0)
    assert float(d1) == pytest.approx(100.0)

    t1 = Seconds(10.0)
    m1 = Kilograms(5.0)
    f1 = Newtons(20.0)
    e1 = Joules(100.0)
    p1 = Watts(50.0)
    b1 = Teslas(1e-4)
    i1 = Amperes(1000.0)

    for incompatible in (t1, m1, f1, e1, p1, b1, i1):
        with pytest.raises(UnitMismatchError):
            _ = d1 + incompatible  # type: ignore[operator]
        with pytest.raises(UnitMismatchError):
            _ = d1 - incompatible  # type: ignore[operator]
        with pytest.raises(UnitMismatchError):
            _ = d1 < incompatible  # type: ignore[operator]


def test_unit_conversion_helpers():
    """Boundary conversion helpers convert accurately between AU/yr/km and SI floats."""
    assert au_to_meters(1.0) == pytest.approx(constants.AU)
    assert meters_to_au(constants.AU) == pytest.approx(1.0)
    assert years_to_seconds(1.0) == pytest.approx(constants.YEAR)
    assert seconds_to_years(constants.YEAR) == pytest.approx(1.0)
    assert km_to_meters(1.0) == pytest.approx(1000.0)
    assert meters_to_km(1000.0) == pytest.approx(1.0)


def test_exchange_immutability_and_fields():
    """Exchange is an immutable dataclass with all ARCHITECTURE.md Section 6 fields and read-only Vec3 arrays."""
    ex = Exchange(
        t=10.0,
        a="Sun",
        b="Earth",
        force_on_b=np.array([-1.0e22, 0.0, 0.0]),
        point=np.array([constants.AU, 0.0, 0.0]),
        power_in=0.0,
        heat_out=0.0,
        mass_out=0.0,
        exhaust_v=None,
        owner="orbit",
    )

    assert ex.t == 10.0
    assert ex.a == "Sun"
    assert ex.b == "Earth"
    assert ex.force_on_b.shape == (3,)
    assert ex.point.shape == (3,)
    assert ex.owner == "orbit"
    assert np.allclose(ex.reaction_on_a, np.array([1.0e22, 0.0, 0.0]))

    # Frozen dataclass: attribute assignment must fail
    with pytest.raises(dataclasses.FrozenInstanceError):
        ex.t = 20.0  # type: ignore[misc]

    # Underlying NumPy arrays must be read-only so drivers cannot mutate booked exchanges
    with pytest.raises(ValueError):
        ex.force_on_b[0] = 999.0


def test_state_deterministic_container():
    """State holds bodies in deterministic insertion/sorted order plus stored, heat, and radiated energy."""
    state = State(t=0.0, stored_energy_j=1.0e35)
    state.add_body(
        BodyState(
            name="Sun",
            mass_kg=constants.M_SUN,
            position_m=np.zeros(3),
            velocity_m_s=np.zeros(3),
        )
    )
    state.add_body(
        BodyState(
            name="Earth",
            mass_kg=constants.M_EARTH,
            position_m=np.array([constants.AU, 0.0, 0.0]),
            velocity_m_s=np.array([0.0, 29784.69, 0.0]),
        )
    )

    assert list(state.body_names()) == ["Sun", "Earth"]
    assert state.get_body("Earth").mass_kg == pytest.approx(constants.M_EARTH)
    assert state.stored_energy_j == pytest.approx(1.0e35)
    assert state.heat_energy_j == 0.0
    assert state.radiated_energy_j == 0.0

    snap = state.clone()
    snap.get_body("Earth").position_m[0] = 0.0
    assert state.get_body("Earth").position_m[0] == pytest.approx(constants.AU)


def test_flag_dataclass_contract():
    """Flag has fields (code, t, source, quantity, value, limit, enabler_id)."""
    f = Flag(
        code="SAFETY_FACTOR_LOW",
        t=100.0,
        source="structure",
        quantity="structure.min_safety_factor",
        value=1.2,
        limit=1.5,
    )
    assert f.code == "SAFETY_FACTOR_LOW"
    assert f.enabler_id is None
