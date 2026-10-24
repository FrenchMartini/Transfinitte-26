"""Tests for the 10 Participant Guide Section 6 Benchmarks and reports/benchmarks.json export."""

import importlib.util
import json
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent
BENCHMARKS_REPORT_PATH = ROOT_DIR / "reports" / "benchmarks.json"

_gen_path = ROOT_DIR / "py" / "generate_benchmarks.py"
_spec = importlib.util.spec_from_file_location("generate_benchmarks", _gen_path)
_gen_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_gen_mod)
run_and_write_guide_benchmarks = _gen_mod.run_and_write_guide_benchmarks


def test_generate_guide_benchmarks_writes_all_10_benchmarks(tmp_path: Path):
    """Verify Python benchmark runner computes all 10 guide benchmarks and writes reports/benchmarks.json."""
    out_file = tmp_path / "benchmarks.json"
    doc = run_and_write_guide_benchmarks(out_file)

    assert out_file.is_file()
    loaded = json.loads(out_file.read_text(encoding="utf-8"))
    assert loaded == doc

    assert "benchmarks" in loaded
    assert len(loaded["benchmarks"]) == 10
    assert loaded["all_passed"] is True

    ids = [b["id"] for b in loaded["benchmarks"]]
    assert ids == list(range(1, 11))

    for b in loaded["benchmarks"]:
        assert "value" in b
        assert "expected" in b
        assert "tolerance" in b
        assert "source_page" in b
        assert "Page 9" in str(b["source_page"])
        assert b["status"] in ("PASS", "FAIL")
        assert b["passed"] is True
        assert b["status"] == "PASS"


def test_reports_benchmarks_json_exists_and_matches_guide():
    """Verify reports/benchmarks.json exists on disk and passes all 10 benchmarks."""
    assert BENCHMARKS_REPORT_PATH.is_file(), f"Missing {BENCHMARKS_REPORT_PATH}"
    data = json.loads(BENCHMARKS_REPORT_PATH.read_text(encoding="utf-8"))
    assert len(data["benchmarks"]) == 10
    assert data["all_passed"] is True

    # Ensure Benchmark 4 (Kepler e=0.3, 10 periods) and Benchmark 5 (Solar system 5 yr) have real non-zero numerical errors < tol
    b4 = next(b for b in data["benchmarks"] if b["id"] == 4)
    assert b4["value"]["pos_rel_err"] > 0.0
    assert b4["value"]["pos_rel_err"] < 1.0e-6
    assert b4["value"]["energy_rel_err"] < 1.0e-9

    b5 = next(b for b in data["benchmarks"] if b["id"] == 5)
    assert b5["value"] > 0.0
    assert b5["value"] < 1.0e-9
