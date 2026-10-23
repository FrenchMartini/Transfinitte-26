"""2D Sun-Earth orbital integrator using SciPy DOP853 (all SI units)."""

from typing import Any
import numpy as np
from scipy.integrate import solve_ivp

from physics import constants
from physics.gravity import gravitational_acceleration
from physics.propulsion import PropulsionCallable, zero_thrust_propulsion


def propagate_orbit(
    t_span: tuple[float, float],
    r0: np.ndarray,
    v0: np.ndarray,
    m0: float = constants.M_EARTH,
    propulsion_fn: PropulsionCallable = zero_thrust_propulsion,
    mu: float = constants.MU_SUN,
    rtol: float = 1e-12,
    atol: float = 1e-9,
    num_points: int | None = None,
    t_eval: np.ndarray | None = None,
) -> dict[str, Any]:
    """Integrate the 2D Sun-Earth equations of motion with DOP853.

    State vector y = [x, y, vx, vy, m].
    Equations of motion:
      dr/dt = v
      dv/dt = a_grav(r) + thrust(t, r, v, m) / m
      dm/dt = -mass_flow(t, r, v, m)
    """
    r0_arr = np.asarray(r0, dtype=float)
    v0_arr = np.asarray(v0, dtype=float)
    y0 = np.array([r0_arr[0], r0_arr[1], v0_arr[0], v0_arr[1], float(m0)], dtype=float)

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
