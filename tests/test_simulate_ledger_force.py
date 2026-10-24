"""Tests for Item 3: Force on Earth in simulate.py must come from the booked gravity Exchange in Ledger."""

import importlib.util
import math
from pathlib import Path
import numpy as np
import pytest

from octo.core import constants

ROOT_DIR = Path(__file__).resolve().parent.parent
_sim_path = ROOT_DIR / "py" / "simulate.py"
_spec = importlib.util.spec_from_file_location("simulate_mod", _sim_path)
_sim_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sim_mod)
run_full_spiral_simulation = _sim_mod.run_full_spiral_simulation


def test_simulate_applies_booked_gravity_exchange_force_every_step(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Verify simulate.py books G*M_earth*M_tug/d0^2 and applies the exact Ledger force every step."""
    monkeypatch.setattr(_sim_mod, "RESULTS_DIR", tmp_path)

    res = run_full_spiral_simulation(
        target_radius_au=1.0005,
        dt_days=10.0,
        coast_years=0.1,
        downsample_frames=50,
    )

    assert "step_force_audit" in res
    force_audit = res["step_force_audit"]
    assert len(force_audit) > 10

    m_earth = constants.M_EARTH
    m_tug = 9.4e20
    d0 = 1.2701e9
    expected_f_pull = (constants.G * m_earth * m_tug) / (d0 ** 2)

    active_steps = [row for row in force_audit if not row["is_coast"]]
    coast_steps = [row for row in force_audit if row["is_coast"]]
    assert len(active_steps) > 5
    assert len(coast_steps) > 0

    for row in active_steps:
        booked_vec = np.array(row["booked_force_vec_n"], dtype=np.float64)
        applied_vec = np.array(row["applied_force_vec_n"], dtype=np.float64)
        # Applied force on Earth must equal booked force in Ledger at every step
        assert np.allclose(applied_vec, booked_vec, rtol=0.0, atol=1.0e-6)
        # Magnitude must be gravitational pull F_pull = G*M_earth*M_tug/d0^2 (not F_eff)
        booked_mag = float(np.linalg.norm(booked_vec))
        assert pytest.approx(booked_mag, rel=1.0e-12) == expected_f_pull

    for row in coast_steps:
        booked_vec = np.array(row["booked_force_vec_n"], dtype=np.float64)
        applied_vec = np.array(row["applied_force_vec_n"], dtype=np.float64)
        assert np.allclose(applied_vec, booked_vec, rtol=0.0, atol=1.0e-12)
        assert float(np.linalg.norm(applied_vec)) == 0.0
