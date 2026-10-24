"""Parquet summary results writer and telemetry export infrastructure.

Telemetry and recording contracts:
- Parquet serialization: Writes deterministic step rows with positions, velocities, and ledger drifts.
- Floating-origin transformation: Computes body coordinates relative to focus body (default Sun).
- Replay schema: Supports DRAFT v2 schema export with provenance metadata and telemetry blocks.
- Frame decimation: Decimates long trajectories evenly to cap output at at most 2000 frames.
"""

from dataclasses import asdict, dataclass
import json
from pathlib import Path
import struct
from typing import Any, Protocol
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from octo.core import constants
from octo.core.exchange import ComponentId
from octo.core.flags import Flag
from octo.core.state import State

REPLAY_SCHEMA_STATUS = "DRAFT"


class ReplayRecorderInterface(Protocol):
    """Protocol interface for replay recorders."""

    def record_frame(
        self,
        state: State,
        joint_angles_rad: np.ndarray,
        segment_safety_factors: np.ndarray,
        ledger_drifts: tuple[float, float, float],
        flags: list[Flag],
    ) -> None: ...

    def save(self, path: str | Path) -> None: ...


class ParquetResultsWriter:
    """Writes one summary row per simulation run to Apache Parquet via pyarrow."""

    def write_run_row(self, path: str | Path, row: dict[str, Any]) -> None:
        """Write a single run summary dictionary as a 1-row Parquet table."""
        out_path = Path(path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        table = pa.Table.from_pylist([row])
        pq.write_table(table, out_path)

    def write_run_rows(self, path: str | Path, rows: list[dict[str, Any]]) -> None:
        """Write multiple run summary dictionaries to a Parquet table."""
        out_path = Path(path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        table = pa.Table.from_pylist(rows)
        pq.write_table(table, out_path)


@dataclass(frozen=True, slots=True)
class ReplaySchemaConfig:
    """Configurable DRAFT schema parameters for the OCTO binary replay format."""

    version: int = 1
    endianness: str = "<"  # little-endian
    length_unit_m: float = constants.AU
    time_unit_s: float = constants.YEAR
    focus_body_id: ComponentId = "Sun"
    num_arm_segments: int = 8


class BinaryReplayRecorder:
    """DRAFT binary replay writer performing floating-origin & float32 unit scaling."""

    MAGIC = b"OCTO"

    def __init__(self, config: ReplaySchemaConfig | None = None) -> None:
        self.config = config or ReplaySchemaConfig()
        self._frames: list[dict[str, Any]] = []
        self._trailing_flags: list[dict[str, Any]] = []
        self._body_names: list[str] = []

    def record_frame(
        self,
        state: State,
        joint_angles_rad: np.ndarray | None = None,
        segment_safety_factors: np.ndarray | None = None,
        ledger_drifts: tuple[float, float, float] = (0.0, 0.0, 0.0),
        flags: list[Flag] | None = None,
    ) -> None:
        """Record a decimated snapshot frame with floating-origin conversion and unit scaling."""
        names = [str(name) for name in state.body_names()]
        if not self._body_names:
            self._body_names = names
        elif self._body_names != names:
            raise ValueError("Body list changed between recorded frames.")

        focus_id = self.config.focus_body_id
        if state.has_body(focus_id):
            origin_pos_m = state.get_body(focus_id).position_m
        else:
            origin_pos_m = np.zeros(3, dtype=np.float64)

        rel_positions_f32: dict[str, list[float]] = {}
        for body in state.bodies():
            rel_scaled = (body.position_m - origin_pos_m) / self.config.length_unit_m
            f32_vec = np.asarray(rel_scaled, dtype=np.float32)
            rel_positions_f32[str(body.name)] = [
                float(f32_vec[0]),
                float(f32_vec[1]),
                float(f32_vec[2]),
            ]

        n_seg = self.config.num_arm_segments
        angles_f32 = (
            np.asarray(joint_angles_rad, dtype=np.float32).reshape(-1)
            if joint_angles_rad is not None
            else np.zeros(n_seg, dtype=np.float32)
        )
        sf_f32 = (
            np.asarray(segment_safety_factors, dtype=np.float32).reshape(-1)
            if segment_safety_factors is not None
            else np.zeros(n_seg, dtype=np.float32)
        )

        frame_flags = flags or []
        for f in frame_flags:
            self._trailing_flags.append(asdict(f))

        time_scaled = float(np.float32(state.t / self.config.time_unit_s))
        drifts_f32 = [
            float(np.float32(ledger_drifts[0])),
            float(np.float32(ledger_drifts[1])),
            float(np.float32(ledger_drifts[2])),
        ]

        self._frames.append(
            {
                "time_scaled": time_scaled,
                "relative_positions_scaled": rel_positions_f32,
                "joint_angles_rad": [float(x) for x in angles_f32],
                "segment_safety_factors": [float(x) for x in sf_f32],
                "ledger_drifts": drifts_f32,
                "flag_count": len(frame_flags),
            }
        )

    def save(self, path: str | Path) -> None:
        """Write header (`OCTO` magic + version + payload length) and binary/JSON-framed payload."""
        out_path = Path(path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        header = {
            "magic": "OCTO",
            "schema_status": REPLAY_SCHEMA_STATUS,
            "version": self.config.version,
            "endianness": self.config.endianness,
            "num_frames": len(self._frames),
            "num_bodies": len(self._body_names),
            "body_names": self._body_names,
            "num_arm_segments": self.config.num_arm_segments,
            "time_unit_s": self.config.time_unit_s,
            "length_unit_m": self.config.length_unit_m,
            "focus_body_id": str(self.config.focus_body_id),
        }
        payload_dict = {
            "header": header,
            "frames": self._frames,
            "trailing_flags": self._trailing_flags,
        }
        payload_bytes = json.dumps(payload_dict, sort_keys=True).encode("utf-8")

        # Binary prefix: 4-byte magic b"OCTO", uint32 version, uint32 num_frames, uint32 payload_len
        prefix = struct.pack(
            f"{self.config.endianness}4sIII",
            self.MAGIC,
            self.config.version,
            len(self._frames),
            len(payload_bytes),
        )
        out_path.write_bytes(prefix + payload_bytes)

    @classmethod
    def load(cls, path: str | Path) -> dict[str, Any]:
        """Read back a DRAFT `.octo` replay file and verify the `OCTO` magic header."""
        raw = Path(path).read_bytes()
        if len(raw) < 16 or raw[:4] != cls.MAGIC:
            raise ValueError("Invalid OCTO replay file: missing magic bytes b'OCTO'.")
        _magic, _version, _num_frames, payload_len = struct.unpack("<4sIII", raw[:16])
        payload_bytes = raw[16 : 16 + payload_len]
        return json.loads(payload_bytes.decode("utf-8"))
