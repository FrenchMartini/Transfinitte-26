"""Physical habitability, insolation, lunar Hill-sphere retention, and waste-heat monitors.

Habitability and safety contracts:
- Dynamic threshold lookups: Retrieves all limits from rulebook_thresholds.yaml via load_thresholds().
- Planetary insolation: Models solar flux falloff and off-axis L1 solar concentrator compensation.
- Planetary equilibrium: Computes radiative equilibrium temperature based on insolation and Bond albedo.
- Moon retention: Verifies Earth-Moon distance against the critical Hill-sphere retention threshold.
- Exhaust and thermal safety: Asserts out-of-ecliptic plume clearance and surface waste heat flux limits.
"""

import copy
import math
from typing import Any
import numpy as np

from octo.core import constants
from octo.core.flags import Flag
from octo.core.ledger import Ledger
from octo.core.state import State
from octo.core.thresholds import get_threshold_value, load_thresholds


def compute_mirror_reflected_flux(
    orbit_radius_m: float,
    mirror_config: dict[str, Any] | None = None,
) -> float:
    """Compute additional reflected solar flux on Earth from the climate mirror [W/m^2].

    Geometry:
    - Position: Earth-Sun L1 point (sub-solar point towards Sun, r_mirror = r - d_L1).
    - Solar flux at mirror: S_mirror = S_0 * (AU / r_mirror)^2.
    - Intercepted and reflected power: P_refl = S_mirror * area_m2 * reflectivity * cos(orientation_deg).
    - Distributed over Earth cross-sectional disk: S_added = P_refl / (pi * R_earth^2).
    """
    if not mirror_config or not mirror_config.get("active", True):
        return 0.0

    area_m2 = float(mirror_config.get("area_m2", 8.44e14))
    reflectivity = float(mirror_config.get("reflectivity", 0.95))
    orient_deg = float(mirror_config.get("orientation_deg", 0.0))
    capture_efficiency = float(mirror_config.get("capture_efficiency", 1.0))
    cos_orient = max(0.0, math.cos(math.radians(orient_deg)))

    r = float(orbit_radius_m)
    if r <= constants.AU:
        return 0.0

    # L1 standoff distance: d_L1 ~ r * (M_earth / (3 * M_sun))^(1/3)
    m_ratio = constants.M_EARTH / (3.0 * (constants.GM_SUN / constants.G))
    d_l1 = r * (m_ratio ** (1.0 / 3.0))
    r_mirror = max(r / 2.0, r - d_l1)

    s_at_mirror = constants.SOLAR_CONSTANT_1AU * ((constants.AU / r_mirror) ** 2)
    p_reflected = s_at_mirror * area_m2 * reflectivity * cos_orient * capture_efficiency
    earth_disk_area = math.pi * (constants.R_EARTH ** 2)

    # If throttle_by_deficit is requested, mirror articulates/apertures to provide only needed deficit
    if mirror_config.get("throttle_by_deficit", False):
        direct_flux = constants.SOLAR_CONSTANT_1AU * ((constants.AU / r) ** 2)
        deficit_flux = max(0.0, constants.SOLAR_CONSTANT_1AU - direct_flux)
        p_reflected = min(p_reflected, deficit_flux * earth_disk_area)

    return float(p_reflected / earth_disk_area)


def compute_insolation(
    orbit_radius_m: float,
    mirror_active: bool = True,
    mirror_config: dict[str, Any] | None = None,
    mirror_gain: float | None = None,
) -> float:
    """Compute effective solar irradiance at a given heliocentric distance in W/m^2."""
    r = float(orbit_radius_m)
    if r <= 0.0:
        raise ValueError("orbit_radius_m must be strictly positive.")
    s_raw = constants.SOLAR_CONSTANT_1AU * ((constants.AU / r) ** 2)
    if not mirror_active:
        return s_raw

    if mirror_gain is not None:
        return s_raw * float(mirror_gain)

    cfg = mirror_config
    if cfg is None:
        cfg = {
            "active": True,
            "area_m2": 8.44e14,
            "reflectivity": 0.95,
            "orientation_deg": 0.0,
            "capture_efficiency": 1.0,
        }
    elif not cfg.get("active", True):
        return s_raw

    s_added = compute_mirror_reflected_flux(r, cfg)
    return s_raw + s_added


def compute_equilibrium_temperature(
    s: float,
    albedo: float = constants.EARTH_BOND_ALBEDO,
    emissivity: float = 1.0,
) -> float:
    """Compute planetary radiative equilibrium temperature in Kelvin."""
    if s < 0.0:
        raise ValueError("Insolation must be non-negative.")
    denom = 4.0 * constants.SIGMA_SB * float(emissivity)
    num = float(s) * (1.0 - float(albedo))
    return (num / denom) ** 0.25


def compute_hill_radius(
    orbit_radius_m: float,
    m_central_kg: float,
    m_primary_kg: float,
) -> float:
    """Compute Hill sphere radius of secondary body orbiting primary body in meters."""
    r = float(orbit_radius_m)
    m_c = float(m_central_kg)
    m_p = float(m_primary_kg)
    if r <= 0.0 or m_c <= 0.0 or m_p <= 0.0:
        raise ValueError("Masses and orbit radius must be strictly positive.")
    return r * ((m_c / (3.0 * m_p)) ** (1.0 / 3.0))


def compute_plume_clearance_m(standoff_d: float, cone_deg: float) -> float:
    """Compute perpendicular clearance of canted exhaust plume cones at standoff distance."""
    d = float(standoff_d)
    theta_rad = math.radians(float(cone_deg))
    return d * math.sin(theta_rad)


def compute_surface_waste_heat_flux(
    p_waste: float,
    standoff_d: float,
    attenuation: float | None = None,
) -> float:
    """Compute surface waste heat flux on Earth from tug radiator in W/m^2."""
    p = float(p_waste)
    d = float(standoff_d)
    tau = float(attenuation) if attenuation is not None else 0.0
    if d <= 0.0:
        raise ValueError("Standoff distance must be strictly positive.")
    area = 4.0 * math.pi * (d ** 2)
    return (p * tau) / area


class HabitabilityDriver:
    """Driver monitoring planetary habitability, insolation, Moon Hill sphere, and plume safety."""

    def __init__(
        self,
        state: State,
        ledger: Ledger | None = None,
        config: dict[str, Any] | None = None,
        thresholds: dict[str, Any] | None = None,
    ) -> None:
        self.name = "habitability"
        self.state = state
        self.ledger = ledger
        self.config = config or {}
        if thresholds is not None:
            self.thresholds = thresholds
        elif ledger is not None and hasattr(ledger, "_thresholds"):
            self.thresholds = ledger._thresholds
        else:
            self.thresholds = load_thresholds()

        self.mirror_config = copy.deepcopy(self.config.get("climate_mirror", {}))
        if "active" not in self.mirror_config and "l1_mirror_active" in self.config:
            self.mirror_config["active"] = bool(self.config["l1_mirror_active"])
        elif "active" not in self.mirror_config:
            self.mirror_config["active"] = True

        self.flags: list[Flag] = []
        self._prev_earth_velocity: np.ndarray | None = None
        self._prev_earth_acceleration: np.ndarray | None = None

    @property
    def l1_mirror_active(self) -> bool:
        return bool(self.mirror_config.get("active", True))

    @l1_mirror_active.setter
    def l1_mirror_active(self, val: bool) -> None:
        self.mirror_config["active"] = bool(val)

    def evaluate(self, dt: float) -> list[Flag]:
        """Evaluate habitability and physical safety limits on the current state."""
        flags: list[Flag] = []
        t = float(self.state.t)

        if not self.state.has_body("Earth"):
            return flags

        earth = self.state.get_body("Earth")
        r_earth_vec = earth.position_m
        r_earth = float(np.linalg.norm(r_earth_vec))

        # 1. Insolation
        is_mirror_active = bool(self.mirror_config.get("active", True))
        s = compute_insolation(
            r_earth,
            mirror_active=is_mirror_active,
            mirror_config=self.mirror_config,
        )
        min_s = float(get_threshold_value(self.thresholds, "earth_safety", "min_insolation_w_m2"))
        max_s = float(get_threshold_value(self.thresholds, "earth_safety", "max_insolation_w_m2"))
        if s < min_s:
            flags.append(
                Flag(
                    code="INSOLATION_OUT_OF_BOUNDS",
                    t=t,
                    source=self.name,
                    quantity="earth_safety.min_insolation_w_m2",
                    value=s,
                    limit=min_s,
                )
            )
        elif s > max_s:
            flags.append(
                Flag(
                    code="INSOLATION_OUT_OF_BOUNDS",
                    t=t,
                    source=self.name,
                    quantity="earth_safety.max_insolation_w_m2",
                    value=s,
                    limit=max_s,
                )
            )

        # Mirror Station Keeping Check: Outward radiation pressure vs solar gravity (when deployed beyond 1 AU)
        if is_mirror_active and self.mirror_config and r_earth > constants.AU:
            area_m2 = float(self.mirror_config.get("area_m2", 8.44e14))
            refl = float(self.mirror_config.get("reflectivity", 0.95))
            mass_kg = float(self.mirror_config.get("mass_kg", 1.0e11))
            orient_deg = float(self.mirror_config.get("orientation_deg", 0.0))
            cos_orient = max(0.0, math.cos(math.radians(orient_deg)))

            m_ratio = constants.M_EARTH / (3.0 * (constants.GM_SUN / constants.G))
            d_l1 = r_earth * (m_ratio ** (1.0 / 3.0))
            r_mirror = max(r_earth / 2.0, r_earth - d_l1)
            s_at_mirror = constants.SOLAR_CONSTANT_1AU * ((constants.AU / r_mirror) ** 2)

            f_rad = (s_at_mirror * area_m2 / constants.C_LIGHT) * (1.0 + refl) * (cos_orient ** 2)
            a_rad = f_rad / mass_kg if mass_kg > 0.0 else 0.0
            g_solar = constants.GM_SUN / (r_mirror ** 2)

            station_keeping_modelled = bool(self.mirror_config.get("station_keeping_modelled", False))
            if a_rad > g_solar and not station_keeping_modelled:
                flags.append(
                    Flag(
                        code="MIRROR_STATION_KEEPING_UNMODELLED",
                        t=t,
                        source=self.name,
                        quantity="climate_mirror.station_keeping_modelled",
                        value=float(a_rad / g_solar),
                        limit=1.0,
                    )
                )

        # 2. Equilibrium Temperature
        t_eq = compute_equilibrium_temperature(s)
        min_t = float(get_threshold_value(self.thresholds, "earth_safety", "min_equilibrium_temp_k"))
        max_t = float(get_threshold_value(self.thresholds, "earth_safety", "max_equilibrium_temp_k"))
        if t_eq < min_t:
            flags.append(
                Flag(
                    code="TEMPERATURE_OUT_OF_BOUNDS",
                    t=t,
                    source=self.name,
                    quantity="earth_safety.min_equilibrium_temp_k",
                    value=t_eq,
                    limit=min_t,
                )
            )
        elif t_eq > max_t:
            flags.append(
                Flag(
                    code="TEMPERATURE_OUT_OF_BOUNDS",
                    t=t,
                    source=self.name,
                    quantity="earth_safety.max_equilibrium_temp_k",
                    value=t_eq,
                    limit=max_t,
                )
            )

        # 3. Moon Hill Sphere Retention
        if self.state.has_body("Moon"):
            moon = self.state.get_body("Moon")
            m_sun = self.state.get_body("Sun").mass_kg if self.state.has_body("Sun") else constants.GM_SUN / constants.G
            r_hill = compute_hill_radius(r_earth, earth.mass_kg, m_sun)
            d_moon = float(np.linalg.norm(moon.position_m - r_earth_vec))
            frac_hill = d_moon / r_hill
            max_hill_frac = float(get_threshold_value(self.thresholds, "earth_safety", "moon_retention_hill_fraction"))
            if frac_hill > max_hill_frac:
                flags.append(
                    Flag(
                        code="MOON_HILL_SPHERE_VIOLATION",
                        t=t,
                        source=self.name,
                        quantity="earth_safety.moon_retention_hill_fraction",
                        value=frac_hill,
                        limit=max_hill_frac,
                    )
                )

        # 4. Earth Acceleration and Jerk
        if dt > 0.0:
            v_curr = earth.velocity_m_s
            if self._prev_earth_velocity is not None:
                a_vec = (v_curr - self._prev_earth_velocity) / dt
                a_mag = float(np.linalg.norm(a_vec))
                max_a = float(get_threshold_value(self.thresholds, "earth_safety", "max_acceleration_m_s2"))
                if a_mag > max_a:
                    flags.append(
                        Flag(
                            code="EARTH_ACCELERATION_EXCEEDED",
                            t=t,
                            source=self.name,
                            quantity="earth_safety.max_acceleration_m_s2",
                            value=a_mag,
                            limit=max_a,
                        )
                    )
                if self._prev_earth_acceleration is not None:
                    j_vec = (a_vec - self._prev_earth_acceleration) / dt
                    j_mag = float(np.linalg.norm(j_vec))
                    max_j = float(get_threshold_value(self.thresholds, "earth_safety", "max_jerk_m_s3"))
                    if j_mag > max_j:
                        flags.append(
                            Flag(
                                code="EARTH_JERK_EXCEEDED",
                                t=t,
                                source=self.name,
                                quantity="earth_safety.max_jerk_m_s3",
                                value=j_mag,
                                limit=max_j,
                            )
                        )
                self._prev_earth_acceleration = a_vec
            self._prev_earth_velocity = v_curr.copy()

        # 5. Plume Clearance and Waste Heat
        if self.state.has_body("Tug"):
            tug = self.state.get_body("Tug")
            d_standoff = float(np.linalg.norm(tug.position_m - r_earth_vec))
            cone_deg = float(self.config.get("cant_angle_deg", 0.0))
            if cone_deg > 0.0:
                clearance = compute_plume_clearance_m(d_standoff, cone_deg)
                if clearance <= 0.0:
                    flags.append(
                        Flag(
                            code="EXHAUST_REIMPACT_VIOLATION",
                            t=t,
                            source=self.name,
                            quantity="earth_safety.exhaust_reimpact_allowed",
                            value=clearance,
                            limit=0.0,
                        )
                    )

            # Surface waste heat flux
            p_waste = float(self.config.get("waste_heat_w", 0.0))
            if p_waste > 0.0:
                attenuation = float(get_threshold_value(self.thresholds, "earth_safety", "thermal_shield_attenuation"))
                flux = compute_surface_waste_heat_flux(p_waste, d_standoff, attenuation)
                max_flux = float(get_threshold_value(self.thresholds, "earth_safety", "max_surface_waste_heat_w_m2"))
                if flux > max_flux:
                    flags.append(
                        Flag(
                            code="SURFACE_WASTE_HEAT_EXCEEDED",
                            t=t,
                            source=self.name,
                            quantity="earth_safety.max_surface_waste_heat_w_m2",
                            value=flux,
                            limit=max_flux,
                        )
                    )

        return flags

    def step(self, dt: float) -> list[Flag]:
        """Execute one driver step, evaluate limits, and cache raised flags."""
        self.flags = self.evaluate(dt)
        return self.flags
