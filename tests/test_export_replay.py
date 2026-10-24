"""Tests for py/export_replay.py: Parquet to results/replay.json exporter (Step 3.4)."""

import importlib.util
import json
from pathlib import Path
import tempfile
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from octo.core import constants

ROOT_DIR = Path(__file__).resolve().parent.parent
_export_replay_path = ROOT_DIR / "py" / "export_replay.py"
_spec = importlib.util.spec_from_file_location("export_replay", _export_replay_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

export_parquet_to_replay_json = _mod.export_parquet_to_replay_json
MAX_REPLAY_FRAMES = _mod.MAX_REPLAY_FRAMES


def _create_mock_parquet(file_path: Path, num_rows: int) -> None:
    """Helper to create a deterministic Parquet telemetry table for testing."""
    times = np.linspace(0.0, 86400.0 * num_rows, num_rows)
    rows = []
    for i, t in enumerate(times):
        rows.append(
            {
                "step_index": i + 1,
                "t_s": float(t),
                "dt_s": 86400.0,
                "audit_pass": True,
                "flags_count": 0,
                "expelled_mass_kg": 0.0,
                "heat_booked_j": 0.0,
                "exhaust_ke_j": 0.0,
                "Earth_r_au": 1.0,
                "Earth_v_km_s": 29.78,
                "Earth_mass_kg": float(constants.M_EARTH),
                "Earth_x_au": float(np.cos(i * 0.01)),
                "Earth_y_au": float(np.sin(i * 0.01)),
                "Sun_x_au": 0.0,
                "Sun_y_au": 0.0,
            }
        )
    table = pa.Table.from_pylist(rows)
    pq.write_table(table, file_path)


def test_export_replay_schema_and_nulls_preserved():
    """Verify exported replay.json satisfies the DRAFT schema and preserves nulls."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pq_in = Path(tmpdir) / "input.parquet"
        json_out = Path(tmpdir) / "replay.json"
        _create_mock_parquet(pq_in, num_rows=10)

        metadata = export_parquet_to_replay_json(pq_in, json_out)

        assert json_out.is_file()
        with open(json_out, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Schema header checks
        assert data["format"] == "OCTO_JSON"
        assert data["version"] == 1
        assert data["status"] == "DRAFT"
        assert data["time_unit"] == "s"
        assert data["length_unit"] == "AU"
        assert data["focus_body_id"] == "Sun"
        assert data["num_frames"] == 10
        assert data["num_bodies"] >= 1

        # Fields not yet produced MUST be null, never invented
        assert data["num_arm_segments"] is None
        assert isinstance(data["frames"], list)
        assert len(data["frames"]) == 10

        first_frame = data["frames"][0]
        assert "time_s" in first_frame
        assert "step_index" in first_frame
        assert "bodies" in first_frame
        assert first_frame["joint_angles_rad"] is None
        assert first_frame["segment_safety_factors"] is None
        assert "flag_count" in first_frame
        assert isinstance(data["flags"], list)


def test_export_replay_frame_cap_at_2000_frames():
    """Verify replay export decimates large runs to at most 2000 frames."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pq_in = Path(tmpdir) / "large.parquet"
        json_out = Path(tmpdir) / "replay.json"
        _create_mock_parquet(pq_in, num_rows=3500)

        export_parquet_to_replay_json(pq_in, json_out)

        with open(json_out, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert data["num_frames"] <= MAX_REPLAY_FRAMES
        assert len(data["frames"]) <= 2000
        # Ensure start and end frames are preserved
        assert data["frames"][0]["step_index"] == 1
        assert data["frames"][-1]["step_index"] == 3500


def test_export_replay_round_trip_positions():
    """Verify body coordinates in exported JSON match the original Parquet values."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pq_in = Path(tmpdir) / "data.parquet"
        json_out = Path(tmpdir) / "replay.json"
        _create_mock_parquet(pq_in, num_rows=25)

        export_parquet_to_replay_json(pq_in, json_out)

        table = pq.read_table(pq_in)
        pydict = table.to_pydict()

        with open(json_out, "r", encoding="utf-8") as f:
            data = json.load(f)

        for i, frame in enumerate(data["frames"]):
            expected_x = pydict["Earth_x_au"][i]
            expected_y = pydict["Earth_y_au"][i]
            assert pytest.approx(frame["bodies"]["Earth"]["x"], abs=1e-7) == expected_x
            assert pytest.approx(frame["bodies"]["Earth"]["y"], abs=1e-7) == expected_y
