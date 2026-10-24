"""Layer 1 Config & Constants Tests (migrated to octo.core)."""

from pathlib import Path
import copy
import pytest
import yaml

from octo.core import constants
from octo.core.thresholds import (
    load_thresholds,
    has_assumed_thresholds,
    get_threshold_value,
    ThresholdValidationError,
    AssumedThresholdWarning,
)


REQUIRED_SCHEMA_KEYS = [
    ("simulation", "max_years"),
    ("structure", "min_safety_factor"),
    ("earth_safety", "max_acceleration_m_s2"),
    ("earth_safety", "max_jerk_m_s3"),
    ("earth_safety", "moon_retention_hill_fraction"),
    ("earth_safety", "max_mass_loss_fraction"),
    ("earth_safety", "min_insolation_w_m2"),
    ("earth_safety", "max_insolation_w_m2"),
    ("earth_safety", "min_equilibrium_temp_k"),
    ("earth_safety", "max_equilibrium_temp_k"),
    ("earth_safety", "max_insolation_rate_w_m2_yr"),
    ("earth_safety", "max_surface_waste_heat_w_m2"),
    ("earth_safety", "exhaust_reimpact_allowed"),
    ("earth_safety", "thermal_shield_attenuation"),
    ("orbit_targets", "target_radius_au"),
    ("orbit_targets", "target_radius_tolerance_au"),
    ("orbit_targets", "max_eccentricity"),
    ("conservation", "max_energy_rel_error"),
    ("conservation", "max_momentum_rel_error"),
    ("conservation", "max_mass_rel_error"),
    ("power", "beam_power_w"),
    ("propulsion", "max_exhaust_velocity_m_s"),
    ("propulsion", "reaction_mass_resupply_kg"),
]


def test_universal_constants_values_and_no_limits():
    """octo/core/constants.py must define only universal IAU/CODATA constants in SI units."""
    assert constants.GM_SUN == pytest.approx(1.32712440018e20, rel=1e-12)
    assert constants.MU_SUN == pytest.approx(constants.GM_SUN, rel=1e-12)
    assert constants.G == pytest.approx(6.67430e-11, rel=1e-6)
    assert constants.M_SUN == pytest.approx(1.98847e30, rel=1e-4)
    assert constants.M_EARTH == pytest.approx(5.9722e24, rel=1e-12)
    assert constants.AU == pytest.approx(1.495978707e11, rel=1e-12)
    assert constants.YEAR == pytest.approx(31557600.0, rel=1e-12)

    # Ensure no rulebook limits are leaked into constants.py
    public_names = [name for name in dir(constants) if not name.startswith("_")]
    forbidden_substrings = ("MAX", "MIN", "TOL", "LIMIT", "SAFETY", "TARGET")
    for name in public_names:
        for sub in forbidden_substrings:
            assert (
                sub not in name.upper()
            ), f"Limit-like constant {name} found in octo/core/constants.py"


def test_load_default_thresholds_warns_on_assumed():
    """Loading default config/rulebook_thresholds.yaml succeeds and emits AssumedThresholdWarning."""
    with pytest.warns(AssumedThresholdWarning, match="ASSUMED"):
        data = load_thresholds()

    # Check confirmed winning conditions from prompt and participant guide
    assert get_threshold_value(data, "simulation", "max_years") == 10000
    assert data["simulation"]["max_years"]["status"] == "CONFIRMED"
    assert get_threshold_value(data, "structure", "min_safety_factor") == 1.5
    assert data["structure"]["min_safety_factor"]["status"] == "CONFIRMED"
    assert get_threshold_value(data, "orbit_targets", "target_radius_au") == 2.7
    assert data["orbit_targets"]["target_radius_au"]["status"] == "CONFIRMED"
    assert data["conservation"]["max_energy_rel_error"]["status"] == "CONFIRMED"
    assert data["conservation"]["max_momentum_rel_error"]["status"] == "CONFIRMED"
    assert has_assumed_thresholds(data) is True

    # Ensure benchmark tolerances do NOT live in rulebook_thresholds.yaml
    assert "benchmarks" not in data

    # Check all required categories and entries exist and have all 5 required fields
    for category, key in REQUIRED_SCHEMA_KEYS:
        assert category in data, f"Missing category: {category}"
        assert key in data[category], f"Missing key: {category}.{key}"
        entry = data[category][key]
        for field in ("value", "units", "status", "severity", "source"):
            assert field in entry, f"Missing field '{field}' in {category}.{key}"


def test_confirmed_only_thresholds_emit_no_warning(tmp_path: Path, recwarn):
    """When all thresholds are CONFIRMED, no AssumedThresholdWarning is emitted."""
    with pytest.warns(AssumedThresholdWarning):
        data = load_thresholds()

    confirmed_data = copy.deepcopy(data)
    for category in confirmed_data.values():
        for entry in category.values():
            entry["status"] = "CONFIRMED"

    cfg_file = tmp_path / "thresholds_confirmed.yaml"
    cfg_file.write_text(yaml.safe_dump(confirmed_data))

    recwarn.clear()
    loaded = load_thresholds(cfg_file)
    assumed_warnings = [
        w for w in recwarn if issubclass(w.category, AssumedThresholdWarning)
    ]
    assert len(assumed_warnings) == 0
    assert loaded["simulation"]["max_years"]["status"] == "CONFIRMED"


def test_missing_required_category_or_key_raises(tmp_path: Path):
    """Missing required top-level category or threshold entry raises ThresholdValidationError."""
    with pytest.warns(AssumedThresholdWarning):
        data = load_thresholds()

    broken = copy.deepcopy(data)
    del broken["earth_safety"]["max_acceleration_m_s2"]
    cfg_file = tmp_path / "missing_key.yaml"
    cfg_file.write_text(yaml.safe_dump(broken))

    with pytest.raises(ThresholdValidationError, match="max_acceleration_m_s2"):
        load_thresholds(cfg_file)


def test_missing_entry_field_raises(tmp_path: Path):
    """Missing one of (value, units, status, severity, source) raises ThresholdValidationError."""
    with pytest.warns(AssumedThresholdWarning):
        data = load_thresholds()

    broken = copy.deepcopy(data)
    del broken["simulation"]["max_years"]["source"]
    cfg_file = tmp_path / "missing_field.yaml"
    cfg_file.write_text(yaml.safe_dump(broken))

    with pytest.raises(ThresholdValidationError, match="source"):
        load_thresholds(cfg_file)


def test_bad_units_raises(tmp_path: Path):
    """Empty, non-string, or unrecognized units raise ThresholdValidationError."""
    with pytest.warns(AssumedThresholdWarning):
        data = load_thresholds()

    broken_empty = copy.deepcopy(data)
    broken_empty["earth_safety"]["max_acceleration_m_s2"]["units"] = ""
    cfg_empty = tmp_path / "empty_units.yaml"
    cfg_empty.write_text(yaml.safe_dump(broken_empty))

    with pytest.raises(ThresholdValidationError, match="units"):
        load_thresholds(cfg_empty)

    broken_unknown = copy.deepcopy(data)
    broken_unknown["earth_safety"]["max_acceleration_m_s2"]["units"] = "furlongs/fortnight^9"
    cfg_unknown = tmp_path / "unknown_units.yaml"
    cfg_unknown.write_text(yaml.safe_dump(broken_unknown))

    with pytest.raises(ThresholdValidationError, match="units"):
        load_thresholds(cfg_unknown)


def test_bad_status_raises(tmp_path: Path):
    """Status outside {'ASSUMED', 'CONFIRMED'} raises ThresholdValidationError."""
    with pytest.warns(AssumedThresholdWarning):
        data = load_thresholds()

    broken = copy.deepcopy(data)
    broken["simulation"]["max_years"]["status"] = "GUESS"
    cfg_file = tmp_path / "bad_status.yaml"
    cfg_file.write_text(yaml.safe_dump(broken))

    with pytest.raises(ThresholdValidationError, match="status"):
        load_thresholds(cfg_file)


def test_bad_severity_raises(tmp_path: Path):
    """Severity outside {'hard', 'flag'} raises ThresholdValidationError."""
    with pytest.warns(AssumedThresholdWarning):
        data = load_thresholds()

    broken = copy.deepcopy(data)
    broken["simulation"]["max_years"]["status"] = "CONFIRMED"
    broken["simulation"]["max_years"]["severity"] = "soft"
    cfg_file = tmp_path / "bad_severity.yaml"
    cfg_file.write_text(yaml.safe_dump(broken))

    with pytest.raises(ThresholdValidationError, match="severity"):
        load_thresholds(cfg_file)


def test_other_config_files_exist_and_parse():
    """config/base.yaml and config/hypothetical_enablers.yaml exist and follow schema."""
    root = Path(__file__).resolve().parent.parent
    base_path = root / "config" / "base.yaml"
    enablers_path = root / "config" / "hypothetical_enablers.yaml"

    assert base_path.is_file(), "Missing config/base.yaml"
    assert enablers_path.is_file(), "Missing config/hypothetical_enablers.yaml"

    base_cfg = yaml.safe_load(base_path.read_text())
    enablers_cfg = yaml.safe_load(enablers_path.read_text())

    for required_key in (
        "mode",
        "time_span_years",
        "macro_step_s",
        "drivers",
        "propulsion",
        "initial_conditions",
        "target_orbit",
        "seed",
        "output_paths",
    ):
        assert required_key in base_cfg, f"Missing {required_key} in config/base.yaml"

    prop_cfg = base_cfg["propulsion"]
    assert "variant" in prop_cfg
    assert "exhaust_velocity_m_s" in prop_cfg
    assert "mass_flow_kg_s" in prop_cfg
    assert "power_w" in prop_cfg
    assert "efficiency" in prop_cfg

    assert "enablers" in enablers_cfg
    assert isinstance(enablers_cfg["enablers"], list)
    assert len(enablers_cfg["enablers"]) <= 3
