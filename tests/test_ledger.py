"""Tests for Step 2.2: octo/core/ledger.py (conservation, reactions, rogue-driver audit, Kahan/fsum)."""

from decimal import Decimal
import numpy as np
import pytest

from octo.core import constants
from octo.core.exchange import Exchange
from octo.core.state import BodyState, State
from octo.core.thresholds import load_thresholds, AssumedThresholdWarning
from octo.core.ledger import Ledger, LedgerBookingError
from octo.drivers.orbit import circular_velocity, orbital_period, propagate_orbit
from octo.drivers.propulsion import zero_thrust_propulsion


@pytest.fixture(scope="module")
def thresholds() -> dict:
    """Load rulebook thresholds for conservation tolerances."""
    with pytest.warns(AssumedThresholdWarning):
        return load_thresholds()


def _make_sun_earth_state() -> State:
    """Create a standard 1 AU circular Sun-Earth State in barycentric or heliocentric frame."""
    state = State(t=0.0, stored_energy_j=1.0e36)
    v_earth = circular_velocity(constants.AU, constants.GM_SUN)
    # Put Sun with opposite momentum so total linear momentum is zero
    v_sun = -constants.M_EARTH * v_earth / constants.M_SUN
    state.add_body(
        BodyState(
            name="Sun",
            mass_kg=constants.M_SUN,
            position_m=np.zeros(3),
            velocity_m_s=np.array([0.0, v_sun, 0.0]),
        )
    )
    state.add_body(
        BodyState(
            name="Earth",
            mass_kg=constants.M_EARTH,
            position_m=np.array([constants.AU, 0.0, 0.0]),
            velocity_m_s=np.array([0.0, v_earth, 0.0]),
        )
    )
    return state


def test_a_book_rejects_self_force_nan_and_inf(thresholds: dict):
    """(a) book() rejects an Exchange where a == b, or with NaN or infinite force/values."""
    state = _make_sun_earth_state()
    ledger = Ledger(state, thresholds)

    # Self-force a == b
    with pytest.raises(LedgerBookingError, match="same component"):
        ledger.book(
            Exchange(
                t=0.0,
                a="Earth",
                b="Earth",
                force_on_b=np.array([100.0, 0.0, 0.0]),
                point=np.zeros(3),
                owner="test",
            )
        )

    # NaN force
    with pytest.raises(LedgerBookingError, match="finite"):
        ledger.book(
            Exchange(
                t=0.0,
                a="Sun",
                b="Earth",
                force_on_b=np.array([np.nan, 0.0, 0.0]),
                point=np.zeros(3),
                owner="test",
            )
        )

    # Infinite force
    with pytest.raises(LedgerBookingError, match="finite"):
        ledger.book(
            Exchange(
                t=0.0,
                a="Sun",
                b="Earth",
                force_on_b=np.array([np.inf, 0.0, 0.0]),
                point=np.zeros(3),
                owner="test",
            )
        )


def test_b_no_way_to_add_one_sided_force_or_bypass_book(thresholds: dict):
    """(b) Public API offers no way to add a force without its reaction; bypassing raises an error."""
    state = _make_sun_earth_state()
    ledger = Ledger(state, thresholds)

    # 1. Empty/missing partner IDs rejected
    with pytest.raises(LedgerBookingError):
        ledger.book(
            Exchange(
                t=0.0,
                a="",
                b="Earth",
                force_on_b=np.array([100.0, 0.0, 0.0]),
                point=np.zeros(3),
                owner="test",
            )
        )

    # 2. Unknown component not in State (unless Exhaust) rejected
    with pytest.raises(LedgerBookingError, match="unknown"):
        ledger.book(
            Exchange(
                t=0.0,
                a="Ghost",
                b="Earth",
                force_on_b=np.array([100.0, 0.0, 0.0]),
                point=np.zeros(3),
                owner="test",
            )
        )

    # 3. Attempting to mutate returned net force vector or internal attributes fails
    f_earth = ledger.net_force_on("Earth")
    with pytest.raises(ValueError):
        f_earth[0] = 1.0e20

    with pytest.raises(AttributeError):
        ledger.add_one_sided_force("Earth", np.array([1.0e20, 0.0, 0.0]))  # type: ignore[attr-defined]


def test_c_rogue_driver_mutating_state_triggers_audit_flags(thresholds: dict):
    """(c) ROGUE DRIVER TEST: mutating body momentum/energy/mass in State without booking triggers audit flags."""
    state = _make_sun_earth_state()
    ledger = Ledger(state, thresholds)

    # Clean state has 0 flags
    assert ledger.audit(state, t=0.0) == []

    # Rogue driver secretly boosts Earth velocity in X direction -> MOMENTUM_DRIFT & ENERGY_DRIFT
    rogue_state = state.clone()
    rogue_state.get_body("Earth").velocity_m_s[0] += 50.0
    flags = ledger.audit(rogue_state, t=10.0)
    codes = {f.code for f in flags}
    assert "MOMENTUM_DRIFT" in codes
    assert "ENERGY_DRIFT" in codes

    # Rogue driver secretly deletes Earth mass without booking exhaust -> MASS_DRIFT
    rogue_mass_state = state.clone()
    rogue_mass_state.get_body("Earth").mass_kg *= 0.99
    mass_flags = ledger.audit(rogue_mass_state, t=10.0)
    assert any(f.code == "MASS_DRIFT" for f in mass_flags)


def test_d_equal_and_opposite_reaction_and_torque_from_point(thresholds: dict):
    """(d) Every booked Exchange yields equal-and-opposite reaction and includes torque r x F from point."""
    state = _make_sun_earth_state()
    ledger = Ledger(state, thresholds)

    force = np.array([0.0, 2.0e17, 0.0])
    point = np.array([constants.AU, 6.371e6, 0.0])

    ex = Exchange(
        t=0.0,
        a="Sun",
        b="Earth",
        force_on_b=force,
        point=point,
        owner="test_driver",
    )
    ledger.book(ex, dt=10.0)

    # Net force on b is +force; net force on a is -force; sum is strictly zero
    assert np.allclose(ledger.net_force_on("Earth"), force)
    assert np.allclose(ledger.net_force_on("Sun"), -force)
    assert np.allclose(ledger.net_force_on("Earth") + ledger.net_force_on("Sun"), np.zeros(3))

    # Torque on b about origin is point x force; torque on a is point x (-force)
    expected_torque_b = np.cross(point, force)
    assert np.allclose(ledger.net_torque_on("Earth"), expected_torque_b)
    assert np.allclose(ledger.net_torque_on("Sun"), -expected_torque_b)
    assert np.allclose(
        ledger.net_torque_on("Earth") + ledger.net_torque_on("Sun"), np.zeros(3)
    )


def test_e_expelled_mass_and_rocket_equation_closure(thresholds: dict):
    """(e) Expelled mass is booked with its momentum and KE; planet + exhaust momentum & mass close."""
    state = State(t=0.0, stored_energy_j=1.0e35)
    m0 = constants.M_EARTH
    state.add_body(
        BodyState(
            name="Earth",
            mass_kg=m0,
            position_m=np.zeros(3),
            velocity_m_s=np.zeros(3),
        )
    )
    ledger = Ledger(state, thresholds)

    ve = 30000.0  # 30 km/s exhaust speed relative to Earth (-x direction)
    mdot = 1.0e10  # kg/s
    dt = 100.0  # s
    n_steps = 500

    for step_idx in range(n_steps):
        t = step_idx * dt
        earth = state.get_body("Earth")
        m_curr = earth.mass_kg
        v_curr = earth.velocity_m_s.copy()

        # Thrust on Earth is +mdot * ve in +x; exhaust velocity relative to Earth is -ve in x
        thrust_force = np.array([mdot * ve, 0.0, 0.0])
        exhaust_v_rel = np.array([-ve, 0.0, 0.0])
        jet_power = 0.5 * mdot * (ve**2)

        ledger.begin_step()
        ex = Exchange(
            t=t,
            a="Exhaust",
            b="Earth",
            force_on_b=thrust_force,
            point=earth.position_m.copy(),
            power_in=jet_power,
            heat_out=0.0,
            mass_out=mdot,
            exhaust_v=exhaust_v_rel,
            owner="propulsion",
        )
        ledger.book(ex, dt=dt)

        # Update Earth using conservation of momentum & energy for discrete mass packet dm
        # ejected at exhaust_v_rel relative to Earth's instantaneous velocity v_curr:
        # m_curr * v_curr = (m_curr - dm) * v_next + dm * (v_curr + exhaust_v_rel)
        # => (m_curr - dm) * (v_next - v_curr) = -dm * exhaust_v_rel = F_thrust * dt
        dm = mdot * dt
        dv_vec = (thrust_force * dt) / (m_curr - dm)
        v_next = v_curr + dv_vec
        # Exact kinetic energy drawn from stored_energy_j during this discrete ejection:
        v_ex_inertial = v_curr + exhaust_v_rel
        d_ke = (
            0.5 * (m_curr - dm) * float(np.dot(v_next, v_next))
            + 0.5 * dm * float(np.dot(v_ex_inertial, v_ex_inertial))
            - 0.5 * m_curr * float(np.dot(v_curr, v_curr))
        )
        earth.velocity_m_s = v_next
        earth.position_m = earth.position_m + v_curr * dt
        earth.mass_kg = m0 - ledger.total_expelled_mass_kg
        state.stored_energy_j -= d_ke

    # 1. Check Tsiolkovsky rocket equation dv = ve * ln(m0 / mf)
    mf = state.get_body("Earth").mass_kg
    expected_mf = m0 - mdot * dt * n_steps
    assert mf == pytest.approx(expected_mf, rel=1e-14)
    expected_dv = ve * np.log(m0 / mf)
    assert state.get_body("Earth").velocity_m_s[0] == pytest.approx(expected_dv, rel=1e-9)

    # 2. Check mass conservation (Earth mass + expelled mass == m0) and momentum closure
    flags = ledger.audit(state, t=n_steps * dt)
    assert flags == [], f"Unexpected conservation flags: {flags}"


def test_f_closed_two_body_system_within_config_tolerances(thresholds: dict):
    """(f) Closed Sun-Earth two-body orbit keeps E, p, L drift within rulebook_thresholds.yaml tolerances."""
    state = State(t=0.0, stored_energy_j=0.0)
    r0 = np.array([constants.AU, 0.0])
    v0 = np.array([0.0, circular_velocity(constants.AU, constants.GM_SUN)])
    period = orbital_period(constants.AU, constants.GM_SUN)

    # Heliocentric two-body energy/angular-momentum conservation check
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
            position_m=np.array([r0[0], r0[1], 0.0]),
            velocity_m_s=np.array([v0[0], v0[1], 0.0]),
        )
    )

    # Initialize ledger in heliocentric two-body mode (or update Sun recoil)
    traj = propagate_orbit(
        t_span=(0.0, period),
        r0=r0,
        v0=v0,
        rtol=1e-12,
        atol=1e-9,
        m0=constants.M_EARTH,
        propulsion_fn=zero_thrust_propulsion,
        mu=constants.GM_SUN,
        num_points=100,
    )

    r_final = np.array([traj["position"][-1][0], traj["position"][-1][1], 0.0])
    v_final = np.array([traj["velocity"][-1][0], traj["velocity"][-1][1], 0.0])

    # Place Sun with initial and final equal-and-opposite recoil so barycentric momentum is conserved
    state.get_body("Sun").velocity_m_s = -constants.M_EARTH * np.array([v0[0], v0[1], 0.0]) / constants.M_SUN
    ledger = Ledger(state, thresholds)

    state.get_body("Earth").position_m = r_final
    state.get_body("Earth").velocity_m_s = v_final
    state.get_body("Sun").velocity_m_s = -constants.M_EARTH * v_final / constants.M_SUN

    flags = ledger.audit(state, t=period)
    assert flags == []


def test_g_compensated_summation_million_tiny_contributions(thresholds: dict):
    """(g) Compensated summation (math.fsum / Kahan) shows zero drift over 1,000,000 tiny contributions."""
    state = _make_sun_earth_state()
    ledger = Ledger(state, thresholds)

    # Start with a large base contribution + 1,000,000 tiny increments that naive float addition loses
    base_val = 1.0e16
    tiny_val = 0.1234567890123456
    n_iter = 1_000_000

    ledger.record_scalar_contribution("test_accum", base_val)
    for _ in range(n_iter):
        ledger.record_scalar_contribution("test_accum", tiny_val)

    obtained = ledger.get_scalar_total("test_accum")

    # Compute exact reference in high-precision Decimal
    exact_ref = float(
        Decimal(str(base_val)) + Decimal(str(tiny_val)) * Decimal(n_iter)
    )
    assert obtained == exact_ref


def test_h_bit_identical_determinism(thresholds: dict):
    """(h) Running identical Exchange sequences twice produces bit-identical ledger totals."""
    def run_sequence() -> tuple[float, float, np.ndarray, np.ndarray]:
        st = _make_sun_earth_state()
        led = Ledger(st, thresholds)
        rng = np.random.default_rng(seed=12345)
        for i in range(200):
            f_vec = rng.normal(0.0, 1.0e16, size=3)
            pt = rng.normal(0.0, constants.AU, size=3)
            ex = Exchange(
                t=float(i),
                a="Sun",
                b="Earth",
                force_on_b=f_vec,
                point=pt,
                power_in=float(abs(f_vec[0]) * 10.0),
                heat_out=float(abs(f_vec[1]) * 2.0),
                mass_out=1000.0,
                exhaust_v=np.array([-10000.0, 0.0, 0.0]),
                owner="propulsion",
            )
            led.book(ex, dt=1.0)
        return (
            led.total_heat_booked_j,
            led.total_expelled_mass_kg,
            led.total_exhaust_momentum_kg_m_s,
            led.net_force_on("Earth"),
        )

    res1 = run_sequence()
    res2 = run_sequence()

    assert res1[0] == res2[0]
    assert res1[1] == res2[1]
    assert np.array_equal(res1[2], res2[2])
    assert np.array_equal(res1[3], res2[3])
