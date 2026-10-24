"""Swappable propulsion interface, relativistic rocket physics, and Ceres Gravity Tug driver (all SI units).

Governing Physics:
  - Lorentz gamma: gamma = 1 / sqrt(1 - (v_e / c)^2)
  - Relativistic thrust: F = mdot * gamma * v_e
  - Relativistic jet power: P_jet = (gamma - 1) * mdot * c^2
  - Standoff distance: d = sqrt(G * M_tug / a_earth)
  - Two-cone plume canting: F_forward = F_total * cos(theta_cone)
  - Beam photon force: F_photon = P_beam / c (radial outward)
  - Yaw trim: tan(psi_r) = F_photon / F_forward
"""

from typing import Any, Callable
import numpy as np

from octo.core import constants
from octo.core.exchange import Exchange
from octo.core.ledger import Ledger
from octo.core.state import State


PropulsionReturn = tuple[np.ndarray, float, float, float]
PropulsionCallable = Callable[[float, np.ndarray, np.ndarray, float], PropulsionReturn]


def lorentz_gamma(v_m_s: float, c_light: float = constants.C_LIGHT) -> float:
    """Compute relativistic Lorentz factor gamma = 1 / sqrt(1 - (v/c)^2)."""
    beta = float(v_m_s) / float(c_light)
    if beta >= 1.0 or beta < 0.0:
        raise ValueError(f"Velocity must be subluminal (0 <= v < c), got v={v_m_s}")
    return float(1.0 / np.sqrt(1.0 - beta**2))


def relativistic_rocket_thrust(
    mdot_kg_s: float, v_exhaust_m_s: float, c_light: float = constants.C_LIGHT
) -> float:
    """Compute relativistic rocket thrust F = mdot * gamma * v_e [N]."""
    gamma = lorentz_gamma(v_exhaust_m_s, c_light)
    return float(mdot_kg_s * gamma * v_exhaust_m_s)


def relativistic_jet_power(
    mdot_kg_s: float, v_exhaust_m_s: float, c_light: float = constants.C_LIGHT
) -> float:
    """Compute relativistic kinetic jet power P = (gamma - 1) * mdot * c^2 [W]."""
    gamma = lorentz_gamma(v_exhaust_m_s, c_light)
    return float((gamma - 1.0) * mdot_kg_s * (float(c_light) ** 2))


def standoff_distance_for_acceleration(
    tug_mass_kg: float, target_accel_m_s2: float, g_const: float = constants.G
) -> float:
    """Compute equilibrium gravity-tug standoff distance d = sqrt(G * M_tug / a) [m]."""
    if target_accel_m_s2 <= 0.0:
        raise ValueError("Target acceleration must be positive.")
    return float(np.sqrt(float(g_const) * float(tug_mass_kg) / float(target_accel_m_s2)))


def two_cone_canting_loss(half_angle_rad: float) -> float:
    """Compute geometric forward thrust retention cos(theta_cone) for symmetric plumes."""
    return float(np.cos(half_angle_rad))


def beam_photon_force(beam_power_w: float, c_light: float = constants.C_LIGHT) -> float:
    """Compute photon radiation momentum force F_rad = P_beam / c [N]."""
    return float(beam_power_w / float(c_light))


def yaw_trim_angle(f_photon_n: float, f_thrust_tangential_n: float) -> float:
    """Compute in-ecliptic yaw trim angle psi_r = arctan(F_photon / F_tangential) [rad]."""
    if f_thrust_tangential_n == 0.0:
        return 0.0
    return float(np.arctan(f_photon_n / f_thrust_tangential_n))


def zero_thrust_propulsion(
    time_s: float,
    position_m: np.ndarray,
    velocity_m_s: np.ndarray,
    mass_kg: float,
) -> PropulsionReturn:
    """Stub propulsion function returning zero thrust in SI units."""
    _ = (time_s, position_m, velocity_m_s, mass_kg)
    return np.zeros(2, dtype=float), 0.0, 0.0, 0.0


class PropulsionModel:
    """Callable propulsion class wrapping the swappable propulsion interface."""

    def __init__(
        self,
        exhaust_velocity_m_s: float = 0.0,
        mass_flow_kg_s: float = 0.0,
        efficiency: float = 1.0,
    ) -> None:
        self.exhaust_velocity_m_s = float(exhaust_velocity_m_s)
        self.mass_flow_kg_s = float(mass_flow_kg_s)
        self.efficiency = float(efficiency)

    def __call__(
        self,
        time_s: float,
        position_m: np.ndarray,
        velocity_m_s: np.ndarray,
        mass_kg: float,
    ) -> PropulsionReturn:
        _ = (time_s, position_m, mass_kg)
        if self.mass_flow_kg_s <= 0.0 or self.exhaust_velocity_m_s <= 0.0:
            return np.zeros(2, dtype=float), 0.0, 0.0, 0.0

        v_vec = np.asarray(velocity_m_s, dtype=float)
        v_norm = float(np.linalg.norm(v_vec))
        if v_norm == 0.0:
            direction = np.array([0.0, 1.0], dtype=float)
        else:
            direction = v_vec / v_norm

        thrust_mag = self.mass_flow_kg_s * self.exhaust_velocity_m_s
        thrust_vec = thrust_mag * direction
        jet_power_w = 0.5 * self.mass_flow_kg_s * (self.exhaust_velocity_m_s**2)
        total_power_w = (
            jet_power_w / self.efficiency if self.efficiency > 0.0 else jet_power_w
        )
        return (
            thrust_vec,
            float(total_power_w),
            self.mass_flow_kg_s,
            self.exhaust_velocity_m_s,
        )


class CeresTugDriver:
    """Ceres Gravity Tug propulsion and station-keeping driver."""

    def __init__(
        self,
        state: State,
        ledger: Ledger | None = None,
        config: dict[str, Any] | None = None,
    ) -> None:
        self.name = "propulsion"
        self.state = state
        self.ledger = ledger
        self.config = config or {}

        tug_cfg = self.config.get("ceres_tug", {})
        self.v_exhaust_m_s = float(tug_cfg.get("exhaust_velocity_m_s", 0.3 * constants.C_LIGHT))
        self.beam_power_w = float(tug_cfg.get("beam_power_w", 1.0e25))
        deg = float(tug_cfg.get("cone_half_angle_deg", 0.0))
        self.cone_half_angle_rad = float(np.radians(deg))
        self.waste_heat_fraction = float(tug_cfg.get("waste_heat_fraction", 0.0))
        self.d_target = float(tug_cfg.get("standoff_distance_m", 6.84e8))
        self.kp = float(tug_cfg.get("station_keeping_kp", 0.0))
        self.kd = float(tug_cfg.get("station_keeping_kd", 0.0))

        target_cfg = self.config.get("target_orbit", {})
        target_au = float(target_cfg.get("semi_major_axis_au", 0.0))
        self.target_radius_m = target_au * constants.AU

        self.is_cutoff = False
        self.last_thrust_n = 0.0
        self.total_propellant_spent_kg = 0.0

    def compute_station_keeping_thrust(
        self, d_current: float, d_target: float, d_dot: float
    ) -> float:
        """PD feedback controller stabilizing the unstable along-track separation."""
        delta_d = d_current - d_target
        return float(-self.kp * delta_d - self.kd * d_dot)

    def step(self, dt: float) -> None:
        """Compute mutual forces, station-keeping thrust, relativistic propellant use, and book Exchanges."""
        if not self.state.has_body("Earth") or not self.state.has_body("Tug"):
            return

        earth = self.state.get_body("Earth")
        tug = self.state.get_body("Tug")

        r_earth = earth.position_m
        r_tug = tug.position_m
        v_earth = earth.velocity_m_s
        v_tug = tug.velocity_m_s

        r_earth_mag = float(np.linalg.norm(r_earth))

        # Target orbit cutoff check
        if self.target_radius_m > 0.0 and r_earth_mag >= self.target_radius_m:
            self.is_cutoff = True
            self.last_thrust_n = 0.0
            return

        # Standoff vector from Earth to Tug
        d_vec = r_tug - r_earth
        d_mag = float(np.linalg.norm(d_vec))
        if d_mag == 0.0:
            return
        d_hat = d_vec / d_mag

        # Relative velocity along line of separation
        v_rel = v_tug - v_earth
        d_dot = float(np.dot(d_vec, v_rel) / d_mag)

        # 1. Mutual gravitational pull between Earth and Tug
        f_grav_mag = float(constants.G * earth.mass_kg * tug.mass_kg / (d_mag**2))
        f_grav_on_earth = f_grav_mag * d_hat
        f_grav_on_tug = -f_grav_on_earth

        # Orbital acceleration of Earth
        a_earth = f_grav_mag / earth.mass_kg

        # 2. Required forward thrust on the tug (pull + accelerate with Earth)
        f_nominal = f_grav_mag + tug.mass_kg * a_earth

        # 3. Station-keeping PD controller correction
        delta_f = self.compute_station_keeping_thrust(d_mag, self.d_target, d_dot)
        f_forward = max(0.0, f_nominal + delta_f)

        # 4. Plume canting compensation (two-cone split)
        cant_factor = two_cone_canting_loss(self.cone_half_angle_rad)
        f_engine = f_forward / cant_factor if cant_factor > 0.0 else f_forward

        # 5. Relativistic rocket propellant consumption & jet power
        gamma = lorentz_gamma(self.v_exhaust_m_s, constants.C_LIGHT)
        mdot = f_engine / (gamma * self.v_exhaust_m_s)
        p_jet = relativistic_jet_power(mdot, self.v_exhaust_m_s, constants.C_LIGHT)
        p_waste = p_jet * self.waste_heat_fraction

        # 6. Beam photon push and yaw trim
        f_photon_mag = beam_photon_force(self.beam_power_w, constants.C_LIGHT)

        # Forward unit direction along tug orbit track (tangential in ecliptic plane)
        r_tug_mag = float(np.linalg.norm(r_tug))
        r_tug_hat = r_tug / r_tug_mag if r_tug_mag > 0.0 else np.array([1.0, 0.0, 0.0])
        t_hat = np.array([-r_tug_hat[1], r_tug_hat[0], 0.0], dtype=np.float64)

        # Thrust vector with yaw trim compensating radial photon push
        f_thrust_vec = f_forward * t_hat - f_photon_mag * r_tug_hat
        f_photon_vec = f_photon_mag * r_tug_hat

        self.last_thrust_n = float(np.linalg.norm(f_thrust_vec))

        # Mass depletion over dt
        dm = mdot * dt
        tug.mass_kg = max(0.0, tug.mass_kg - dm)
        self.total_propellant_spent_kg += dm

        # Relative exhaust velocity vector (opposite to thrust direction)
        v_ex_rel_vec = -self.v_exhaust_m_s * t_hat

        # Sun gravity forces
        f_sun_on_earth = -constants.GM_SUN * earth.mass_kg * r_earth / (r_earth_mag**3)
        f_sun_on_tug = -constants.GM_SUN * tug.mass_kg * r_tug / (r_tug_mag**3)

        # 7. Book all Exchanges with explicit counterparties if ledger present
        if self.ledger is not None:
            # Flow 1: Gravity pair between Tug and Earth
            self.ledger.book(
                Exchange(
                    t=self.state.t,
                    a="Earth",
                    b="Tug",
                    force_on_b=f_grav_on_tug,
                    point=tug.position_m,
                    owner="propulsion",
                ),
                dt=dt,
            )

            # Flow 2: Relativistic rocket exhaust (mass, momentum, kinetic energy, waste heat)
            self.ledger.book(
                Exchange(
                    t=self.state.t,
                    a="ExhaustSink",
                    b="Tug",
                    force_on_b=f_thrust_vec,
                    point=tug.position_m,
                    mass_out=mdot,
                    exhaust_v=v_ex_rel_vec,
                    power_in=p_jet,
                    heat_out=p_waste,
                    owner="propulsion",
                ),
                dt=dt,
            )

            # Flow 3: Beam photon push from PowerPlant to Tug
            self.ledger.book(
                Exchange(
                    t=self.state.t,
                    a="PowerPlant",
                    b="Tug",
                    force_on_b=f_photon_vec,
                    point=tug.position_m,
                    power_in=self.beam_power_w,
                    owner="propulsion",
                ),
                dt=dt,
            )

            # Flow 4: Sun's gravity on Earth and Tug
            self.ledger.book(
                Exchange(
                    t=self.state.t,
                    a="Sun",
                    b="Tug",
                    force_on_b=f_sun_on_tug,
                    point=tug.position_m,
                    owner="propulsion",
                ),
                dt=dt,
            )
            self.ledger.book(
                Exchange(
                    t=self.state.t,
                    a="Sun",
                    b="Earth",
                    force_on_b=f_sun_on_earth,
                    point=earth.position_m,
                    owner="propulsion",
                ),
                dt=dt,
            )

        # Advance simulation time
        self.state.t += dt

    def get_orbital_elements(self, body_name: str = "Earth") -> tuple[float, float]:
        """Compute semi-major axis a [m] and eccentricity e for body_name."""
        body = self.state.get_body(body_name)
        r_vec = body.position_m
        v_vec = body.velocity_m_s
        r_mag = float(np.linalg.norm(r_vec))
        v_sq = float(np.dot(v_vec, v_vec))
        eps = 0.5 * v_sq - constants.GM_SUN / r_mag
        a = -constants.GM_SUN / (2.0 * eps) if eps < 0.0 else float("inf")
        e_vec = (
            (v_sq - constants.GM_SUN / r_mag) * r_vec
            - float(np.dot(r_vec, v_vec)) * v_vec
        ) / constants.GM_SUN
        e = float(np.linalg.norm(e_vec))
        return a, e
