"""Classical two-body orbital elements and analytic transfer formulas (all SI units)."""

import numpy as np
from physics import constants


def circular_velocity(radius_m: float, mu_m3_s2: float = constants.MU_SUN) -> float:
    """Compute circular orbital speed v_c = sqrt(mu / r) [m/s]."""
    if radius_m <= 0.0:
        raise ValueError("Orbital radius must be positive.")
    return float(np.sqrt(mu_m3_s2 / radius_m))


def orbital_period(semi_major_axis_m: float, mu_m3_s2: float = constants.MU_SUN) -> float:
    """Compute Keplerian orbital period T = 2 * pi * sqrt(a^3 / mu) [s]."""
    if semi_major_axis_m <= 0.0:
        raise ValueError("Semi-major axis must be positive for a bound orbit.")
    return float(2.0 * np.pi * np.sqrt((semi_major_axis_m**3) / mu_m3_s2))


def specific_orbital_energy(
    position_m: np.ndarray, velocity_m_s: np.ndarray, mu_m3_s2: float = constants.MU_SUN
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
    position_m: np.ndarray, velocity_m_s: np.ndarray, mu_m3_s2: float = constants.MU_SUN
) -> float:
    """Compute semi-major axis a = -mu / (2 * epsilon) [m]."""
    eps = specific_orbital_energy(position_m, velocity_m_s, mu_m3_s2)
    if eps >= 0.0:
        return float("inf")
    return float(-mu_m3_s2 / (2.0 * eps))


def eccentricity_vector(
    position_m: np.ndarray, velocity_m_s: np.ndarray, mu_m3_s2: float = constants.MU_SUN
) -> np.ndarray:
    """Compute 2D Laplace-Runge-Lenz eccentricity vector e_vec = ((v^2 - mu/r)*r - (r.v)*v)/mu."""
    r_vec = np.asarray(position_m, dtype=float)
    v_vec = np.asarray(velocity_m_s, dtype=float)
    r_mag = float(np.linalg.norm(r_vec))
    v_sq = float(np.dot(v_vec, v_vec))
    r_dot_v = float(np.dot(r_vec, v_vec))
    return ((v_sq - mu_m3_s2 / r_mag) * r_vec - r_dot_v * v_vec) / mu_m3_s2


def eccentricity(
    position_m: np.ndarray, velocity_m_s: np.ndarray, mu_m3_s2: float = constants.MU_SUN
) -> float:
    """Compute scalar orbital eccentricity e = |e_vec| [dimensionless]."""
    return float(np.linalg.norm(eccentricity_vector(position_m, velocity_m_s, mu_m3_s2)))


def hohmann_transfer(
    r1_m: float, r2_m: float, mu_m3_s2: float = constants.MU_SUN
) -> dict[str, float]:
    """Compute analytic Hohmann transfer parameters between circular orbits r1 and r2 [SI units]."""
    a_transfer = 0.5 * (r1_m + r2_m)
    v1_circ = circular_velocity(r1_m, mu_m3_s2)
    v2_circ = circular_velocity(r2_m, mu_m3_s2)

    v_trans_peri = float(np.sqrt(mu_m3_s2 * (2.0 / r1_m - 1.0 / a_transfer)))
    v_trans_apo = float(np.sqrt(mu_m3_s2 * (2.0 / r2_m - 1.0 / a_transfer)))

    dv1 = abs(v_trans_peri - v1_circ)
    dv2 = abs(v2_circ - v_trans_apo)
    total_dv = dv1 + dv2
    transfer_time = 0.5 * orbital_period(a_transfer, mu_m3_s2)

    return {
        "r1_m": float(r1_m),
        "r2_m": float(r2_m),
        "semi_major_axis_m": float(a_transfer),
        "dv1_m_s": float(dv1),
        "dv2_m_s": float(dv2),
        "total_dv_m_s": float(total_dv),
        "transfer_time_s": float(transfer_time),
    }
