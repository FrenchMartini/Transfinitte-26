"""Tests for Step 6: End-to-End Rulebook Validator Gate & Winning Conditions."""

import pytest
from pathlib import Path

from octo.core import constants
from octo.core.flags import Flag, FlagRegistry
from octo.core.ledger import Ledger
from octo.core.state import BodyState, State
from octo.core.thresholds import get_threshold_value, load_thresholds
from octo.core.validator import RulebookValidator, ValidationVerdict


@pytest.fixture
def thresholds():
    return load_thresholds()


@pytest.fixture
def enabler_registry():
    enablers_path = Path(__file__).resolve().parent.parent / "config" / "hypothetical_enablers.yaml"
    return FlagRegistry.from_yaml(enablers_path)


def test_validator_passes_nominal_mission(thresholds, enabler_registry):
    """Verify validator accepts nominal 9,516-year run arriving at 2.7 AU with 0 unresolved flags."""
    validator = RulebookValidator(thresholds=thresholds, enabler_registry=enabler_registry)

    nominal_summary = {
        "final_epoch_years": 9516.03,
        "earth_final_semi_major_axis_au": 2.7000,
        "earth_final_eccentricity": 0.000093,
        "min_structural_safety_factor": 1.75,
        "conservation_audit_pass": True,
        "benchmarks_passed": True,
    }

    flag_reg = FlagRegistry(enabler_registry.enablers)
    # Register an enabler-excused flag (e.g., beamed power 1.096e25 W under E1)
    flag_reg.register(
        Flag(
            code="BEAM_POWER_HIGH",
            t=100.0,
            source="power",
            quantity="power.max_power_w",
            value=1.095e25,
            limit=1.0e17,
        )
    )

    verdict = validator.validate_summary(nominal_summary, flag_registry=flag_reg)
    assert verdict.passed is True
    assert all(verdict.winning_conditions.values())
    assert len(verdict.unresolved_flags) == 0
    assert len(verdict.allowed_flags) == 1


def test_validator_fails_orbit_target_breach(thresholds, enabler_registry):
    """Verify validator fails Winning Condition 1 if Earth falls short of 2.7 AU or ecc exceeds 0.05."""
    validator = RulebookValidator(thresholds=thresholds, enabler_registry=enabler_registry)

    bad_radius = {
        "final_epoch_years": 9500.0,
        "earth_final_semi_major_axis_au": 2.1000,  # Short of target [2.65, 2.75] AU
        "earth_final_eccentricity": 0.01,
        "min_structural_safety_factor": 2.0,
        "conservation_audit_pass": True,
        "benchmarks_passed": True,
    }
    v1 = validator.validate_summary(bad_radius)
    assert v1.passed is False
    assert v1.winning_conditions["W1_target_orbit_reached"] is False

    bad_ecc = {
        "final_epoch_years": 9500.0,
        "earth_final_semi_major_axis_au": 2.7000,
        "earth_final_eccentricity": 0.12,  # Exceeds max 0.05
        "min_structural_safety_factor": 2.0,
        "conservation_audit_pass": True,
        "benchmarks_passed": True,
    }
    v2 = validator.validate_summary(bad_ecc)
    assert v2.passed is False
    assert v2.winning_conditions["W1_target_orbit_reached"] is False


def test_validator_fails_simulation_duration_timeout(thresholds, enabler_registry):
    """Verify validator fails Winning Condition 1 if simulation exceeds 10,000 years."""
    validator = RulebookValidator(thresholds=thresholds, enabler_registry=enabler_registry)

    overtime_summary = {
        "final_epoch_years": 10500.0,  # Exceeds 10,000 year rulebook limit
        "earth_final_semi_major_axis_au": 2.7000,
        "earth_final_eccentricity": 0.001,
        "min_structural_safety_factor": 2.0,
        "conservation_audit_pass": True,
        "benchmarks_passed": True,
    }
    verdict = validator.validate_summary(overtime_summary)
    assert verdict.passed is False
    assert verdict.winning_conditions["W1_target_orbit_reached"] is False


def test_validator_fails_on_unresolved_flag(thresholds, enabler_registry):
    """Verify validator fails Winning Condition 6 if any unexplained flag exists."""
    validator = RulebookValidator(thresholds=thresholds, enabler_registry=enabler_registry)

    summary = {
        "final_epoch_years": 9516.0,
        "earth_final_semi_major_axis_au": 2.7000,
        "earth_final_eccentricity": 0.0001,
        "min_structural_safety_factor": 2.0,
        "conservation_audit_pass": True,
        "benchmarks_passed": True,
    }

    flag_reg = FlagRegistry(enabler_registry.enablers)
    # Register an unexplained momentum conservation drift
    flag_reg.register(
        Flag(
            code="MOMENTUM_DRIFT",
            t=500.0,
            source="ledger",
            quantity="conservation.max_momentum_rel_error",
            value=1.0e-4,
            limit=1.0e-9,
        )
    )

    verdict = validator.validate_summary(summary, flag_registry=flag_reg)
    assert verdict.passed is False
    assert verdict.winning_conditions["W6_no_unresolved_flags"] is False
    assert len(verdict.unresolved_flags) == 1
