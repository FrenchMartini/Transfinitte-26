"""Physical structural load monitor and safety factor verification.

Structural safety contracts:
- Dynamic threshold retrieval: All structural safety factor limits are loaded from rulebook_thresholds.yaml.
- Thrust cradle bearing stress: Computes compressive bearing stress on the asteroid body cradle.
- Material yield limit: Compares applied stress against chondrite/ice-rock compressive yield strength.
- Winning condition 3 audit: Asserts that every structural element maintains a safety factor >= min_safety_factor.
"""

import math
from typing import Any

from octo.core.flags import Flag
from octo.core.ledger import Ledger
from octo.core.state import State
from octo.core.thresholds import get_threshold_value, load_thresholds


def compute_cradle_bearing_stress_pa(thrust_n: float, radius_m: float) -> float:
    """Compute compressive bearing stress on hemispherical asteroid thrust cradle in Pascals."""
    f = float(thrust_n)
    r = float(radius_m)
    if r <= 0.0:
        raise ValueError("Asteroid radius must be strictly positive.")
    area = math.pi * (r ** 2)
    return abs(f) / area


def compute_engine_mount_bearing_stress_pa(thrust_n: float, bearing_area_m2: float) -> float:
    """Compute localized compressive stress on discrete titanium/composite engine thrust mount."""
    f = float(thrust_n)
    a = float(bearing_area_m2)
    if a <= 0.0:
        raise ValueError("Bearing area must be strictly positive.")
    return abs(f) / a


def compute_radiator_panel_stress_pa(
    panel_mass_kg: float,
    accel_m_s2: float,
    root_area_m2: float,
) -> float:
    """Compute inertial root bending/tensile stress on waste heat radiator panels."""
    m = float(panel_mass_kg)
    acc = float(accel_m_s2)
    a_root = float(root_area_m2)
    if a_root <= 0.0:
        raise ValueError("Root support area must be strictly positive.")
    f_inertia = abs(m * acc)
    return f_inertia / a_root


def compute_shield_membrane_stress_pa(
    radiation_pressure_pa: float,
    shield_radius_m: float,
    thickness_m: float,
) -> float:
    """Compute membrane hoop tensile stress on deep-space thermal radiation shadow shield."""
    p = float(radiation_pressure_pa)
    r = float(shield_radius_m)
    t = float(thickness_m)
    if t <= 0.0 or r <= 0.0:
        raise ValueError("Radius and thickness must be strictly positive.")
    return (abs(p) * r) / (2.0 * t)


def compute_mirror_support_buckling_load_n(
    elastic_modulus_pa: float,
    moment_inertia_m4: float,
    strut_length_m: float,
) -> float:
    """Compute Euler critical buckling load P_cr for carbon composite mirror support strut."""
    e = float(elastic_modulus_pa)
    i = float(moment_inertia_m4)
    l = float(strut_length_m)
    if l <= 0.0 or e <= 0.0 or i <= 0.0:
        raise ValueError("Elastic modulus, moment of inertia, and length must be strictly positive.")
    return (math.pi ** 2) * e * i / (l ** 2)


def compute_tidal_tensile_stress_pa(
    m_primary_kg: float,
    m_body_kg: float,
    r_body_m: float,
    distance_m: float,
    g_const: float = 6.6743e-11,
) -> float:
    """Compute Earth gravity-gradient tidal tensile stress across Ceres core in Pascals."""
    m_p = float(m_primary_kg)
    m_b = float(m_body_kg)
    r_b = float(r_body_m)
    d = float(distance_m)
    if d <= 0.0 or r_b <= 0.0 or m_p <= 0.0 or m_b <= 0.0:
        raise ValueError("Masses, radius, and distance must be strictly positive.")
    f_tidal = (2.0 * g_const * m_p * m_b * r_b) / (d ** 3)
    cross_area = math.pi * (r_b ** 2)
    return f_tidal / cross_area


def compute_safety_factor(yield_strength_pa: float, applied_stress_pa: float) -> float:
    """Compute structural safety factor SF = sigma_yield / sigma_applied."""
    sigma_y = float(yield_strength_pa)
    sigma_a = float(applied_stress_pa)
    if sigma_y <= 0.0:
        raise ValueError("Material yield strength must be strictly positive.")
    if sigma_a <= 0.0:
        return float("inf")
    return sigma_y / sigma_a


class StructureDriver:
    """Driver auditing structural loads, thrust cradle stress, and safety factors."""

    def __init__(
        self,
        state: State,
        ledger: Ledger | None = None,
        config: dict[str, Any] | None = None,
        thresholds: dict[str, Any] | None = None,
    ) -> None:
        self.name = "structure"
        self.state = state
        self.ledger = ledger
        self.config = config or {}
        if thresholds is not None:
            self.thresholds = thresholds
        elif ledger is not None and hasattr(ledger, "_thresholds"):
            self.thresholds = ledger._thresholds
        else:
            self.thresholds = load_thresholds()

        self.current_safety_factor = float("inf")
        self.min_safety_factor_observed = float("inf")
        self.flags: list[Flag] = []

    def evaluate(self, dt: float) -> list[Flag]:
        """Evaluate structural loads across all elements and assert safety factors against rulebook limits."""
        flags: list[Flag] = []
        t = float(self.state.t)

        tug_cfg = self.config.get("ceres_tug", {})
        thrust_n = float(tug_cfg.get("thrust_n", 2.3256e17))
        radius_m = float(tug_cfg.get("radius_m", 4.73e5))
        rock_yield_pa = float(tug_cfg.get("cradle_yield_strength_pa", 5.0e6))

        # 1. Asteroid thrust cradle compressive stress
        cradle_stress = compute_cradle_bearing_stress_pa(thrust_n=thrust_n, radius_m=radius_m)
        sf_cradle = compute_safety_factor(yield_strength_pa=rock_yield_pa, applied_stress_pa=cradle_stress)

        # 2. Discrete high-strength engine thrust mount
        mount_area = float(tug_cfg.get("engine_mount_area_m2", 3.0e9))
        mount_yield = float(tug_cfg.get("engine_mount_yield_pa", 9.0e8))
        mount_stress = compute_engine_mount_bearing_stress_pa(thrust_n=thrust_n, bearing_area_m2=mount_area)
        sf_mount = compute_safety_factor(yield_strength_pa=mount_yield, applied_stress_pa=mount_stress)

        # 3. Radiator panel inertial stress
        rad_mass = float(tug_cfg.get("radiator_mass_kg", 1.0e9))
        rad_root_area = float(tug_cfg.get("radiator_root_area_m2", 1.0e2))
        rad_yield = float(tug_cfg.get("radiator_yield_pa", 2.5e8))
        m_coupled = 5.9722e24 + 7.3477e22 + 9.4e20
        accel = thrust_n / m_coupled
        rad_stress = compute_radiator_panel_stress_pa(panel_mass_kg=rad_mass, accel_m_s2=accel, root_area_m2=rad_root_area)
        sf_rad = compute_safety_factor(yield_strength_pa=rad_yield, applied_stress_pa=rad_stress)

        # 4. Deep-space thermal radiation shadow shield
        shield_r = float(tug_cfg.get("shield_radius_m", 5.0e5))
        shield_t = float(tug_cfg.get("shield_thickness_m", 5.0e-4))
        shield_yield = float(tug_cfg.get("shield_yield_pa", 1.5e8))
        shield_stress = compute_shield_membrane_stress_pa(radiation_pressure_pa=2.0e-10, shield_radius_m=shield_r, thickness_m=shield_t)
        sf_shield = compute_safety_factor(yield_strength_pa=shield_yield, applied_stress_pa=shield_stress)

        # 5. Tug tidal tensile load from Earth gravity gradient
        d0 = float(tug_cfg.get("standoff_distance_m", 1.277e9))
        tidal_stress = compute_tidal_tensile_stress_pa(
            m_primary_kg=5.9722e24,
            m_body_kg=9.4e20,
            r_body_m=radius_m,
            distance_m=d0,
        )
        sf_tidal = compute_safety_factor(yield_strength_pa=rock_yield_pa, applied_stress_pa=tidal_stress)

        # Minimum across all analytical elements
        sf = min(sf_cradle, sf_mount, sf_rad, sf_shield, sf_tidal)

        self.current_safety_factor = sf
        self.min_safety_factor_observed = min(self.min_safety_factor_observed, sf)

        min_sf = float(get_threshold_value(self.thresholds, "structure", "min_safety_factor"))
        if sf < min_sf:
            flags.append(
                Flag(
                    code="STRUCTURAL_SAFETY_FACTOR_VIOLATION",
                    t=t,
                    source=self.name,
                    quantity="structure.min_safety_factor",
                    value=sf,
                    limit=min_sf,
                )
            )

        return flags

    def step(self, dt: float) -> list[Flag]:
        """Execute one driver step, evaluate structural limits, and cache raised flags."""
        self.flags = self.evaluate(dt)
        return self.flags
