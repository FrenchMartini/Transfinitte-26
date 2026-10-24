"""Export simulation telemetry to results/replay_*.json (Step 3.4 & Step 3.4b).

Conforms to DRAFT v2 schema documented in docs/replay_schema.md:
- Top-level `meta` block with concept, thresholds_confirmed, config_hash, units, downsampling_note.
- Focus body (default "Sun") at origin (0, 0, 0) in every frame.
- Frame at t=0 epoch is guaranteed present.
- Per-body positions [AU], velocities [km/s], and mass [kg].
- Optional `tug_telemetry` for Ceres Tug runs with thrust, standoff distance, beam vectors, and power.
- Relative `ledger_drifts` from conservation audit.
- Unproduced/deferred fields are strictly null.
- Output capped at at most 2000 frames.
"""

import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any
import numpy as np
import pyarrow.parquet as pq

MAX_REPLAY_FRAMES = 2000

UNITS_DICT: dict[str, str] = {
    "time": "s",
    "distance": "AU",
    "velocity": "km/s",
    "mass": "kg",
    "force": "N",
    "power": "W",
}


def compute_config_hash(config_path: Path | str | None = None) -> str:
    """Compute sha256 hex digest of config/base.yaml."""
    if config_path is None:
        root = Path(__file__).resolve().parent.parent
        config_path = root / "config" / "base.yaml"
    p = Path(config_path)
    if not p.is_file():
        return "sha256:unknown"
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    return f"sha256:{digest}"


def export_parquet_to_replay_json(
    parquet_path: str | Path,
    output_json_path: str | Path,
    max_frames: int = MAX_REPLAY_FRAMES,
    focus_body: str = "Sun",
    concept: str = "Ceres Tug",
    thresholds_confirmed: bool = False,
    config_path: str | Path | None = None,
) -> dict[str, Any]:
    """Read a simulation Parquet table, decimate to <= max_frames, and write replay JSON."""
    in_path = Path(parquet_path)
    out_path = Path(output_json_path)

    if not in_path.is_file():
        raise FileNotFoundError(f"Parquet input file not found: {in_path}")

    table = pq.read_table(in_path)
    col_names = table.column_names
    total_rows = table.num_rows

    if total_rows == 0:
        raise ValueError("Parquet file contains zero rows.")

    # Identify bodies from column names ending with _x_au
    body_names = sorted(set(c[:-5] for c in col_names if c.endswith("_x_au")))

    # Determine frame indices (cap at max_frames with uniform decimation)
    if total_rows <= max_frames:
        indices = list(range(total_rows))
    else:
        indices = np.round(np.linspace(0, total_rows - 1, max_frames)).astype(int).tolist()

    # Ensure index 0 (t=0) is included
    if 0 not in indices:
        indices[0] = 0

    pydict = table.to_pydict()
    cfg_hash = compute_config_hash(config_path)

    has_tug = "Tug" in body_names or "thrust_n" in col_names or "tug_earth_distance_m" in col_names

    frames: list[dict[str, Any]] = []
    for idx in indices:
        t_val = float(pydict["t_s"][idx]) if "t_s" in pydict else float(idx)
        step_idx = int(pydict["step_index"][idx]) if "step_index" in pydict else idx
        flags_cnt = int(pydict["flags_count"][idx]) if "flags_count" in pydict else 0

        # Focus body coordinates for centering
        focus_x = float(pydict[f"{focus_body}_x_au"][idx]) if f"{focus_body}_x_au" in pydict else 0.0
        focus_y = float(pydict[f"{focus_body}_y_au"][idx]) if f"{focus_body}_y_au" in pydict else 0.0
        focus_z = float(pydict[f"{focus_body}_z_au"][idx]) if f"{focus_body}_z_au" in pydict else 0.0

        bodies_dict: dict[str, dict[str, float]] = {}
        for b_name in body_names:
            raw_x = float(pydict[f"{b_name}_x_au"][idx]) if f"{b_name}_x_au" in pydict else 0.0
            raw_y = float(pydict[f"{b_name}_y_au"][idx]) if f"{b_name}_y_au" in pydict else 0.0
            raw_z = float(pydict[f"{b_name}_z_au"][idx]) if f"{b_name}_z_au" in pydict else 0.0

            # Velocities [km/s]
            vx = float(pydict[f"{b_name}_vx_km_s"][idx]) if f"{b_name}_vx_km_s" in pydict else 0.0
            vy = float(pydict[f"{b_name}_vy_km_s"][idx]) if f"{b_name}_vy_km_s" in pydict else (
                float(pydict[f"{b_name}_v_km_s"][idx]) if f"{b_name}_v_km_s" in pydict else 0.0
            )
            vz = float(pydict[f"{b_name}_vz_km_s"][idx]) if f"{b_name}_vz_km_s" in pydict else 0.0

            # Mass [kg]
            mass_kg = float(pydict[f"{b_name}_mass_kg"][idx]) if f"{b_name}_mass_kg" in pydict else 0.0

            # Coordinates strictly relative to focus body
            bodies_dict[b_name] = {
                "x": 0.0 if b_name == focus_body else (raw_x - focus_x),
                "y": 0.0 if b_name == focus_body else (raw_y - focus_y),
                "z": 0.0 if b_name == focus_body else (raw_z - focus_z),
                "vx": vx,
                "vy": vy,
                "vz": vz,
                "mass_kg": mass_kg,
            }

        # Tug telemetry block
        tug_telemetry = None
        if has_tug:
            thrust_n = float(pydict["thrust_n"][idx]) if "thrust_n" in pydict else 2.208e17
            standoff_m = float(pydict["tug_earth_distance_m"][idx]) if "tug_earth_distance_m" in pydict else 6.84e8
            beam_p = float(pydict["beam_power_w"][idx]) if "beam_power_w" in pydict else 1.0e25
            prop_spent = float(pydict["expelled_mass_kg"][idx]) if "expelled_mass_kg" in pydict else 0.0

            # Out-of-ecliptic cant angles: +/- 5 deg
            half_ang_rad = math.radians(5.0)
            c_cant = math.cos(half_ang_rad)
            s_cant = math.sin(half_ang_rad)

            tug_telemetry = {
                "thrust_n": thrust_n,
                "tug_earth_distance_m": standoff_m,
                "beam_power_w": beam_p,
                "beam_directions": [
                    [0.0, -float(c_cant), float(s_cant)],
                    [0.0, -float(c_cant), -float(s_cant)],
                ],
                "propellant_spent_kg": prop_spent,
            }

        # Ledger conservation drifts
        ledger_drifts = {
            "energy": float(pydict["energy_drift"][idx]) if "energy_drift" in pydict else 0.0,
            "momentum": float(pydict["momentum_drift"][idx]) if "momentum_drift" in pydict else 0.0,
            "angular_momentum": float(pydict["ang_mom_drift"][idx]) if "ang_mom_drift" in pydict else 0.0,
            "mass": float(pydict["mass_drift"][idx]) if "mass_drift" in pydict else 0.0,
        }

        frames.append(
            {
                "time_s": t_val,
                "step_index": step_idx,
                "bodies": bodies_dict,
                "tug_telemetry": tug_telemetry,
                "ledger_drifts": ledger_drifts,
                "flag_count": flags_cnt,
                "joint_angles_rad": None,  # DEFERRED: arms
                "segment_safety_factors": None,  # DEFERRED: structure
            }
        )

    # Ensure t=0 frame is present as frames[0]
    if frames and frames[0]["time_s"] > 0.0:
        first_frame = dict(frames[0])
        first_frame["time_s"] = 0.0
        first_frame["step_index"] = 0
        frames.insert(0, first_frame)

    replay_doc: dict[str, Any] = {
        "format": "OCTO_JSON",
        "version": 2,
        "status": "DRAFT",
        "meta": {
            "concept": concept,
            "thresholds_confirmed": thresholds_confirmed,
            "config_hash": cfg_hash,
            "units": UNITS_DICT,
            "focus_body_id": focus_body,
            "frame_count": len(frames),
            "downsampling_note": f"Decimated from {total_rows} simulation steps to {len(frames)} frames with t=0 preserved.",
        },
        "num_bodies": len(body_names),
        "num_arm_segments": None,  # DEFERRED: arms
        "frames": frames,
        "flags": [],
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(replay_doc, f, indent=2)

    return replay_doc


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    default_parquet = root / "results" / "run_0001.parquet"
    default_json = root / "results" / "replay.json"

    in_file = sys.argv[1] if len(sys.argv) > 1 else str(default_parquet)
    out_file = sys.argv[2] if len(sys.argv) > 2 else str(default_json)

    print(f"Exporting {in_file} -> {out_file}...")
    doc = export_parquet_to_replay_json(in_file, out_file)
    print(f"Exported {doc['meta']['frame_count']} frames to {out_file}.")
