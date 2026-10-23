"""Layer 2 Physics & Integrator Unit Tests (Phase 1)."""

import numpy as np
import pytest

from physics import constants
from physics.gravity import gravitational_acceleration, gravitational_force
from physics.orbital_elements import (
    circular_velocity,
    orbital_period,
    specific_orbital_energy,
    specific_angular_momentum,
    eccentricity_vector,
    eccentricity,
    semi_major_axis,
    hohmann_transfer,
)
from physics.propulsion import zero_thrust_propulsion, PropulsionModel
from physics.integrator import propagate_orbit


def test_circular_velocity_at_1_au():
    """Circular velocity at 1 AU around the Sun is ~29.78 km/s."""
    v_1au = circular_velocity(constants.AU, constants.MU_SUN)
    assert pytest.approx(v_1au / 1000.0, rel=1e-3) == 29.78


def test_keplers_third_law():
    """Orbital period at 1 AU is 1 year; scaling follows T^2 / a^3 = 4*pi^2 / mu."""
    t_1au = orbital_period(constants.AU, constants.MU_SUN)
    assert pytest.approx(t_1au / constants.YEAR, rel=1e-4) == 1.0

    for a_au in (0.5, 1.0, 2.7, 5.2):
        a = a_au * constants.AU
        period = orbital_period(a, constants.MU_SUN)
        lhs = (period**2) / (a**3)
        rhs = 4.0 * (np.pi**2) / constants.MU_SUN
        assert pytest.approx(lhs, rel=1e-12) == rhs


def test_specific_energy_and_semi_major_axis():
    """Specific orbital energy of a circular orbit at radius r equals -mu / (2r)."""
    r_vec = np.array([constants.AU, 0.0])
    v_circ = circular_velocity(constants.AU, constants.MU_SUN)
    v_vec = np.array([0.0, v_circ])

    eps = specific_orbital_energy(r_vec, v_vec, constants.MU_SUN)
    expected_eps = -constants.MU_SUN / (2.0 * constants.AU)
    assert pytest.approx(eps, rel=1e-12) == expected_eps

    a = semi_major_axis(r_vec, v_vec, constants.MU_SUN)
    assert pytest.approx(a, rel=1e-12) == constants.AU


def test_eccentricity_of_circular_and_elliptical_orbits():
    """Eccentricity of a circular orbit is ~0; known ellipse matches analytic e."""
    r_vec = np.array([constants.AU, 0.0])
    v_circ = circular_velocity(constants.AU, constants.MU_SUN)
    v_vec = np.array([0.0, v_circ])

    e_circ = eccentricity(r_vec, v_vec, constants.MU_SUN)
    assert e_circ == pytest.approx(0.0, abs=1e-14)
    e_vec = eccentricity_vector(r_vec, v_vec, constants.MU_SUN)
    assert np.linalg.norm(e_vec) == pytest.approx(0.0, abs=1e-14)

    # Periapsis at r_p = 1 AU, apoapsis at r_a = 2.7 AU -> e = (2.7 - 1.0)/(2.7 + 1.0)
    r_p = 1.0 * constants.AU
    r_a = 2.7 * constants.AU
    a_trans = 0.5 * (r_p + r_a)
    v_p = np.sqrt(constants.MU_SUN * (2.0 / r_p - 1.0 / a_trans))
    e_expected = (r_a - r_p) / (r_a + r_p)

    e_calc = eccentricity(np.array([r_p, 0.0]), np.array([0.0, v_p]), constants.MU_SUN)
    assert pytest.approx(e_calc, rel=1e-12) == e_expected


def test_gravity_force_and_acceleration():
    """Newtonian inverse-square gravity points toward the Sun with magnitude mu / r^2."""
    r_vec = np.array([constants.AU, 0.0])
    acc = gravitational_acceleration(r_vec, constants.MU_SUN)
    assert acc[0] < 0.0
    assert acc[1] == pytest.approx(0.0, abs=1e-20)
    assert pytest.approx(np.linalg.norm(acc), rel=1e-12) == constants.MU_SUN / (constants.AU**2)

    force = gravitational_force(r_vec, constants.M_EARTH, constants.MU_SUN)
    assert np.allclose(force, constants.M_EARTH * acc, rtol=1e-12)


def test_hohmann_transfer_analytic():
    """Analytic Hohmann transfer 1 -> 2.7 AU matches expected delta-v and duration."""
    r1 = 1.0 * constants.AU
    r2 = 2.7 * constants.AU
    res = hohmann_transfer(r1, r2, constants.MU_SUN)

    assert pytest.approx(res["dv1_m_s"] / 1000.0, rel=1e-3) == 6.198
    assert pytest.approx(res["dv2_m_s"] / 1000.0, rel=1e-3) == 4.800
    assert pytest.approx(res["total_dv_m_s"] / 1000.0, rel=1e-3) == 10.997
    assert pytest.approx(res["transfer_time_s"] / constants.YEAR, rel=1e-3) == 1.258


def test_propulsion_zero_thrust_stub_interface():
    """Propulsion stub takes (time, position, velocity, mass) and returns 4-tuple in SI."""
    r_vec = np.array([constants.AU, 0.0])
    v_vec = np.array([0.0, 29780.0])
    thrust_vec, power_w, mdot_kg_s, ve_m_s = zero_thrust_propulsion(
        0.0, r_vec, v_vec, constants.M_EARTH
    )
    assert isinstance(thrust_vec, np.ndarray)
    assert thrust_vec.shape == (2,)
    assert np.all(thrust_vec == 0.0)
    assert power_w == 0.0
    assert mdot_kg_s == 0.0
    assert ve_m_s == 0.0

    model = PropulsionModel()
    out = model(0.0, r_vec, v_vec, constants.M_EARTH)
    assert len(out) == 4
    assert np.all(out[0] == 0.0)


def test_integrator_dop853_one_year_circular_orbit():
    """DOP853 (rtol=1e-12) propagates 2D Sun-Earth for 1 orbital period back to start."""
    r0 = np.array([constants.AU, 0.0])
    v0 = np.array([0.0, circular_velocity(constants.AU, constants.MU_SUN)])
    period = orbital_period(constants.AU, constants.MU_SUN)

    traj = propagate_orbit(
        t_span=(0.0, period),
        r0=r0,
        v0=v0,
        m0=constants.M_EARTH,
        propulsion_fn=zero_thrust_propulsion,
        mu=constants.MU_SUN,
        rtol=1e-12,
        atol=1e-9,
        num_points=500,
    )

    assert traj["success"] is True
    r_final = traj["position"][-1]
    v_final = traj["velocity"][-1]
    m_final = traj["mass"][-1]

    pos_rel_err = np.linalg.norm(r_final - r0) / constants.AU
    vel_rel_err = np.linalg.norm(v_final - v0) / np.linalg.norm(v0)
    assert pos_rel_err < 1e-10
    assert vel_rel_err < 1e-10
    assert m_final == pytest.approx(constants.M_EARTH, rel=1e-15)

    h0 = specific_angular_momentum(r0, v0)
    h_final = specific_angular_momentum(r_final, v_final)
    assert pytest.approx(h_final, rel=1e-11) == h0
