"""Rulebook threshold configuration loader and schema validator.

Threshold validation contracts:
- Central governance: Loads and parses config/rulebook_thresholds.yaml with schema enforcement.
- Field completeness: Every entry requires value, physical units, status, severity, and source citation.
- Assumed threshold warnings: Emits AssumedThresholdWarning when unconfirmed placeholder values are loaded.
- Hard limits vs flags: Differentiates simulation-halting hard limits from audit-monitored flag thresholds.
"""

from pathlib import Path
from typing import Any
import warnings
import yaml


class ThresholdValidationError(ValueError):
    """Raised when rulebook_thresholds.yaml fails schema, unit, status, or severity validation."""


class AssumedThresholdWarning(UserWarning):
    """Emitted when one or more loaded thresholds have status == 'ASSUMED'."""


DEFAULT_THRESHOLDS_PATH = (
    Path(__file__).resolve().parent.parent.parent / "config" / "rulebook_thresholds.yaml"
)

REQUIRED_ENTRY_FIELDS = ("value", "units", "status", "severity", "source")

VALID_STATUSES = {"ASSUMED", "CONFIRMED"}
VALID_SEVERITIES = {"hard", "flag"}

VALID_UNITS = {
    "years",
    "s",
    "dimensionless",
    "fraction",
    "boolean",
    "m",
    "km",
    "AU",
    "m/s",
    "km/s",
    "m/s^2",
    "m/s^3",
    "W",
    "W/m^2",
    "W/m^2/yr",
    "W/m^2/s",
    "K",
    "kg",
    "kg/s",
    "N",
    "J",
    "J/kg",
}

REQUIRED_SCHEMA: dict[str, tuple[str, ...]] = {
    "simulation": ("max_years",),
    "structure": ("min_safety_factor",),
    "earth_safety": (
        "max_acceleration_m_s2",
        "max_jerk_m_s3",
        "moon_retention_hill_fraction",
        "max_mass_loss_fraction",
        "min_insolation_w_m2",
        "max_insolation_w_m2",
        "min_equilibrium_temp_k",
        "max_equilibrium_temp_k",
        "max_insolation_rate_w_m2_yr",
        "max_surface_waste_heat_w_m2",
        "exhaust_reimpact_allowed",
        "thermal_shield_attenuation",
    ),
    "orbit_targets": (
        "target_radius_au",
        "target_radius_tolerance_au",
        "max_eccentricity",
    ),
    "conservation": (
        "max_energy_rel_error",
        "max_momentum_rel_error",
        "max_mass_rel_error",
    ),
}


def has_assumed_thresholds(data: dict[str, dict[str, dict[str, Any]]]) -> bool:
    """Return True if any threshold entry in the dictionary has status == 'ASSUMED'."""
    return any(
        entry.get("status") == "ASSUMED"
        for category in data.values()
        for entry in category.values()
    )


def get_threshold_value(
    data: dict[str, dict[str, dict[str, Any]]], category: str, key: str
) -> Any:
    """Retrieve the scalar value of a validated threshold entry."""
    return data[category][key]["value"]


def load_thresholds(
    path: str | Path | None = None,
) -> dict[str, dict[str, dict[str, Any]]]:
    """Load and validate rulebook_thresholds.yaml.

    Raises ThresholdValidationError on missing categories/keys/fields or invalid
    units, status, or severity.
    Emits AssumedThresholdWarning if any threshold has status == 'ASSUMED'.
    """
    target_path = Path(path) if path is not None else DEFAULT_THRESHOLDS_PATH
    if not target_path.is_file():
        raise ThresholdValidationError(f"Thresholds file not found: {target_path}")

    raw = yaml.safe_load(target_path.read_text())
    if not isinstance(raw, dict):
        raise ThresholdValidationError("Thresholds file root must be a YAML mapping.")

    for category, required_keys in REQUIRED_SCHEMA.items():
        if category not in raw or not isinstance(raw[category], dict):
            raise ThresholdValidationError(f"Missing required category '{category}'.")
        for key in required_keys:
            if key not in raw[category]:
                raise ThresholdValidationError(
                    f"Missing required threshold key '{category}.{key}'."
                )

    assumed_keys: list[str] = []

    for category, entries in raw.items():
        if not isinstance(entries, dict):
            raise ThresholdValidationError(
                f"Category '{category}' must map to a dictionary of threshold entries."
            )
        for key, entry in entries.items():
            full_key = f"{category}.{key}"
            if not isinstance(entry, dict):
                raise ThresholdValidationError(
                    f"Threshold '{full_key}' must be a mapping of fields."
                )

            for field in REQUIRED_ENTRY_FIELDS:
                if field not in entry or entry[field] is None:
                    raise ThresholdValidationError(
                        f"Threshold '{full_key}' is missing required field '{field}'."
                    )

            value = entry["value"]
            if not isinstance(value, (int, float, bool)):
                raise ThresholdValidationError(
                    f"Threshold '{full_key}' field 'value' must be numeric or boolean, got {type(value).__name__}."
                )

            units = entry["units"]
            if not isinstance(units, str) or not units.strip() or units not in VALID_UNITS:
                raise ThresholdValidationError(
                    f"Threshold '{full_key}' has invalid 'units': {units!r}. Must be one of {sorted(VALID_UNITS)}."
                )

            status = entry["status"]
            if status not in VALID_STATUSES:
                raise ThresholdValidationError(
                    f"Threshold '{full_key}' has invalid 'status': {status!r}. Must be ASSUMED or CONFIRMED."
                )

            severity = entry["severity"]
            if severity not in VALID_SEVERITIES:
                raise ThresholdValidationError(
                    f"Threshold '{full_key}' has invalid 'severity': {severity!r}. Must be 'hard' or 'flag'."
                )

            source = entry["source"]
            if not isinstance(source, str) or not source.strip():
                raise ThresholdValidationError(
                    f"Threshold '{full_key}' field 'source' must be a non-empty string."
                )

            if status == "ASSUMED":
                assumed_keys.append(full_key)

    if assumed_keys:
        warnings.warn(
            f"{len(assumed_keys)} threshold(s) have status=ASSUMED: {', '.join(assumed_keys)}",
            AssumedThresholdWarning,
            stacklevel=2,
        )

    return raw
