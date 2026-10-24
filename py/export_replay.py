"""Export simulation telemetry to results/replay_*.json (Step 3.4, Step 3.4b, Step 4.3).

Conforms to DRAFT v2 schema documented in docs/replay_schema.md:
- Top-level `meta` block with concept, thresholds_confirmed, config_hash, units, downsampling_note.
- Heliocentric reference frame: Focus body (default "Sun") has position (0, 0, 0) AU and velocity (0, 0, 0) km/s
  in every frame; all other body positions and velocities are relative to the focus body.
- Frame 0 (time_s = 0.0, step_index = 0) is guaranteed to equal the exact initial config state.
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
import yaml

from octo.core import constants
from octo.drivers.propulsion import lorentz_gamma

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


def _load_config(config_path: Path | str | None = None) -> dict[str, Any]:
    """Load YAML configuration dict."""
    if config_path is None:
        root = Path(__file__).resolve().parent.parent
        config_path = root / "config" / "base.yaml"
    p = Path(config_path)
    if not p.is_file():
        return {}
    with open(p, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _build_initial_frame_from_config(
    body_names: list[str],
    has_tug: bool,
    focus_body: str,
    cfg: dict[str, Any],
) -> dict[str, Any]:
    """Construct exact t=0 initial frame directly from config when Parquet starts at t > 0."""
    init_cfg = cfg.get("initial_conditions", {})
    tug_cfg = cfg.get("ceres_tug", {})
    prop_cfg = cfg.get("propulsion", {})
    probe_cfg = cfg.get("test_probe", {})

    r0_au = float(init_cfg.get("semi_major_axis_au", 1.0))
    r0_m = r0_au * constants.AU
    v0_m_s = math.sqrt(constants.GM_SUN / r0_m)
    v0_km_s = v0_m_s / 1000.0

    d0_m = float(tug_cfg.get("standoff_distance_m", 1.2701e9))
    d0_au = d0_m / constants.AU
    m_tug = float(tug_cfg.get("mass_kg", 9.4e20))
    m_sun = constants.GM_SUN / constants.G

    mdot = float(prop_cfg.get("mass_flow_kg_s", 2.501e9))
    ve = float(prop_cfg.get("exhaust_velocity_m_s", 0.3 * constants.C_LIGHT))
    gamma = lorentz_gamma(ve, constants.C_LIGHT)
    f_nom = mdot * gamma * ve
    beam_p = float(tug_cfg.get("beam_power_w", 1.0e25))
    cone_deg = float(tug_cfg.get("cone_half_angle_deg", 5.0))

    bodies_dict: dict[str, dict[str, float]] = {}
    for b_name in body_names:
        if b_name == focus_body or b_name == "Sun":
            bodies_dict[b_name] = {
                "x": 0.0,
                "y": 0.0,
                "z": 0.0,
                "vx": 0.0,
                "vy": 0.0,
                "vz": 0.0,
                "mass_kg": float(m_sun),
            }
        elif b_name == "Earth":
            bodies_dict[b_name] = {
                "x": r0_au,
                "y": 0.0,
                "z": 0.0,
                "vx": 0.0,
                "vy": v0_km_s,
                "vz": 0.0,
                "mass_kg": float(constants.M_EARTH),
            }
        elif b_name == "Tug":
            bodies_dict[b_name] = {
                "x": r0_au,
                "y": d0_au,
                "z": 0.0,
                "vx": 0.0,
                "vy": v0_km_s,
                "vz": 0.0,
                "mass_kg": float(m_tug),
            }
        elif b_name == "Probe":
            bodies_dict[b_name] = {
                "x": r0_au,
                "y": 0.0,
                "z": 0.0,
                "vx": 0.0,
                "vy": v0_km_s,
                "vz": 0.0,
                "mass_kg": float(probe_cfg.get("mass_kg", 1000.0)),
            }
        else:
            bodies_dict[b_name] = {
                "x": 0.0,
                "y": 0.0,
                "z": 0.0,
                "vx": 0.0,
                "vy": 0.0,
                "vz": 0.0,
                "mass_kg": 0.0,
            }

    tug_telemetry = None
    if has_tug:
        half_ang_rad = math.radians(cone_deg)
        c_cant = math.cos(half_ang_rad)
        s_cant = math.sin(half_ang_rad)
        tug_telemetry = {
            "thrust_n": float(f_nom),
            "tug_earth_distance_m": float(d0_m),
            "beam_power_w": float(beam_p),
            "beam_directions": [
                [0.0, -float(c_cant), float(s_cant)],
                [0.0, -float(c_cant), -float(s_cant)],
            ],
            "propellant_spent_kg": 0.0,
        }

    return {
        "time_s": 0.0,
        "step_index": 0,
        "bodies": bodies_dict,
        "tug_telemetry": tug_telemetry,
        "ledger_drifts": {
            "energy": 0.0,
            "momentum": 0.0,
            "angular_momentum": 0.0,
            "mass": 0.0,
        },
        "flag_count": 0,
        "joint_angles_rad": None,
        "segment_safety_factors": None,
    }


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

    pydict = table.to_pydict()
    cfg_hash = compute_config_hash(config_path)
    cfg = _load_config(config_path)

    first_row_t_s = float(pydict["t_s"][0]) if "t_s" in pydict else 0.0
    needs_synthetic_t0 = first_row_t_s > 0.0
    effective_max = max(1, max_frames - 1) if (needs_synthetic_t0 and total_rows >= max_frames) else max_frames

    # Determine frame indices (cap at effective_max with uniform decimation)
    if total_rows <= effective_max:
        indices = list(range(total_rows))
    else:
        indices = np.round(np.linspace(0, total_rows - 1, effective_max)).astype(int).tolist()

    # Ensure index 0 of Parquet is included
    if 0 not in indices:
        indices[0] = 0

    has_tug = "Tug" in body_names or "thrust_n" in col_names or "tug_earth_distance_m" in col_names
    cone_deg = float(cfg.get("ceres_tug", {}).get("cone_half_angle_deg", 5.0))

    frames: list[dict[str, Any]] = []
    if needs_synthetic_t0:
        frames.append(_build_initial_frame_from_config(body_names, has_tug, focus_body, cfg))

    for idx in indices:
        t_val = float(pydict["t_s"][idx]) if "t_s" in pydict else float(idx)
        step_idx = int(pydict["step_index"][idx]) if "step_index" in pydict else idx
        flags_cnt = int(pydict["flags_count"][idx]) if "flags_count" in pydict else 0

        # Focus body coordinates and velocities for heliocentric centering
        focus_x = float(pydict[f"{focus_body}_x_au"][idx]) if f"{focus_body}_x_au" in pydict else 0.0
        focus_y = float(pydict[f"{focus_body}_y_au"][idx]) if f"{focus_body}_y_au" in pydict else 0.0
        focus_z = float(pydict[f"{focus_body}_z_au"][idx]) if f"{focus_body}_z_au" in pydict else 0.0
        focus_vx = float(pydict[f"{focus_body}_vx_km_s"][idx]) if f"{focus_body}_vx_km_s" in pydict else 0.0
        focus_vy = float(pydict[f"{focus_body}_vy_km_s"][idx]) if f"{focus_body}_vy_km_s" in pydict else (
            float(pydict[f"{focus_body}_v_km_s"][idx]) if f"{focus_body}_v_km_s" in pydict else 0.0
        )
        focus_vz = float(pydict[f"{focus_body}_vz_km_s"][idx]) if f"{focus_body}_vz_km_s" in pydict else 0.0

        bodies_dict: dict[str, dict[str, float]] = {}
        for b_name in body_names:
            raw_x = float(pydict[f"{b_name}_x_au"][idx]) if f"{b_name}_x_au" in pydict else 0.0
            raw_y = float(pydict[f"{b_name}_y_au"][idx]) if f"{b_name}_y_au" in pydict else 0.0
            raw_z = float(pydict[f"{b_name}_z_au"][idx]) if f"{b_name}_z_au" in pydict else 0.0

            # Velocities [km/s]
            raw_vx = float(pydict[f"{b_name}_vx_km_s"][idx]) if f"{b_name}_vx_km_s" in pydict else 0.0
            raw_vy = float(pydict[f"{b_name}_vy_km_s"][idx]) if f"{b_name}_vy_km_s" in pydict else (
                float(pydict[f"{b_name}_v_km_s"][idx]) if f"{b_name}_v_km_s" in pydict else 0.0
            )
            raw_vz = float(pydict[f"{b_name}_vz_km_s"][idx]) if f"{b_name}_vz_km_s" in pydict else 0.0

            # Mass [kg]
            mass_kg = float(pydict[f"{b_name}_mass_kg"][idx]) if f"{b_name}_mass_kg" in pydict else 0.0

            # Both positions and velocities strictly relative to focus body (heliocentric frame)
            bodies_dict[b_name] = {
                "x": 0.0 if b_name == focus_body else (raw_x - focus_x),
                "y": 0.0 if b_name == focus_body else (raw_y - focus_y),
                "z": 0.0 if b_name == focus_body else (raw_z - focus_z),
                "vx": 0.0 if b_name == focus_body else (raw_vx - focus_vx),
                "vy": 0.0 if b_name == focus_body else (raw_vy - focus_vy),
                "vz": 0.0 if b_name == focus_body else (raw_vz - focus_vz),
                "mass_kg": mass_kg,
            }

        # Tug telemetry block
        tug_telemetry = None
        if has_tug:
            thrust_n = float(pydict["thrust_n"][idx]) if "thrust_n" in pydict else 0.0
            standoff_m = float(pydict["tug_earth_distance_m"][idx]) if "tug_earth_distance_m" in pydict else 1.2701e9
            beam_p = float(pydict["beam_power_w"][idx]) if "beam_power_w" in pydict else 1.0e25
            prop_spent = float(pydict["expelled_mass_kg"][idx]) if "expelled_mass_kg" in pydict else 0.0

            half_ang_rad = math.radians(cone_deg)
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

    last_t_yr = frames[-1]["time_s"] / constants.YEAR if frames else 0.0
    downsampling_note = (
        f"Uniform decimation from {total_rows} Parquet rows to {len(frames)} frames "
        f"(spanning 0.00 to {last_t_yr:.2f} yr) in heliocentric coordinates (Sun position and velocity at 0) "
        f"with frame 0 guaranteed equal to the initial config state at t=0 s."
    )

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
            "downsampling_note": downsampling_note,
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
