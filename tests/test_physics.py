"""Physics, Orbital Mechanics & Section 2 Reference Benchmarks (migrated to octo.drivers)."""

import json
from pathlib import Path
import numpy as np
import pytest

from octo.core import constants
from octo.drivers.orbit import (
    gravitational_acceleration,
    gravitational_force,
    circular_velocity,
    orbital_period,
    specific_orbital_energy,
    specific_angular_momentum,
    eccentricity_vector,
    eccentricity,
    semi_major_axis,
    hohmann_transfer,
    propagate_orbit,
    orbital_energy_change,
    average_power_required,
    solar_radiation_pressure_force,
    insolation_ratio,
)
from octo.drivers.propulsion import zero_thrust_propulsion, PropulsionModel


REFERENCE_PATH = Path(__file__).resolve().parent.parent / "results" / "reference.json"


@pytest.fixture(scope="module")
def ref_data() -> dict:
    """Load benchmark answers and tolerances from results/reference.json."""
    assert REFERENCE_PATH.is_file(), f"Missing {REFERENCE_PATH}"
    return json.loads(REFERENCE_PATH.read_text())


def test_circular_velocity_at_1_au(ref_data: dict):
    """Circular velocity at 1 AU around the Sun matches reference.json."""
    entry = ref_data["circular_velocity_1au_km_s"]
    v_1au_km_s = circular_velocity(constants.AU, constants.GM_SUN) / 1000.0
    assert pytest.approx(v_1au_km_s, rel=entry["rel_tol"]) == entry["value"]


def test_circular_velocity_at_target_au(ref_data: dict):
    """Circular velocity at target orbit (~2.7 AU) matches reference.json (~18.1 km/s)."""
    entry = ref_data["circular_velocity_target_km_s"]
    target_r_m = ref_data["hohmann_1_to_2_7_au"]["r2_au"] * constants.AU
    v_target_km_s = circular_velocity(target_r_m, constants.GM_SUN) / 1000.0
    assert pytest.approx(v_target_km_s, rel=entry["rel_tol"]) == entry["value"]


def test_keplers_third_law(ref_data: dict):
    """Orbital period at 1 AU is 1 year; scaling follows T^2 / a^3 = 4*pi^2 / GM_SUN."""
    entry = ref_data["orbital_period_1au_yr"]
    t_1au = orbital_period(constants.AU, constants.GM_SUN)
    assert pytest.approx(t_1au / constants.YEAR, rel=entry["rel_tol"]) == entry["value"]

    kepler_tol = ref_data["kepler_scaling_rel_tol"]["value"]
    for a_au in ref_data["kepler_test_radii_au"]["values"]:
        a = a_au * constants.AU
        period = orbital_period(a, constants.GM_SUN)
        lhs = (period**2) / (a**3)
        rhs = 4.0 * (np.pi**2) / constants.GM_SUN
        assert pytest.approx(lhs, rel=kepler_tol) == rhs


def test_specific_energy_and_semi_major_axis(ref_data: dict):
    """Specific orbital energy of a circular orbit at radius r equals -GM_SUN / (2r)."""
    tol = ref_data["exact_identity_rel_tol"]["value"]
    r_vec = np.array([constants.AU, 0.0])
    v_circ = circular_velocity(constants.AU, constants.GM_SUN)
    v_vec = np.array([0.0, v_circ])

    eps = specific_orbital_energy(r_vec, v_vec, constants.GM_SUN)
    expected_eps = -constants.GM_SUN / (2.0 * constants.AU)
    assert pytest.approx(eps, rel=tol) == expected_eps

    a = semi_major_axis(r_vec, v_vec, constants.GM_SUN)
    assert pytest.approx(a, rel=tol) == constants.AU


def test_eccentricity_of_circular_and_elliptical_orbits(ref_data: dict):
    """Eccentricity of a circular orbit is ~0; known ellipse matches analytic e."""
    abs_tol = ref_data["circular_eccentricity_abs_tol"]["value"]
    rel_tol = ref_data["exact_identity_rel_tol"]["value"]

    r_vec = np.array([constants.AU, 0.0])
    v_circ = circular_velocity(constants.AU, constants.GM_SUN)
    v_vec = np.array([0.0, v_circ])

    e_circ = eccentricity(r_vec, v_vec, constants.GM_SUN)
    assert e_circ == pytest.approx(0.0, abs=abs_tol)
    e_vec = eccentricity_vector(r_vec, v_vec, constants.GM_SUN)
    assert np.linalg.norm(e_vec) == pytest.approx(0.0, abs=abs_tol)

    h_cfg = ref_data["hohmann_1_to_2_7_au"]
    r_p = h_cfg["r1_au"] * constants.AU
    r_a = h_cfg["r2_au"] * constants.AU
    a_trans = 0.5 * (r_p + r_a)
    v_p = np.sqrt(constants.GM_SUN * (2.0 / r_p - 1.0 / a_trans))
    e_expected = (r_a - r_p) / (r_a + r_p)

    e_calc = eccentricity(np.array([r_p, 0.0]), np.array([0.0, v_p]), constants.GM_SUN)
    assert pytest.approx(e_calc, rel=rel_tol) == e_expected


def test_gravity_force_and_acceleration(ref_data: dict):
    """Newtonian inverse-square gravity points toward the Sun with magnitude GM_SUN / r^2."""
    rel_tol = ref_data["exact_identity_rel_tol"]["value"]
    r_vec = np.array([constants.AU, 0.0])
    acc = gravitational_acceleration(r_vec, constants.GM_SUN)
    assert acc[0] < 0.0
    assert acc[1] == pytest.approx(0.0, abs=ref_data["circular_eccentricity_abs_tol"]["value"])
    assert pytest.approx(np.linalg.norm(acc), rel=rel_tol) == constants.GM_SUN / (constants.AU**2)

    force = gravitational_force(r_vec, constants.M_EARTH, constants.GM_SUN)
    assert np.allclose(force, constants.M_EARTH * acc, rtol=rel_tol)


def test_hohmann_transfer_analytic(ref_data: dict):
    """Analytic Hohmann transfer 1 -> 2.7 AU matches reference.json delta-v and duration."""
    h_ref = ref_data["hohmann_1_to_2_7_au"]
    r1 = h_ref["r1_au"] * constants.AU
    r2 = h_ref["r2_au"] * constants.AU
    res = hohmann_transfer(r1, r2, constants.GM_SUN)

    assert pytest.approx(res["dv1_m_s"] / 1000.0, rel=h_ref["dv_rel_tol"]) == h_ref["dv1_km_s"]
    assert pytest.approx(res["dv2_m_s"] / 1000.0, rel=h_ref["dv_rel_tol"]) == h_ref["dv2_km_s"]
    assert pytest.approx(res["total_dv_m_s"] / 1000.0, rel=h_ref["dv_rel_tol"]) == h_ref["total_dv_km_s"]
    assert pytest.approx(res["transfer_time_s"] / constants.YEAR, rel=h_ref["time_rel_tol"]) == h_ref["transfer_time_yr"]
    assert pytest.approx(res["slow_spiral_dv_m_s"] / 1000.0, rel=h_ref["spiral_dv_rel_tol"]) == h_ref["slow_spiral_dv_km_s"]


def test_propulsion_zero_thrust_stub_interface():
    """Propulsion stub takes (time, position, velocity, mass) and returns 4-tuple in SI."""
    r_vec = np.array([constants.AU, 0.0])
    v_vec = np.array([0.0, circular_velocity(constants.AU, constants.GM_SUN)])
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


def test_propagate_orbit_requires_explicit_rtol_atol():
    """propagate_orbit must not have default rtol/atol values; callers must pass them explicitly."""
    r0 = np.array([constants.AU, 0.0])
    v0 = np.array([0.0, circular_velocity(constants.AU, constants.GM_SUN)])
    with pytest.raises(TypeError):
        propagate_orbit(t_span=(0.0, 100.0), r0=r0, v0=v0)  # type: ignore[call-arg]


def test_integrator_dop853_one_year_circular_orbit(ref_data: dict):
    """DOP853 propagates 2D Sun-Earth for 1 orbital period back to start within reference tolerances."""
    int_ref = ref_data["one_year_orbit_integration"]
    r0 = np.array([constants.AU, 0.0])
    v0 = np.array([0.0, circular_velocity(constants.AU, constants.GM_SUN)])
    period = orbital_period(constants.AU, constants.GM_SUN)

    traj = propagate_orbit(
        t_span=(0.0, period),
        r0=r0,
        v0=v0,
        m0=constants.M_EARTH,
        propulsion_fn=zero_thrust_propulsion,
        mu=constants.GM_SUN,
        rtol=int_ref["rtol"],
        atol=int_ref["atol"],
        num_points=int_ref["num_points"],
    )

    assert traj["success"] is True
    r_final = traj["position"][-1]
    v_final = traj["velocity"][-1]
    m_final = traj["mass"][-1]

    pos_rel_err = np.linalg.norm(r_final - r0) / constants.AU
    vel_rel_err = np.linalg.norm(v_final - v0) / np.linalg.norm(v0)
    assert pos_rel_err < int_ref["pos_rel_tol"]
    assert vel_rel_err < int_ref["vel_rel_tol"]
    assert m_final == pytest.approx(constants.M_EARTH, rel=int_ref["mass_rel_tol"])

    h0 = specific_angular_momentum(r0, v0)
    h_final = specific_angular_momentum(r_final, v_final)
    assert pytest.approx(h_final, rel=int_ref["ang_mom_rel_tol"]) == h0


def test_architecture_section2_hand_computed_facts(ref_data: dict):
    """Recompute and verify ARCHITECTURE.md Section 2 hand-computed physics facts from constants."""
    sec2 = ref_data["architecture_section2_facts"]
    r1 = sec2["r1_au"] * constants.AU
    r2 = sec2["r2_au"] * constants.AU

    # 1. Orbital energy change delta E = +1.67e33 J
    delta_e = orbital_energy_change(r1, r2, constants.M_EARTH, constants.GM_SUN)
    assert pytest.approx(delta_e, rel=sec2["delta_energy_j"]["rel_tol"]) == sec2["delta_energy_j"]["value"]

    # 2. Average power over 10,000 years ~ 5e21 W (5.29e21 W exact)
    duration_s = sec2["duration_years"] * constants.YEAR
    avg_power = average_power_required(delta_e, duration_s)
    assert pytest.approx(avg_power, rel=sec2["avg_power_10kyr_w"]["rel_tol"]) == sec2["avg_power_10kyr_w"]["value"]

    # 3. Sunlight radiation pressure force on Earth's cross-section ~ 6e8 N
    rad_force = solar_radiation_pressure_force(
        constants.SOLAR_CONSTANT_1AU, constants.R_EARTH, constants.C_LIGHT
    )
    assert pytest.approx(rad_force, rel=sec2["sunlight_pressure_force_n"]["rel_tol"]) == sec2["sunlight_pressure_force_n"]["value"]

    # 4. Insolation ratio between 1 AU and 2.7 AU ~ 7 (2.7^2 = 7.29)
    insol_ratio = insolation_ratio(r1, r2)
    assert pytest.approx(insol_ratio, rel=sec2["insolation_ratio_1_to_2_7"]["rel_tol"]) == sec2["insolation_ratio_1_to_2_7"]["value"]


def test_b8_tangential_push_sun_only_circular_closed_form():
    """Verify B8 1-yr 1e-8 m/s^2 tangential push on circular Sun-only orbit matches closed form 2*a_push/n*t."""
    import math
    import rebound

    mu_sun = constants.GM_SUN
    m_sun = mu_sun / constants.G
    a0 = constants.AU
    a_push = 1.0e-8
    t_julian = constants.YEAR
    n0 = math.sqrt(mu_sun / (a0**3))
    expected_delta_a_km = (2.0 * a_push / n0 * t_julian) / 1000.0  # 3170.0511 km

    sim = rebound.Simulation()
    sim.integrator = "ias15"
    sim.G = constants.G
    sim.force_is_velocity_dependent = 1
    sim.add(m=m_sun, x=0.0, y=0.0, z=0.0, vx=0.0, vy=0.0, vz=0.0)
    v0 = math.sqrt(mu_sun / a0)
    sim.add(m=0.0, x=a0, y=0.0, z=0.0, vx=0.0, vy=v0, vz=0.0)

    def _af(sim_ptr):
        s = sim_ptr.contents
        ps, pe = s.particles[0], s.particles[1]
        dvx, dvy = pe.vx - ps.vx, pe.vy - ps.vy
        v_mag = math.sqrt(dvx * dvx + dvy * dvy)
        pe.ax += a_push * (dvx / v_mag)
        pe.ay += a_push * (dvy / v_mag)

    sim.additional_forces = _af
    sim.integrate(t_julian)

    ps, pe = sim.particles[0], sim.particles[1]
    dx, dy = pe.x - ps.x, pe.y - ps.y
    dvx, dvy = pe.vx - ps.vx, pe.vy - ps.vy
    r = math.sqrt(dx * dx + dy * dy)
    v = math.sqrt(dvx * dvx + dvy * dvy)
    eps = 0.5 * v * v - mu_sun / r
    a_final = -mu_sun / (2.0 * eps)
    sim_delta_a_km = (a_final - a0) / 1000.0

    # Agreement within 0.01% (actual agreement is ~0.0016% / 16 ppm)
    rel_diff = abs(sim_delta_a_km - expected_delta_a_km) / expected_delta_a_km
    assert rel_diff < 1.0e-4
    assert pytest.approx(sim_delta_a_km, rel=1.0e-4) == expected_delta_a_km

