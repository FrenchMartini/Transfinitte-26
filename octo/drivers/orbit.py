"""Orbital mechanics, closed-form transfers, Section 2 energetics, and two-body integrator (SI units)."""

from typing import Any
import numpy as np
from scipy.integrate import solve_ivp

from octo.core import constants
from octo.drivers.propulsion import PropulsionCallable, zero_thrust_propulsion


def gravitational_acceleration(
    position_m: np.ndarray, mu_m3_s2: float = constants.GM_SUN
) -> np.ndarray:
    """Compute gravitational acceleration vector a = -mu * r / |r|^3 [m/s^2]."""
    r_vec = np.asarray(position_m, dtype=float)
    r_mag = float(np.linalg.norm(r_vec))
    if r_mag == 0.0:
        raise ValueError("Position vector magnitude cannot be zero.")
    return -mu_m3_s2 * r_vec / (r_mag**3)


def gravitational_force(
    position_m: np.ndarray, mass_kg: float, mu_m3_s2: float = constants.GM_SUN
) -> np.ndarray:
    """Compute gravitational force vector F = m * a_grav [N]."""
    return float(mass_kg) * gravitational_acceleration(position_m, mu_m3_s2)


def circular_velocity(radius_m: float, mu_m3_s2: float = constants.GM_SUN) -> float:
    """Compute circular orbital speed v_c = sqrt(mu / r) [m/s]."""
    if radius_m <= 0.0:
        raise ValueError("Orbital radius must be positive.")
    return float(np.sqrt(mu_m3_s2 / radius_m))


def orbital_period(
    semi_major_axis_m: float, mu_m3_s2: float = constants.GM_SUN
) -> float:
    """Compute Keplerian orbital period T = 2 * pi * sqrt(a^3 / mu) [s]."""
    if semi_major_axis_m <= 0.0:
        raise ValueError("Semi-major axis must be positive for a bound orbit.")
    return float(2.0 * np.pi * np.sqrt((semi_major_axis_m**3) / mu_m3_s2))


def specific_orbital_energy(
    position_m: np.ndarray,
    velocity_m_s: np.ndarray,
    mu_m3_s2: float = constants.GM_SUN,
) -> float:
    """Compute specific mechanical energy epsilon = |v|^2 / 2 - mu / |r| [J/kg]."""
    r_vec = np.asarray(position_m, dtype=float)
    v_vec = np.asarray(velocity_m_s, dtype=float)
    r_mag = float(np.linalg.norm(r_vec))
    v_sq = float(np.dot(v_vec, v_vec))
    return 0.5 * v_sq - mu_m3_s2 / r_mag


def specific_angular_momentum(
    position_m: np.ndarray, velocity_m_s: np.ndarray
) -> float:
    """Compute 2D scalar out-of-plane specific angular momentum h_z = x*v_y - y*v_x [m^2/s]."""
    r_vec = np.asarray(position_m, dtype=float)
    v_vec = np.asarray(velocity_m_s, dtype=float)
    return float(r_vec[0] * v_vec[1] - r_vec[1] * v_vec[0])


def semi_major_axis(
    position_m: np.ndarray,
    velocity_m_s: np.ndarray,
    mu_m3_s2: float = constants.GM_SUN,
) -> float:
    """Compute semi-major axis a = -mu / (2 * epsilon) [m]."""
    eps = specific_orbital_energy(position_m, velocity_m_s, mu_m3_s2)
    if eps >= 0.0:
        return float("inf")
    return float(-mu_m3_s2 / (2.0 * eps))


def eccentricity_vector(
    position_m: np.ndarray,
    velocity_m_s: np.ndarray,
    mu_m3_s2: float = constants.GM_SUN,
) -> np.ndarray:
    """Compute 2D Laplace-Runge-Lenz eccentricity vector e_vec = ((v^2 - mu/r)*r - (r.v)*v)/mu."""
    r_vec = np.asarray(position_m, dtype=float)
    v_vec = np.asarray(velocity_m_s, dtype=float)
    r_mag = float(np.linalg.norm(r_vec))
    v_sq = float(np.dot(v_vec, v_vec))
    r_dot_v = float(np.dot(r_vec, v_vec))
    return ((v_sq - mu_m3_s2 / r_mag) * r_vec - r_dot_v * v_vec) / mu_m3_s2


def eccentricity(
    position_m: np.ndarray,
    velocity_m_s: np.ndarray,
    mu_m3_s2: float = constants.GM_SUN,
) -> float:
    """Compute scalar orbital eccentricity e = |e_vec| [dimensionless]."""
    return float(np.linalg.norm(eccentricity_vector(position_m, velocity_m_s, mu_m3_s2)))


def hohmann_transfer(
    r1_m: float, r2_m: float, mu_m3_s2: float = constants.GM_SUN
) -> dict[str, float]:
    """Compute analytic Hohmann transfer and slow-spiral delta-v between r1 and r2 [SI units]."""
    a_transfer = 0.5 * (r1_m + r2_m)
    v1_circ = circular_velocity(r1_m, mu_m3_s2)
    v2_circ = circular_velocity(r2_m, mu_m3_s2)

    v_trans_peri = float(np.sqrt(mu_m3_s2 * (2.0 / r1_m - 1.0 / a_transfer)))
    v_trans_apo = float(np.sqrt(mu_m3_s2 * (2.0 / r2_m - 1.0 / a_transfer)))

    dv1 = abs(v_trans_peri - v1_circ)
    dv2 = abs(v2_circ - v_trans_apo)
    total_dv = dv1 + dv2
    transfer_time = 0.5 * orbital_period(a_transfer, mu_m3_s2)
    slow_spiral_dv = abs(v1_circ - v2_circ)

    return {
        "r1_m": float(r1_m),
        "r2_m": float(r2_m),
        "semi_major_axis_m": float(a_transfer),
        "dv1_m_s": float(dv1),
        "dv2_m_s": float(dv2),
        "total_dv_m_s": float(total_dv),
        "transfer_time_s": float(transfer_time),
        "slow_spiral_dv_m_s": float(slow_spiral_dv),
    }


def orbital_energy(
    semi_major_axis_m: float,
    mass_kg: float = constants.M_EARTH,
    mu_m3_s2: float = constants.GM_SUN,
) -> float:
    """Compute total two-body orbital energy E = -mu * m / (2 * a) [J]."""
    return float(-mu_m3_s2 * mass_kg / (2.0 * semi_major_axis_m))


def orbital_energy_change(
    r1_m: float,
    r2_m: float,
    mass_kg: float = constants.M_EARTH,
    mu_m3_s2: float = constants.GM_SUN,
) -> float:
    """Compute required orbital energy change delta E = E(r2) - E(r1) [J]."""
    return orbital_energy(r2_m, mass_kg, mu_m3_s2) - orbital_energy(
        r1_m, mass_kg, mu_m3_s2
    )


def average_power_required(delta_energy_j: float, duration_s: float) -> float:
    """Compute average mechanical power P_avg = delta E / duration [W]."""
    if duration_s <= 0.0:
        raise ValueError("Duration must be positive.")
    return float(delta_energy_j / duration_s)


def solar_radiation_pressure_force(
    irradiance_w_m2: float = constants.SOLAR_CONSTANT_1AU,
    body_radius_m: float = constants.R_EARTH,
    c_light_m_s: float = constants.C_LIGHT,
    reflectivity_factor: float = 1.0,
) -> float:
    """Compute sunlight radiation pressure force on a planet's cross-section [N].

    F_rad = (S / c) * (pi * R^2) * reflectivity_factor.
    Default reflectivity_factor = 1.0 corresponds to direct intercepted solar
    momentum flux P_sun / c (~5.79e8 N for Earth at 1 AU).
    """
    cross_section_m2 = np.pi * (body_radius_m**2)
    return float((irradiance_w_m2 / c_light_m_s) * cross_section_m2 * reflectivity_factor)


def insolation_ratio(r1_m: float, r2_m: float) -> float:
    """Compute ratio of solar insolation S(r1) / S(r2) = (r2 / r1)^2 [dimensionless]."""
    if r1_m <= 0.0 or r2_m <= 0.0:
        raise ValueError("Radii must be positive.")
    return float((r2_m / r1_m) ** 2)


def propagate_orbit(
    t_span: tuple[float, float],
    r0: np.ndarray,
    v0: np.ndarray,
    rtol: float,
    atol: float,
    m0: float = constants.M_EARTH,
    propulsion_fn: PropulsionCallable = zero_thrust_propulsion,
    mu: float = constants.GM_SUN,
    num_points: int | None = None,
    t_eval: np.ndarray | None = None,
) -> dict[str, Any]:
    """Integrate the 2D Sun-Earth equations of motion with DOP853."""
    r0_arr = np.asarray(r0, dtype=float)
    v0_arr = np.asarray(v0, dtype=float)
    y0 = np.array(
        [r0_arr[0], r0_arr[1], v0_arr[0], v0_arr[1], float(m0)], dtype=float
    )

    if t_eval is None and num_points is not None:
        t_eval = np.linspace(t_span[0], t_span[1], num_points)

    def rhs(t: float, y: np.ndarray) -> np.ndarray:
        r_vec = y[0:2]
        v_vec = y[2:4]
        mass = y[4]
        a_grav = gravitational_acceleration(r_vec, mu)
        thrust_vec, _power_w, mdot_kg_s, _ve_m_s = propulsion_fn(t, r_vec, v_vec, mass)
        a_thrust = np.asarray(thrust_vec, dtype=float) / mass
        a_total = a_grav + a_thrust
        return np.array(
            [v_vec[0], v_vec[1], a_total[0], a_total[1], -float(mdot_kg_s)],
            dtype=float,
        )

    sol = solve_ivp(
        fun=rhs,
        t_span=t_span,
        y0=y0,
        method="DOP853",
        rtol=rtol,
        atol=atol,
        t_eval=t_eval,
    )

    times = sol.t
    positions = sol.y[0:2, :].T
    velocities = sol.y[2:4, :].T
    masses = sol.y[4, :]

    n_steps = len(times)
    thrusts = np.zeros((n_steps, 2), dtype=float)
    powers = np.zeros(n_steps, dtype=float)
    mass_flows = np.zeros(n_steps, dtype=float)
    exhaust_velocities = np.zeros(n_steps, dtype=float)
    non_grav_accels = np.zeros((n_steps, 2), dtype=float)

    for i in range(n_steps):
        t_i = float(times[i])
        r_i = positions[i]
        v_i = velocities[i]
        m_i = float(masses[i])
        f_vec, p_w, mdot, ve = propulsion_fn(t_i, r_i, v_i, m_i)
        thrusts[i] = f_vec
        powers[i] = p_w
        mass_flows[i] = mdot
        exhaust_velocities[i] = ve
        non_grav_accels[i] = f_vec / m_i

    return {
        "success": bool(sol.success),
        "message": str(sol.message),
        "time": times,
        "position": positions,
        "velocity": velocities,
        "mass": masses,
        "thrust": thrusts,
        "power": powers,
        "mass_flow": mass_flows,
        "exhaust_velocity": exhaust_velocities,
        "thrust_acceleration": non_grav_accels,
    }
