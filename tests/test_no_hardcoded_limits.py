"""AST-based audit ensuring no rulebook threshold values are hard-coded in octo/.

How it works:
1. Loads every numeric limit (`int` or `float`, excluding `bool`) from
   `config/rulebook_thresholds.yaml`.
2. Parses every `.py` file under `octo/` using Python's `ast` module and extracts
   all numeric `ast.Constant` literals (including unary negations like `-1.5`),
   recording their file path and line number.
3. Compares each literal in `octo/` against every threshold value in
   `rulebook_thresholds.yaml` unless explicitly listed in `ALLOWLIST`.
"""

import ast
from pathlib import Path
import pytest

from octo.core.thresholds import load_thresholds, AssumedThresholdWarning


ROOT_DIR = Path(__file__).resolve().parent.parent
OCTO_DIR = ROOT_DIR / "octo"

# Explicit allowlist of (relative_file_path, numeric_value) pairs that coincide
# with a number in rulebook_thresholds.yaml for legitimate mathematical/algorithmic
# reasons (specifically 0.5 in kinetic energy 0.5 * m * v^2 and 0.5 * (r1 + r2)).
ALLOWLIST: set[tuple[str, float]] = {
    ("octo/drivers/orbit.py", 0.5),
    ("octo/drivers/propulsion.py", 0.5),
}


def extract_threshold_numbers(thresholds_dict: dict) -> dict[float, list[str]]:
    """Return mapping of numeric threshold value -> list of threshold keys."""
    value_map: dict[float, list[str]] = {}
    for category, entries in thresholds_dict.items():
        for key, entry in entries.items():
            val = entry["value"]
            if isinstance(val, bool) or not isinstance(val, (int, float)):
                continue
            fval = float(val)
            value_map.setdefault(fval, []).append(f"{category}.{key}")
    return value_map


def find_numeric_literals_in_file(py_file: Path) -> list[tuple[int, float]]:
    """Parse a Python file with `ast` and return (lineno, float_value) for all numeric literals."""
    tree = ast.parse(py_file.read_text(), filename=str(py_file))
    literals: list[tuple[int, float]] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            if isinstance(node.operand, ast.Constant) and isinstance(
                node.operand.value, (int, float)
            ) and not isinstance(node.operand.value, bool):
                sign = -1.0 if isinstance(node.op, ast.USub) else 1.0
                literals.append((node.lineno, sign * float(node.operand.value)))
        elif isinstance(node, ast.Constant) and isinstance(
            node.value, (int, float)
        ) and not isinstance(node.value, bool):
            literals.append((node.lineno, float(node.value)))

    return literals


def find_hardcoded_limit_violations(
    package_dir: Path,
    threshold_numbers: dict[float, list[str]],
    allowlist: set[tuple[str, float]] = ALLOWLIST,
) -> list[str]:
    """Scan all .py files under package_dir and return human-readable violation strings."""
    violations: list[str] = []
    for py_file in sorted(package_dir.rglob("*.py")):
        try:
            rel_path = py_file.relative_to(ROOT_DIR).as_posix()
        except ValueError:
            rel_path = py_file.name

        for lineno, literal_val in find_numeric_literals_in_file(py_file):
            if literal_val in threshold_numbers:
                if (rel_path, literal_val) in allowlist:
                    continue
                keys_str = ", ".join(threshold_numbers[literal_val])
                violations.append(
                    f"{rel_path}:{lineno} contains literal {literal_val!r} matching threshold(s) [{keys_str}]"
                )
    return violations


def test_no_hardcoded_limits_in_octo():
    """Verify no .py file under octo/ hard-codes any numeric value from rulebook_thresholds.yaml."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()

    threshold_numbers = extract_threshold_numbers(thresholds)
    assert len(threshold_numbers) > 0

    violations = find_hardcoded_limit_violations(OCTO_DIR, threshold_numbers, ALLOWLIST)
    assert violations == [], "Hard-coded rulebook limits found in octo/:\n" + "\n".join(
        violations
    )


def test_detector_catches_synthetic_hardcoded_limit(tmp_path: Path):
    """Verify the AST detector catches a stray threshold literal when not allowlisted."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()

    threshold_numbers = extract_threshold_numbers(thresholds)
    bad_file = tmp_path / "bad_driver.py"
    # Inject a known rulebook limit (0.098 m/s^2 max acceleration and 10000 max_years)
    bad_file.write_text("def check(a):\n    return a <= 0.098 and a < 10000\n")

    violations = find_hardcoded_limit_violations(
        tmp_path, threshold_numbers, allowlist=set()
    )
    assert len(violations) == 2
    assert "0.098" in violations[0]
    assert "10000" in violations[1]
