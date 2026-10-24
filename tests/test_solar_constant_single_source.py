"""Tests for Item 6: Single solar constant from Participant Guide defined only in octo/core/constants.py."""

import math
from pathlib import Path
import re
import pytest

from octo.core import constants

ROOT_DIR = Path(__file__).resolve().parent.parent


def test_solar_constant_matches_participant_guide_formula():
    """Verify SOLAR_CONSTANT_1AU in octo/core/constants.py equals L_SUN / (4 * pi * AU^2) from Participant Guide §2.5 & §3."""
    assert hasattr(constants, "L_SUN")
    assert constants.L_SUN == 3.828e26
    expected_s0 = constants.L_SUN / (4.0 * math.pi * (constants.AU ** 2))
    assert constants.SOLAR_CONSTANT_1AU == pytest.approx(expected_s0, rel=1.0e-15)
    assert constants.EARTH_BOND_ALBEDO == 0.306


def test_solar_constant_defined_only_in_octo_core_constants():
    """Verify no file outside octo/core/constants.py defines SOLAR_CONSTANT or hardcodes 1361."""
    search_dirs = [
        ROOT_DIR / "octo",
        ROOT_DIR / "py",
        ROOT_DIR / "config",
        ROOT_DIR / "web" / "src",
    ]
    violations: list[str] = []
    pattern = re.compile(r"\b1361(?:\.0)?\b|SOLAR_CONSTANT_1AU_W_M2|ASSUMED_SOLAR_CONSTANT_W_M2")

    for d in search_dirs:
        for path in sorted(d.rglob("*")):
            if not path.is_file() or path.suffix not in {".py", ".ts", ".yaml"}:
                continue
            rel = path.relative_to(ROOT_DIR).as_posix()
            if rel == "octo/core/constants.py":
                continue
            text = path.read_text(encoding="utf-8")
            for lineno, line in enumerate(text.splitlines(), start=1):
                if pattern.search(line):
                    violations.append(f"{rel}:{lineno}: {line.strip()}")

    assert violations == [], "Duplicate solar constant definitions found:\n" + "\n".join(violations)
