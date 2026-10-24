"""Tests for py/export_replay.py: Parquet to results/replay_*.json exporter (Step 3.4 & Step 3.4b DRAFT v2)."""

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


def _create_mock_parquet(file_path: Path, num_rows: int, has_tug: bool = False) -> None:
    """Helper to create a deterministic Parquet telemetry table for testing."""
    dt = 86400.0
    times = [i * dt for i in range(num_rows)]
    rows = []
    mu_sun = constants.GM_SUN
    r1 = constants.AU
    v1_kms = np.sqrt(mu_sun / r1) / 1000.0

    for i, t in enumerate(times):
        theta = (v1_kms * 1000.0 / r1) * t
        r_au = 1.0 + 0.0001 * (t / (86400.0 * 365.25))
        x_au = r_au * np.cos(theta)
        y_au = r_au * np.sin(theta)
        vx_kms = -v1_kms * np.sin(theta)
        vy_kms = v1_kms * np.cos(theta)

        row = {
            "step_index": i,
            "t_s": float(t),
            "dt_s": dt,
            "audit_pass": True,
            "flags_count": 0,
            "expelled_mass_kg": 100.0 * i,
            "heat_booked_j": 1e12 * i,
            "exhaust_ke_j": 1e15 * i,
            "energy_drift": 1e-12,
            "momentum_drift": 1e-12,
            "ang_mom_drift": 1e-12,
            "mass_drift": 1e-15,
            "Earth_r_au": r_au,
            "Earth_v_km_s": v1_kms,
            "Earth_mass_kg": float(constants.M_EARTH),
            "Earth_x_au": float(x_au),
            "Earth_y_au": float(y_au),
            "Earth_z_au": 0.0,
            "Earth_vx_km_s": float(vx_kms),
            "Earth_vy_km_s": float(vy_kms),
            "Earth_vz_km_s": 0.0,
            "Sun_x_au": 0.0,
            "Sun_y_au": 0.0,
            "Sun_z_au": 0.0,
            "Sun_vx_km_s": 0.0,
            "Sun_vy_km_s": 0.0,
            "Sun_vz_km_s": 0.0,
            "Sun_mass_kg": float(constants.GM_SUN / constants.G),
        }

        if has_tug:
            row["Tug_x_au"] = float(x_au)
            row["Tug_y_au"] = float(y_au + 1.2701e9 / constants.AU)
            row["Tug_z_au"] = 0.0
            row["Tug_vx_km_s"] = float(vx_kms)
            row["Tug_vy_km_s"] = float(vy_kms)
            row["Tug_vz_km_s"] = 0.0
            row["Tug_mass_kg"] = float(9.4e20 - 100.0 * i)
            row["thrust_n"] = 2.357952e17
            row["tug_earth_distance_m"] = 1.2701e9
            row["beam_power_w"] = 1.0e25

        rows.append(row)

    table = pa.Table.from_pylist(rows)
    pq.write_table(table, file_path)


def test_export_replay_schema_draft_v2_and_meta():
    """Verify exported replay.json satisfies the DRAFT v2 schema with full meta block."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pq_in = Path(tmpdir) / "input.parquet"
        json_out = Path(tmpdir) / "replay.json"
        _create_mock_parquet(pq_in, num_rows=10, has_tug=True)

        metadata = export_parquet_to_replay_json(
            pq_in,
            json_out,
            concept="Ceres Tug",
            thresholds_confirmed=False,
        )

        assert json_out.is_file()
        with open(json_out, "r", encoding="utf-8") as f:
            data = json.load(f)

        # 1. Schema header checks
        assert data["format"] == "OCTO_JSON"
        assert data["version"] == 2
        assert data["status"] == "DRAFT"
        assert "meta" in data

        meta = data["meta"]
        assert meta["concept"] == "Ceres Tug"
        assert meta["thresholds_confirmed"] is False
        assert meta["config_hash"].startswith("sha256:")
        assert "units" in meta
        assert meta["units"]["time"] == "s"
        assert meta["units"]["distance"] == "AU"
        assert meta["units"]["velocity"] == "km/s"
        assert meta["units"]["force"] == "N"
        assert meta["units"]["power"] == "W"
        assert meta["focus_body_id"] == "Sun"
        assert meta["frame_count"] == 10
        assert "downsampling_note" in meta

        # 2. Deferred fields strictly null
        assert data["num_arm_segments"] is None
        assert isinstance(data["frames"], list)
        assert len(data["frames"]) == 10

        first_frame = data["frames"][0]
        assert first_frame["time_s"] == 0.0
        assert first_frame["step_index"] == 0
        assert "bodies" in first_frame
        assert first_frame["joint_angles_rad"] is None
        assert first_frame["segment_safety_factors"] is None
        assert "flag_count" in first_frame
        assert isinstance(data["flags"], list)

        # 3. Focus body at origin
        assert first_frame["bodies"]["Sun"]["x"] == 0.0
        assert first_frame["bodies"]["Sun"]["y"] == 0.0
        assert first_frame["bodies"]["Sun"]["z"] == 0.0

        # 4. Tug telemetry populated
        assert first_frame["tug_telemetry"] is not None
        assert first_frame["tug_telemetry"]["thrust_n"] == 2.357952e17
        assert first_frame["tug_telemetry"]["beam_power_w"] == 1.0e25
        assert len(first_frame["tug_telemetry"]["beam_directions"]) == 2

        # 5. Ledger drifts populated
        assert first_frame["ledger_drifts"] is not None
        assert "energy" in first_frame["ledger_drifts"]
        assert "momentum" in first_frame["ledger_drifts"]


def test_focus_body_at_origin_in_all_frames():
    """Focus body (Sun) is identically at (0, 0, 0) across all exported frames."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pq_in = Path(tmpdir) / "input.parquet"
        json_out = Path(tmpdir) / "replay.json"
        _create_mock_parquet(pq_in, num_rows=50)

        export_parquet_to_replay_json(pq_in, json_out)

        with open(json_out, "r", encoding="utf-8") as f:
            data = json.load(f)

        for frame in data["frames"]:
            sun = frame["bodies"]["Sun"]
            assert sun["x"] == 0.0
            assert sun["y"] == 0.0
            assert sun["z"] == 0.0


def test_t0_frame_is_guaranteed_present():
    """Verify that t=0 frame is always present as the first frame."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pq_in = Path(tmpdir) / "input.parquet"
        json_out = Path(tmpdir) / "replay.json"
        _create_mock_parquet(pq_in, num_rows=20)

        export_parquet_to_replay_json(pq_in, json_out)

        with open(json_out, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert data["frames"][0]["time_s"] == 0.0


def test_export_replay_frame_cap_at_2000_frames():
    """Verify replay export decimates large runs to at most 2000 frames."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pq_in = Path(tmpdir) / "large.parquet"
        json_out = Path(tmpdir) / "replay.json"
        _create_mock_parquet(pq_in, num_rows=3500)

        export_parquet_to_replay_json(pq_in, json_out)

        with open(json_out, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert data["meta"]["frame_count"] <= MAX_REPLAY_FRAMES
        assert len(data["frames"]) <= 2000


def test_velocity_consistency_against_position_differences():
    """Verify velocity vectors match finite differences of positions within orbital tolerance."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pq_in = Path(tmpdir) / "data.parquet"
        json_out = Path(tmpdir) / "replay.json"
        _create_mock_parquet(pq_in, num_rows=50)

        export_parquet_to_replay_json(pq_in, json_out)

        with open(json_out, "r", encoding="utf-8") as f:
            data = json.load(f)

        frames = data["frames"]
        # Check finite difference between frame 0 and frame 1
        f0 = frames[0]
        f1 = frames[1]
        dt = f1["time_s"] - f0["time_s"]
        assert dt > 0.0

        # Earth dx in km: AU -> km is * 149597870.7
        dx_km = (f1["bodies"]["Earth"]["x"] - f0["bodies"]["Earth"]["x"]) * (constants.AU / 1000.0)
        dy_km = (f1["bodies"]["Earth"]["y"] - f0["bodies"]["Earth"]["y"]) * (constants.AU / 1000.0)
        vx_num = dx_km / dt
        vy_num = dy_km / dt

        vx_frame = f0["bodies"]["Earth"]["vx"]
        vy_frame = f0["bodies"]["Earth"]["vy"]

        # Finite difference should match frame velocity within 5% for circular orbit with 1-day step
        assert pytest.approx(vx_num, rel=0.05) == vx_frame or abs(vx_num - vx_frame) < 0.5
        assert pytest.approx(vy_num, rel=0.05) == vy_frame or abs(vy_num - vy_frame) < 0.5


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


def test_frame0_matches_initial_config_state():
    """Verify frame 0 positions and velocities equal the initial config state even when Parquet starts at t > 0."""
    import yaml

    config_path = ROOT_DIR / "config" / "base.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    r0_au = float(cfg["initial_conditions"]["semi_major_axis_au"])
    v0_kms = float(np.sqrt(constants.GM_SUN / (r0_au * constants.AU)) / 1000.0)
    d0_au = float(cfg["ceres_tug"]["standoff_distance_m"]) / constants.AU

    # 1. Test with a Parquet file whose first row is at t = 10 days (864000 s)
    with tempfile.TemporaryDirectory() as tmpdir:
        pq_in = Path(tmpdir) / "started_at_10d.parquet"
        json_out = Path(tmpdir) / "replay.json"
        _create_mock_parquet(pq_in, num_rows=15, has_tug=True)
        # Drop index 0 so the parquet starts at step 1 (t = 86400 s)
        table = pq.read_table(pq_in).slice(1)
        pq.write_table(table, pq_in)

        export_parquet_to_replay_json(pq_in, json_out, config_path=config_path)

        with open(json_out, "r", encoding="utf-8") as f:
            doc = json.load(f)

        f0 = doc["frames"][0]
        assert f0["time_s"] == 0.0
        assert f0["step_index"] == 0
        assert pytest.approx(f0["bodies"]["Earth"]["x"], rel=1e-9) == r0_au
        assert pytest.approx(f0["bodies"]["Earth"]["y"], abs=1e-9) == 0.0
        assert pytest.approx(f0["bodies"]["Earth"]["vx"], abs=1e-9) == 0.0
        assert pytest.approx(f0["bodies"]["Earth"]["vy"], rel=1e-6) == v0_kms
        assert pytest.approx(f0["bodies"]["Tug"]["x"], rel=1e-9) == r0_au
        assert pytest.approx(f0["bodies"]["Tug"]["y"], rel=1e-6) == d0_au

    # 2. Check actual exported results/replay_ceres_tug.json
    tug_replay_path = ROOT_DIR / "results" / "replay_ceres_tug.json"
    if tug_replay_path.is_file():
        with open(tug_replay_path, "r", encoding="utf-8") as f:
            tug_doc = json.load(f)
        f0_real = tug_doc["frames"][0]
        assert f0_real["time_s"] == 0.0
        assert pytest.approx(f0_real["bodies"]["Earth"]["x"], rel=1e-9) == r0_au
        assert pytest.approx(f0_real["bodies"]["Earth"]["y"], abs=1e-9) == 0.0
        assert pytest.approx(f0_real["bodies"]["Earth"]["vx"], abs=1e-9) == 0.0
        assert pytest.approx(f0_real["bodies"]["Earth"]["vy"], rel=1e-6) == v0_kms


def test_heliocentric_frame_sun_velocity_zero_and_velocities_relative_to_sun():
    """Verify both positions and velocities are heliocentric, and Sun velocity is identically zero."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pq_in = Path(tmpdir) / "barycentric.parquet"
        json_out = Path(tmpdir) / "replay.json"
        _create_mock_parquet(pq_in, num_rows=10, has_tug=True)

        # Inject non-zero barycentric Sun position and velocity
        table = pq.read_table(pq_in)
        pydict = table.to_pydict()
        n = len(pydict["t_s"])
        sun_vx = 0.015
        sun_vy = -0.008
        sun_vz = 0.001
        pydict["Sun_x_au"] = [0.0002] * n
        pydict["Sun_y_au"] = [-0.0001] * n
        pydict["Sun_vx_km_s"] = [sun_vx] * n
        pydict["Sun_vy_km_s"] = [sun_vy] * n
        pydict["Sun_vz_km_s"] = [sun_vz] * n
        orig_earth_vx = list(pydict["Earth_vx_km_s"])
        orig_earth_vy = list(pydict["Earth_vy_km_s"])

        pq.write_table(pa.Table.from_pydict(pydict), pq_in)

        export_parquet_to_replay_json(pq_in, json_out)
        with open(json_out, "r", encoding="utf-8") as f:
            doc = json.load(f)

        for i, frame in enumerate(doc["frames"]):
            sun = frame["bodies"]["Sun"]
            assert sun["x"] == 0.0
            assert sun["y"] == 0.0
            assert sun["z"] == 0.0
            assert sun["vx"] == 0.0
            assert sun["vy"] == 0.0
            assert sun["vz"] == 0.0

            earth = frame["bodies"]["Earth"]
            assert pytest.approx(earth["vx"], abs=1e-12) == orig_earth_vx[i] - sun_vx
            assert pytest.approx(earth["vy"], abs=1e-12) == orig_earth_vy[i] - sun_vy
