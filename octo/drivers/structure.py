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
        """Evaluate structural loads and assert safety factors against rulebook limits."""
        flags: list[Flag] = []
        t = float(self.state.t)

        tug_cfg = self.config.get("ceres_tug", {})
        thrust_n = float(tug_cfg.get("thrust_n", 2.3256e17))
        radius_m = float(tug_cfg.get("radius_m", 4.73e5))
        rock_yield_pa = float(tug_cfg.get("cradle_yield_strength_pa", 5.0e6))

        stress = compute_cradle_bearing_stress_pa(thrust_n=thrust_n, radius_m=radius_m)
        sf = compute_safety_factor(yield_strength_pa=rock_yield_pa, applied_stress_pa=stress)

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
