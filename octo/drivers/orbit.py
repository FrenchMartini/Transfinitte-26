"""Orbital mechanics, closed-form transfers, Section 2 energetics, and two-body integrator (SI units)."""

from typing import Any
import time
import numpy as np
import rebound
from scipy.integrate import solve_ivp

from octo.core import constants
from octo.core.ledger import Ledger
from octo.core.state import BodyState, State
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


NON_SIMULATED_ACTORS: set[str] = {
    "ExhaustSink",
    "PowerPlant",
    "Exhaust",
    "Radiation",
    "Space",
}


class OrbitDriver:
    """N-body orbit propagator using REBOUND IAS15 and Ledger interaction."""

    def __init__(
        self,
        state: State,
        ledger: Ledger | None = None,
        config: dict[str, Any] | None = None,
        rtol: float | None = None,
        atol: float | None = None,
    ) -> None:
        self.state = state
        self.ledger = ledger
        self.config = config or {}

        self.sim = rebound.Simulation()
        self.sim.integrator = "ias15"
        self.sim.G = constants.G

        cfg_integrator = self.config.get("integrator", {})
        eff_rtol = rtol if rtol is not None else cfg_integrator.get("rtol")
        if eff_rtol is not None:
            self.sim.integrator.epsilon = float(eff_rtol)

        self._name_to_index: dict[str, int] = {}

        p_idx = 0
        is_averaged_mode = self.config.get("mode") == "averaged"

        for body in state.bodies():
            body_name = str(body.name)
            if body_name in NON_SIMULATED_ACTORS or body.mass_kg <= 0.0:
                continue
            if is_averaged_mode and body_name not in {"Sun", "Earth"}:
                continue
            self.sim.add(
                m=float(body.mass_kg),
                x=float(body.position_m[0]),
                y=float(body.position_m[1]),
                z=float(body.position_m[2]),
                vx=float(body.velocity_m_s[0]),
                vy=float(body.velocity_m_s[1]),
                vz=float(body.velocity_m_s[2]),
                name=body_name,
            )
            self._name_to_index[body_name] = p_idx
            p_idx += 1

        self.sim.t = float(state.t)

        if self.ledger is not None:
            self._setup_additional_forces()

    def _setup_additional_forces(self) -> None:
        is_averaged_mode = self.config.get("mode") == "averaged"

        def af_callback(sim_pointer: Any) -> None:
            if self.ledger is None:
                return
            s = sim_pointer.contents
            for i in range(s.N):
                p = s.particles[i]
                p_name = p.name
                if isinstance(p_name, bytes):
                    p_name = p_name.decode("utf-8")
                if p_name and p.m > 0.0:
                    try:
                        if is_averaged_mode:
                            f_net = self.ledger.net_force_on(p_name, exclude_sources={"Sun"})
                        else:
                            f_net = self.ledger.net_force_on(p_name)
                    except Exception:
                        continue
                    p.ax += float(f_net[0]) / p.m
                    p.ay += float(f_net[1]) / p.m
                    p.az += float(f_net[2]) / p.m

        self.sim.additional_forces = af_callback
        self.sim.force_is_velocity_dependent = 0

    def sync_from_state(self, state: State) -> None:
        """Sync positions, velocities, and masses from State into REBOUND particles."""
        self.state = state
        self.sim.t = float(state.t)
        for body in state.bodies():
            name_str = str(body.name)
            if name_str in self._name_to_index:
                idx = self._name_to_index[name_str]
                p = self.sim.particles[idx]
                p.m = float(body.mass_kg)
                p.x = float(body.position_m[0])
                p.y = float(body.position_m[1])
                p.z = float(body.position_m[2])
                p.vx = float(body.velocity_m_s[0])
                p.vy = float(body.velocity_m_s[1])
                p.vz = float(body.velocity_m_s[2])

    def sync_to_state(self, state: State) -> State:
        """Sync positions, velocities, and masses from REBOUND particles into State."""
        state.t = float(self.sim.t)
        for body in state.bodies():
            name_str = str(body.name)
            if name_str in self._name_to_index:
                idx = self._name_to_index[name_str]
                p = self.sim.particles[idx]
                body.mass_kg = float(p.m)
                body.position_m[0] = float(p.x)
                body.position_m[1] = float(p.y)
                body.position_m[2] = float(p.z)
                body.velocity_m_s[0] = float(p.vx)
                body.velocity_m_s[1] = float(p.vy)
                body.velocity_m_s[2] = float(p.vz)
        return state

    def step(self, dt: float) -> State:
        """Integrate simulation forward by dt seconds and update State."""
        target_t = float(self.sim.t + dt)
        self.sim.integrate(target_t)
        return self.sync_to_state(self.state)


def measure_rebound_performance(
    sim_years: float = 1.0,
    with_callback: bool = True,
    config: dict[str, Any] | None = None,
    extrapolate_years: float | None = None,
) -> dict[str, float]:
    """Measure REBOUND IAS15 execution speed and extrapolate to target time span."""
    m_sun = constants.GM_SUN / constants.G
    m_earth = constants.M_EARTH
    mu_tot = constants.G * (m_sun + m_earth)
    r_earth = constants.AU
    v_earth = float(np.sqrt(mu_tot / r_earth))

    sim = rebound.Simulation()
    sim.integrator = "ias15"
    sim.G = constants.G

    if config and "integrator" in config and "rtol" in config["integrator"]:
        sim.integrator.epsilon = float(config["integrator"]["rtol"])

    sim.add(m=m_sun, name="Sun")
    sim.add(m=m_earth, x=r_earth, vy=v_earth, name="Earth")
    sim.move_to_com()

    if with_callback:
        def af(sim_p: Any) -> None:
            s = sim_p.contents
            p = s.particles[1]
            p.ax += 1.0e-11

        sim.additional_forces = af
        sim.force_is_velocity_dependent = 0

    t_duration_s = float(sim_years * constants.YEAR)
    t0 = time.perf_counter()
    sim.integrate(t_duration_s)
    t1 = time.perf_counter()

    wall_time_s = t1 - t0
    target_years = (
        float(extrapolate_years)
        if extrapolate_years is not None
        else float(config.get("time_span_years", sim_years))
        if config is not None
        else float(sim_years)
    )
    extrapolated_s = (wall_time_s / sim_years) * target_years

    return {
        "sim_years": float(sim_years),
        "wall_time_1yr_s": float(wall_time_s),
        "extrapolated_10kyr_s": float(extrapolated_s),
    }
