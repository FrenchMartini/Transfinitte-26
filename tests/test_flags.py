"""Tests for Step 2.3: FlagRegistry and hypothetical enabler resolution."""

import pytest
from octo.core.flags import Flag, FlagRegistry, EnablerValidationError


def test_flag_explained_by_declared_enabler_is_allowed_and_records_id():
    """A flag whose quantity is in an enabler's `relaxes` list and within its capability is allowed."""
    enablers_cfg = {
        "enablers": [
            {
                "id": "E1",
                "name": "Planetary Fusion Power Plant",
                "relaxes": ["power.max_watts", "earth_safety.max_surface_waste_heat_w_m2"],
                "value": 5.0e21,
                "justification": "Required by delta E = 1.67e33 J over 10,000 years",
                "sources": ["ARCHITECTURE.md Section 2"],
            }
        ]
    }
    registry = FlagRegistry(enablers_cfg)

    flag = Flag(
        code="POWER_EXCEEDED",
        t=100.0,
        source="power",
        quantity="power.max_watts",
        value=1.0e21,
        limit=1.0e17,
    )
    resolved = registry.register(flag)

    assert resolved.enabler_id == "E1"
    assert registry.has_unresolved_flags() is False
    assert len(registry.allowed_flags) == 1
    assert registry.allowed_flags[0].enabler_id == "E1"
    assert registry.unresolved_flags == []


def test_unexplained_flag_is_unresolved_and_fails_run():
    """An unexplained flag has enabler_id=None and causes has_unresolved_flags() to be True."""
    registry = FlagRegistry({"enablers": []})

    flag = Flag(
        code="MOMENTUM_DRIFT",
        t=50.0,
        source="ledger",
        quantity="conservation.max_momentum_rel_error",
        value=1.0e-3,
        limit=1.0e-9,
    )
    resolved = registry.register(flag)

    assert resolved.enabler_id is None
    assert registry.has_unresolved_flags() is True
    assert len(registry.unresolved_flags) == 1
    assert registry.allowed_flags == []


def test_enabler_with_non_matching_relaxes_does_not_excuse_flag():
    """An enabler whose `relaxes` does not match the flag's quantity does NOT excuse it."""
    enablers_cfg = {
        "enablers": [
            {
                "id": "E1",
                "name": "Fusion Power Source",
                "relaxes": ["power.max_watts"],
                "value": 5.0e21,
                "justification": "Power source only",
                "sources": ["Section 9"],
            }
        ]
    }
    registry = FlagRegistry(enablers_cfg)

    unrelated_flag = Flag(
        code="SAFETY_FACTOR_LOW",
        t=200.0,
        source="structure",
        quantity="structure.min_safety_factor",
        value=1.1,
        limit=1.5,
    )
    resolved = registry.register(unrelated_flag)

    assert resolved.enabler_id is None
    assert registry.has_unresolved_flags() is True
    assert len(registry.unresolved_flags) == 1


def test_flag_exceeding_enabler_assumed_capability_value_is_not_excused():
    """A flag whose actual value exceeds the enabler's declared capability `value` is NOT excused."""
    enablers_cfg = {
        "enablers": [
            {
                "id": "E1",
                "name": "Fusion Power Source",
                "relaxes": ["power.max_watts"],
                "value": 5.0e21,
                "justification": "Assumed 5e21 W capability",
                "sources": ["Section 9"],
            }
        ]
    }
    registry = FlagRegistry(enablers_cfg)

    excessive_flag = Flag(
        code="POWER_EXCEEDED",
        t=200.0,
        source="power",
        quantity="power.max_watts",
        value=9.0e22,  # Exceeds E1's 5.0e21 capability!
        limit=1.0e17,
    )
    resolved = registry.register(excessive_flag)

    assert resolved.enabler_id is None
    assert registry.has_unresolved_flags() is True


def test_more_than_three_enablers_raises_error():
    """Declaring more than 3 hypothetical enablers raises EnablerValidationError."""
    four_enablers = {
        "enablers": [
            {
                "id": f"E{i}",
                "name": f"Enabler {i}",
                "relaxes": [f"quantity.{i}"],
                "value": 100.0,
                "justification": "test",
                "sources": ["test"],
            }
            for i in range(1, 5)
        ]
    }
    with pytest.raises(EnablerValidationError, match="At most 3"):
        FlagRegistry(four_enablers)


def test_duplicate_enabler_ids_raises_error():
    """Duplicate enabler IDs in hypothetical_enablers.yaml raise EnablerValidationError."""
    dup_enablers = {
        "enablers": [
            {
                "id": "E1",
                "name": "First",
                "relaxes": ["q1"],
                "value": 10.0,
                "justification": "test",
                "sources": ["test"],
            },
            {
                "id": "E1",
                "name": "Duplicate ID",
                "relaxes": ["q2"],
                "value": 20.0,
                "justification": "test",
                "sources": ["test"],
            },
        ]
    }
    with pytest.raises(EnablerValidationError, match="Duplicate"):
        FlagRegistry(dup_enablers)
