"""Rulebook Validator Gate evaluating multi-physics simulation runs against the 6 Winning Conditions.

Validation rules and audit contracts:
- Dynamic threshold retrieval: All acceptance limits are loaded from rulebook_thresholds.yaml.
- Six winning conditions: Audits target orbit, planetary safety, structural integrity, code validation, conservation closure, and enabler coverage.
- Enabler matching: Verifies that every raised flag is attributed to a declared hypothetical enabler.
- Non-negotiable pass gate: Any single failing condition or unexplained flag fails the entire mission.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from octo.core.flags import Flag, FlagRegistry
from octo.core.thresholds import get_threshold_value, load_thresholds


@dataclass(frozen=True, slots=True)
class ValidationVerdict:
    """Consolidated verdict evaluating a simulation run against the 6 Winning Conditions."""

    passed: bool
    winning_conditions: dict[str, bool]
    unresolved_flags: list[Flag] = field(default_factory=list)
    allowed_flags: list[Flag] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


class RulebookValidator:
    """Automated gate validating simulation telemetry and summaries against official rulebook thresholds."""

    def __init__(
        self,
        thresholds: dict[str, Any] | None = None,
        enabler_registry: FlagRegistry | None = None,
    ) -> None:
        self.thresholds = thresholds or load_thresholds()
        self.enabler_registry = enabler_registry

    def validate_summary(
        self,
        summary: dict[str, Any],
        flag_registry: FlagRegistry | None = None,
    ) -> ValidationVerdict:
        """Evaluate a high-level mission summary dictionary against the 6 Winning Conditions."""
        reg = flag_registry or self.enabler_registry or FlagRegistry({"enablers": []})

        # Threshold lookups
        max_years = float(get_threshold_value(self.thresholds, "simulation", "max_years"))
        target_r = float(get_threshold_value(self.thresholds, "orbit_targets", "target_radius_au"))
        tol_r = float(get_threshold_value(self.thresholds, "orbit_targets", "target_radius_tolerance_au"))
        max_e = float(get_threshold_value(self.thresholds, "orbit_targets", "max_eccentricity"))
        min_sf = float(get_threshold_value(self.thresholds, "structure", "min_safety_factor"))

        # W1: Target Orbit Reached
        epoch_yr = float(summary.get("final_epoch_years", 0.0))
        final_a = float(summary.get("earth_final_semi_major_axis_au", 0.0))
        final_e = float(summary.get("earth_final_eccentricity", 0.0))

        w1_time = epoch_yr <= max_years
        w1_radius = abs(final_a - target_r) <= tol_r
        w1_ecc = final_e <= max_e
        w1_pass = w1_time and w1_radius and w1_ecc

        # W2: Earth Stays Safe
        w2_pass = bool(summary.get("earth_safety_pass", True))

        # W3: Structure Survives
        sf = float(summary.get("min_structural_safety_factor", 0.0))
        w3_pass = sf >= min_sf

        # W4: Code is Validated
        w4_pass = bool(summary.get("benchmarks_passed", True))

        # W5: Physics is Honest
        w5_pass = bool(summary.get("conservation_audit_pass", True))

        # W6: No Unresolved Flags
        unresolved = reg.unresolved_flags
        allowed = reg.allowed_flags
        w6_pass = len(unresolved) == 0

        winning_conditions = {
            "W1_target_orbit_reached": w1_pass,
            "W2_earth_stays_safe": w2_pass,
            "W3_structure_survives": w3_pass,
            "W4_code_is_validated": w4_pass,
            "W5_physics_is_honest": w5_pass,
            "W6_no_unresolved_flags": w6_pass,
        }

        overall_pass = all(winning_conditions.values())

        details = {
            "final_epoch_years": epoch_yr,
            "max_allowed_years": max_years,
            "final_semi_major_axis_au": final_a,
            "target_semi_major_axis_au": target_r,
            "semi_major_axis_tolerance_au": tol_r,
            "final_eccentricity": final_e,
            "max_allowed_eccentricity": max_e,
            "min_structural_safety_factor": sf,
            "required_safety_factor": min_sf,
        }

        return ValidationVerdict(
            passed=overall_pass,
            winning_conditions=winning_conditions,
            unresolved_flags=unresolved,
            allowed_flags=allowed,
            details=details,
        )
