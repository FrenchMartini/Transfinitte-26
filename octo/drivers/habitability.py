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

from dataclasses import dataclass
from enum import Enum

from octo.core import constants
from octo.core.flags import Flag
from octo.core.ledger import Ledger
from octo.core.state import State
from octo.core.thresholds import get_threshold_value, load_thresholds


class StationKeepingType(Enum):
    """Propellantless and active station-keeping mechanisms for the climate optical swarm."""
    NONE = "none"
    ACTIVE_PROPULSION = "active_propulsion"
    BALLAST_TETHER = "ballast_tether"
    REFRACTIVE_OPTICS = "refractive_optics"
    STATITE_PHOTON_TRIM = "statite_photon_trim"


@dataclass
class MirrorStationKeepingConfig:
    """Configuration for propellantless or active mirror station-keeping equilibrium."""
    mechanism: StationKeepingType = StationKeepingType.NONE
    deflection_angle_rad: float = 0.005     # ~0.28 deg for L1 Fresnel convergence
    ballast_mass_kg: float = 0.0            # Counter-mass for tethered asteroid
    trim_authority_margin: float = 0.0      # Electrochromic statite trim authority


def evaluate_mirror_equilibrium(
    a_rad: float,
    g_solar: float,
    config: MirrorStationKeepingConfig,
    flags: list[Flag],
    t: float = 0.0,
    source: str = "habitability",
) -> None:
    """Evaluate whether the optical swarm achieves equilibrium or requires unmodelled station keeping."""
    if a_rad <= g_solar:
        return

    # Method 2: Refractive / Diffractive Fresnel Low-Recoil Optics
    if config.mechanism == StationKeepingType.REFRACTIVE_OPTICS:
        momentum_ratio = (config.deflection_angle_rad ** 2) / 4.0
        if (a_rad * momentum_ratio) <= g_solar:
            return

    # Method 1: The Ballast Asteroid Anchor (Tethered Hoytether Equilibrium)
    elif config.mechanism == StationKeepingType.BALLAST_TETHER:
        if config.ballast_mass_kg >= 1.0e12:
            return

    # Method 3: The Statite Principle (Solar Tacking via Electrochromic Trim Panels)
    elif config.mechanism == StationKeepingType.STATITE_PHOTON_TRIM:
        if config.trim_authority_margin >= 0.15:
            return

    # Active thruster propellant station keeping
    elif config.mechanism == StationKeepingType.ACTIVE_PROPULSION:
        return

    flags.append(
        Flag(
            code="MIRROR_STATION_KEEPING_UNMODELLED",
            t=t,
            source=source,
            quantity="climate_mirror.station_keeping_modelled",
            value=float(a_rad / g_solar) if g_solar > 0.0 else 0.0,
            limit=1.0,
        )
    )


def compute_mirror_reflected_flux(
    orbit_radius_m: float,
    mirror_config: dict[str, Any] | None = None,
) -> float:
    """Compute additional reflected solar flux on Earth from the climate mirror swarm [W/m^2].

    Geometry & Dual-Swarm Architecture:
    - L1 Day-Side Concentrating Swarm: Positioned at L1 sub-solar point (r_L1 = r - d_L1).
      Directs sunlight onto high latitudes (poles) and dawn/dusk terminators to prevent equatorial boiling.
    - L2 Night-Side Reflecting Swarm (Halo Orbit): Positioned in an inclined halo orbit at L2
      (r_L2 = r + d_L2, R_halo > 10,000 km) catching sunlight streaming past Earth's shadow cone and
      reflecting it backward onto the dark hemisphere (engineered reverse Earthshine), preventing
      night-side freezeout and eliminating planet-scouring supersonic hyper-canes.
    - Tilt schedule: orientation angle theta_tilt(t) tilts mirror (cos(theta_tilt)) to match the deficit.
    """
    if not mirror_config or not mirror_config.get("active", True):
        return 0.0

    area_m2 = float(mirror_config.get("area_m2", 8.44e14))
    reflectivity = float(mirror_config.get("reflectivity", 0.95))
    capture_efficiency = float(mirror_config.get("capture_efficiency", 1.0))

    r = float(orbit_radius_m)
    if r <= constants.AU:
        return 0.0

    earth_disk_area = math.pi * (constants.R_EARTH ** 2)

    # Hill-sphere scaling for L1 / L2 distance: d_L ~ r * (M_earth / (3 * M_sun))^(1/3)
    m_ratio = constants.M_EARTH / (3.0 * (constants.GM_SUN / constants.G))
    d_l = r * (m_ratio ** (1.0 / 3.0))

    # 1. Day-Side L1 Concentrator Swarm
    r_l1 = max(r / 2.0, r - d_l)
    s_at_l1 = constants.SOLAR_CONSTANT_1AU * ((constants.AU / r_l1) ** 2)

    # Tilt schedule or throttle by deficit (active when requested in mirror_config)
    if mirror_config.get("tilt_schedule", False) or mirror_config.get("throttle_by_deficit", False):
        direct_flux = constants.SOLAR_CONSTANT_1AU * ((constants.AU / r) ** 2)
        deficit_flux = max(0.0, constants.SOLAR_CONSTANT_1AU - direct_flux)
        max_possible_flux = (s_at_l1 * area_m2 * reflectivity * capture_efficiency) / earth_disk_area
        if max_possible_flux > 0.0:
            cos_tilt = min(1.0, max(0.0, deficit_flux / max_possible_flux))
            tilt_rad = math.acos(cos_tilt)
            orient_deg = math.degrees(tilt_rad)
        else:
            orient_deg = 90.0
        cos_orient = math.cos(math.radians(orient_deg))
    else:
        orient_deg = float(mirror_config.get("orientation_deg", 0.0))
        cos_orient = max(0.0, math.cos(math.radians(orient_deg)))

    p_reflected_l1 = s_at_l1 * area_m2 * reflectivity * cos_orient * capture_efficiency

    # 2. Night-Side L2 Halo Reflector Swarm (if dual_swarm enabled)
    p_reflected_l2 = 0.0
    if mirror_config.get("dual_swarm", False):
        r_l2 = r + d_l
        s_at_l2 = constants.SOLAR_CONSTANT_1AU * ((constants.AU / r_l2) ** 2)
        night_fraction = float(mirror_config.get("l2_night_flux_fraction", 0.35))
        p_reflected_l2 = s_at_l2 * (area_m2 * night_fraction) * reflectivity * capture_efficiency

    total_flux = (p_reflected_l1 + p_reflected_l2) / earth_disk_area
    return float(total_flux)


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


def compute_plume_clearance_m(
    standoff_d: float,
    cone_deg: float,
    target_radius_m: float = 0.0,
    beam_half_width_m: float = 0.0,
) -> float:
    """Compute perpendicular clearance of canted exhaust plume cones at standoff distance.

    Clearance is the perpendicular distance from plume centerline to the target body center
    (d * sin(cone_deg)), minus target body radius and exhaust beam half-width.
    """
    d = float(standoff_d)
    theta_rad = math.radians(float(cone_deg))
    d_perp = d * math.sin(theta_rad)
    return float(d_perp - target_radius_m - beam_half_width_m)


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

            station_keeping_raw = self.mirror_config.get("station_keeping_type", None)
            if station_keeping_raw is not None:
                try:
                    mechanism = StationKeepingType(str(station_keeping_raw).lower())
                except ValueError:
                    mechanism = StationKeepingType.NONE
            elif bool(self.mirror_config.get("station_keeping_modelled", False)):
                mechanism = StationKeepingType.ACTIVE_PROPULSION
            else:
                mechanism = StationKeepingType.NONE

            sk_config = MirrorStationKeepingConfig(
                mechanism=mechanism,
                deflection_angle_rad=float(self.mirror_config.get("deflection_angle_rad", 0.005)),
                ballast_mass_kg=float(self.mirror_config.get("ballast_mass_kg", 0.0)),
                trim_authority_margin=float(self.mirror_config.get("trim_authority_margin", 0.0)),
            )

            evaluate_mirror_equilibrium(
                a_rad=a_rad,
                g_solar=g_solar,
                config=sk_config,
                flags=flags,
                t=t,
                source=self.name,
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
