"""Tests for Step 2.4: octo/core/recorder.py skeleton (Parquet row writer & DRAFT binary replay writer)."""

from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
import pytest

from octo.core import constants
from octo.core.flags import Flag
from octo.core.state import BodyState, State
from octo.core.recorder import (
    ParquetResultsWriter,
    ReplaySchemaConfig,
    BinaryReplayRecorder,
    REPLAY_SCHEMA_STATUS,
)


def test_parquet_results_writer_writes_and_reads_run_row(tmp_path: Path):
    """ParquetResultsWriter writes one row per run (inputs, outputs, flags, conditions) to Parquet."""
    out_file = tmp_path / "run_0001.parquet"
    writer = ParquetResultsWriter()

    row = {
        "run_id": "run_0001",
        "mode": "averaged",
        "final_semi_major_axis_au": 2.7,
        "energy_rel_drift": 1.2e-12,
        "momentum_rel_drift": 3.4e-13,
        "min_safety_factor": 1.85,
        "unresolved_flag_count": 0,
        "overall_status": "PASS (with unconfirmed thresholds)",
    }
    writer.write_run_row(out_file, row)

    assert out_file.is_file()
    table = pq.read_table(out_file)
    assert table.num_rows == 1
    read_dict = table.to_pylist()[0]
    assert read_dict["run_id"] == "run_0001"
    assert read_dict["final_semi_major_axis_au"] == pytest.approx(2.7)
    assert read_dict["overall_status"] == "PASS (with unconfirmed thresholds)"


def test_draft_replay_recorder_floating_origin_and_scaling(tmp_path: Path):
    """BinaryReplayRecorder is marked DRAFT, configurable, and scales float32 relative to focus body."""
    assert REPLAY_SCHEMA_STATUS == "DRAFT"

    cfg = ReplaySchemaConfig(
        version=1,
        length_unit_m=constants.AU,
        time_unit_s=constants.YEAR,
        focus_body_id="Sun",
        num_arm_segments=8,
    )
    recorder = BinaryReplayRecorder(cfg)

    state = State(t=constants.YEAR)
    state.add_body(
        BodyState(
            name="Sun",
            mass_kg=constants.M_SUN,
            position_m=np.array([1000.0, -500.0, 0.0]),
            velocity_m_s=np.zeros(3),
        )
    )
    state.add_body(
        BodyState(
            name="Earth",
            mass_kg=constants.M_EARTH,
            position_m=np.array([1000.0 + constants.AU, -500.0, 0.0]),
            velocity_m_s=np.zeros(3),
        )
    )

    recorder.record_frame(
        state=state,
        joint_angles_rad=np.zeros(8, dtype=np.float32),
        segment_safety_factors=np.full(8, 2.0, dtype=np.float32),
        ledger_drifts=(1.0e-12, 2.0e-13, 3.0e-13),
        flags=[
            Flag(
                code="POWER_EXCEEDED",
                t=constants.YEAR,
                source="power",
                quantity="power.max_watts",
                value=5.0e21,
                limit=1.0e17,
                enabler_id="E1",
            )
        ],
    )

    replay_path = tmp_path / "test_replay.octo"
    recorder.save(replay_path)
    assert replay_path.is_file()

    parsed = BinaryReplayRecorder.load(replay_path)
    assert parsed["header"]["magic"] == "OCTO"
    assert parsed["header"]["schema_status"] == "DRAFT"
    assert parsed["header"]["num_frames"] == 1
    assert parsed["header"]["num_bodies"] == 2
    assert parsed["header"]["focus_body_id"] == "Sun"

    frame0 = parsed["frames"][0]
    assert frame0["time_scaled"] == pytest.approx(1.0)
    # Focus body ("Sun") relative position must be exactly (0, 0, 0) in float32
    assert np.allclose(frame0["relative_positions_scaled"]["Sun"], [0.0, 0.0, 0.0])
    # Earth relative to Sun scaled by AU must be (1.0, 0.0, 0.0) in float32
    assert np.allclose(frame0["relative_positions_scaled"]["Earth"], [1.0, 0.0, 0.0], atol=1e-6)
    assert len(parsed["trailing_flags"]) == 1
    assert parsed["trailing_flags"][0]["code"] == "POWER_EXCEEDED"
