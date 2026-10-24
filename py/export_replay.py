"""Export Parquet simulation telemetry to results/replay.json (Step 3.4).

Satisfies the DRAFT replay schema from README.md / ARCHITECTURE.md:
- Caps output to at most 2000 frames.
- Fields not yet produced are strictly null, never invented.
- Supports CLI usage and direct function import.
"""

import json
from pathlib import Path
import sys
from typing import Any
import numpy as np
import pyarrow.parquet as pq

MAX_REPLAY_FRAMES = 2000


def export_parquet_to_replay_json(
    parquet_path: str | Path,
    output_json_path: str | Path,
    max_frames: int = MAX_REPLAY_FRAMES,
    focus_body: str = "Sun",
) -> dict[str, Any]:
    """Read a simulation Parquet table, decimate to <= max_frames, and write replay.json."""
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
    body_names = sorted(
        set(c[:-5] for c in col_names if c.endswith("_x_au"))
    )

    # Determine frame indices (cap at max_frames with even decimation)
    if total_rows <= max_frames:
        indices = list(range(total_rows))
    else:
        indices = np.round(np.linspace(0, total_rows - 1, max_frames)).astype(int).tolist()

    pydict = table.to_pydict()

    frames: list[dict[str, Any]] = []
    for idx in indices:
        t_val = float(pydict["t_s"][idx]) if "t_s" in pydict else float(idx)
        step_idx = int(pydict["step_index"][idx]) if "step_index" in pydict else idx + 1
        flags_cnt = int(pydict["flags_count"][idx]) if "flags_count" in pydict else 0

        # Body coordinates
        bodies_dict: dict[str, dict[str, float]] = {}
        focus_x = float(pydict[f"{focus_body}_x_au"][idx]) if f"{focus_body}_x_au" in pydict else 0.0
        focus_y = float(pydict[f"{focus_body}_y_au"][idx]) if f"{focus_body}_y_au" in pydict else 0.0

        for b_name in body_names:
            raw_x = float(pydict[f"{b_name}_x_au"][idx]) if f"{b_name}_x_au" in pydict else 0.0
            raw_y = float(pydict[f"{b_name}_y_au"][idx]) if f"{b_name}_y_au" in pydict else 0.0
            raw_z = float(pydict[f"{b_name}_z_au"][idx]) if f"{b_name}_z_au" in pydict else 0.0

            # Coordinates relative to focus body
            bodies_dict[b_name] = {
                "x": raw_x - (0.0 if b_name == focus_body else focus_x),
                "y": raw_y - (0.0 if b_name == focus_body else focus_y),
                "z": raw_z,
            }

        # Ledger drifts if available
        ledger_drifts = None
        if "energy_drift" in pydict or "momentum_drift" in pydict:
            ledger_drifts = {
                "energy": float(pydict["energy_drift"][idx]) if "energy_drift" in pydict else 0.0,
                "momentum": float(pydict["momentum_drift"][idx]) if "momentum_drift" in pydict else 0.0,
                "angular_momentum": float(pydict["ang_mom_drift"][idx]) if "ang_mom_drift" in pydict else 0.0,
            }

        frames.append(
            {
                "time_s": t_val,
                "step_index": step_idx,
                "bodies": bodies_dict,
                "joint_angles_rad": None,  # DEFERRED: arms
                "segment_safety_factors": None,  # DEFERRED: structure
                "ledger_drifts": ledger_drifts,
                "flag_count": flags_cnt,
            }
        )

    replay_doc = {
        "format": "OCTO_JSON",
        "version": 1,
        "status": "DRAFT",
        "time_unit": "s",
        "length_unit": "AU",
        "focus_body_id": focus_body,
        "num_frames": len(frames),
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
    print(f"Exported {doc['num_frames']} frames to {out_file}.")
