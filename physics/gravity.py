"""Newtonian inverse-square gravitational acceleration and force (all SI units)."""

import numpy as np
from physics import constants


def gravitational_acceleration(
    position_m: np.ndarray, mu_m3_s2: float = constants.MU_SUN
) -> np.ndarray:
    """Compute gravitational acceleration vector a = -mu * r / |r|^3 [m/s^2]."""
    r_vec = np.asarray(position_m, dtype=float)
    r_mag = float(np.linalg.norm(r_vec))
    if r_mag == 0.0:
        raise ValueError("Position vector magnitude cannot be zero.")
    return -mu_m3_s2 * r_vec / (r_mag**3)


def gravitational_force(
    position_m: np.ndarray, mass_kg: float, mu_m3_s2: float = constants.MU_SUN
) -> np.ndarray:
    """Compute gravitational force vector F = m * a_grav [N]."""
    return float(mass_kg) * gravitational_acceleration(position_m, mu_m3_s2)
