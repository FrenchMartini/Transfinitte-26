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
- Output capped at at most 2500 frames.
"""

import hashlib
import json
import math
from pathlib import Path
import sys
import time
from typing import Any
import numpy as np
import pyarrow.parquet as pq
from tqdm import tqdm
import yaml

from octo.core import constants
from octo.drivers.propulsion import lorentz_gamma

# ANSI Terminal Formatting & Colors (no external dependencies)
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
CYAN = "\033[36m"
BRIGHT_CYAN = "\033[96m"
GREEN = "\033[32m"
BRIGHT_GREEN = "\033[92m"
YELLOW = "\033[33m"
BRIGHT_YELLOW = "\033[93m"
WHITE = "\033[37m"
BRIGHT_WHITE = "\033[97m"
GRAY = "\033[90m"
RED = "\033[31m"

def _timer(t0: float) -> str:
    elapsed = time.perf_counter() - t0
    m, s = divmod(elapsed, 60)
    return f"{GRAY}[{int(m):02d}:{s:05.2f}]{RESET}"

MAX_REPLAY_FRAMES = 2500

UNITS_DICT: dict[str, str] = {
    "time": "s",
    "distance": "AU",
    "velocity": "km/s",
    "mass": "kg",
    "force": "N",
    "power": "W",
}

SOLAR_SYSTEM_PLANETS: dict[str, dict[str, float]] = {
    "Mercury": {"a_au": 0.387098, "period_yr": 0.240846, "mass_kg": 3.3011e23, "v_base_km_s": 47.36},
    "Venus": {"a_au": 0.723332, "period_yr": 0.615197, "mass_kg": 4.8675e24, "v_base_km_s": 35.02},
    "Mars": {"a_au": 1.523679, "period_yr": 1.880816, "mass_kg": 6.4171e23, "v_base_km_s": 24.08},
    "Jupiter": {"a_au": 5.204267, "period_yr": 11.862615, "mass_kg": 1.8982e27, "v_base_km_s": 13.06},
    "Saturn": {"a_au": 9.5826, "period_yr": 29.4571, "mass_kg": 5.6834e26, "v_base_km_s": 9.68},
    "Uranus": {"a_au": 19.19126, "period_yr": 84.0110, "mass_kg": 8.6810e25, "v_base_km_s": 6.80},
    "Neptune": {"a_au": 30.06896, "period_yr": 164.79, "mass_kg": 1.02413e26, "v_base_km_s": 5.43},
}


def _find_repo_root() -> Path:
    cur = Path(__file__).resolve().parent
    for p in [cur, *cur.parents]:
        if (p / "config" / "base.yaml").exists() or (p / "pyproject.toml").exists():
            return p
    return cur.parent.parent


def compute_config_hash(config_path: Path | str | None = None) -> str:
    """Compute sha256 hex digest of config/base.yaml."""
    if config_path is None:
        root = _find_repo_root()
        config_path = root / "config" / "base.yaml"
    p = Path(config_path)
    if not p.is_file():
        return "sha256:unknown"
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    return f"sha256:{digest}"


def _load_config(config_path: Path | str | None = None) -> dict[str, Any]:
    """Load YAML configuration dict."""
    if config_path is None:
        root = _find_repo_root()
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
    include_planets: bool = False,
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

    if include_planets:
        for p_name, p_data in SOLAR_SYSTEM_PLANETS.items():
            if p_name not in bodies_dict:
                bodies_dict[p_name] = {
                    "x": float(p_data["a_au"]),
                    "y": 0.0,
                    "z": 0.0,
                    "vx": 0.0,
                    "vy": float(p_data["v_base_km_s"]),
                    "vz": 0.0,
                    "mass_kg": float(p_data["mass_kg"]),
                }

    tug_telemetry = None
    if has_tug:
        half_ang_rad = math.radians(cone_deg)
        c_cant = math.cos(half_ang_rad)
        s_cant = math.sin(half_ang_rad)
        f_cant = f_nom * c_cant
        f_ph_init = float(beam_p) / constants.C_LIGHT
        yaw_rad = math.atan(f_ph_init / f_cant) if f_cant > 0.0 else 0.0
        f_eff_init = float(cfg.get("ceres_tug", {}).get("effective_thrust_n", f_cant * math.cos(yaw_rad)))
        f_pull_init = (constants.G * constants.M_EARTH * float(m_tug)) / (float(d0_m) ** 2) if float(d0_m) > 0.0 else f_eff_init
        tug_telemetry = {
            "thrust_n": float(f_nom),
            "effective_thrust_n": float(f_eff_init),
            "gravitational_pull_n": float(f_pull_init),
            "photon_radiation_thrust_n": float(f_ph_init),
            "thrust_per_cone_n": float(f_nom) / 2.0,
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


def _safe_float(pydict: dict[str, list[Any]], col: str, idx: int, default: float = 0.0) -> float:
    """Extract float from pydict column at idx safely handling None or missing columns."""
    if col in pydict and idx < len(pydict[col]):
        val = pydict[col][idx]
        if val is not None:
            return float(val)
    return default


def export_parquet_to_replay_json(
    parquet_path: str | Path,
    output_json_path: str | Path,
    max_frames: int | None = MAX_REPLAY_FRAMES,
    focus_body: str = "Sun",
    concept: str = "Ceres Tug",
    thresholds_confirmed: bool = False,
    config_path: str | Path | None = None,
    include_planets: bool = False,
    sample_interval_days: float | None = None,
    show_progress: bool = True,
) -> dict[str, Any]:
    """Read a simulation Parquet table, decimate to <= max_frames or sample by days, and write replay JSON."""
    in_path = Path(parquet_path)
    out_path = Path(output_json_path)
    t0 = time.perf_counter()

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

    if sample_interval_days is not None and sample_interval_days > 0.0 and "t_s" in pydict:
        t_arr = np.array(pydict["t_s"], dtype=np.float64)
        sample_step_s = sample_interval_days * 86400.0
        t_min = t_arr[0]
        t_max = t_arr[-1]
        target_times = np.arange(t_min, t_max + 0.5 * sample_step_s, sample_step_s)
        raw_indices = np.searchsorted(t_arr, target_times, side="left")
        raw_indices = np.clip(raw_indices, 0, total_rows - 1)
        indices = sorted(set(int(i) for i in raw_indices))
        if max_frames is not None and len(indices) > max_frames:
            sub_idx = np.round(np.linspace(0, len(indices) - 1, max_frames)).astype(int)
            indices = [indices[i] for i in sub_idx]
    else:
        effective_max = max(1, max_frames - 1) if (needs_synthetic_t0 and max_frames is not None and total_rows >= max_frames) else (max_frames or total_rows)
        if total_rows <= effective_max:
            indices = list(range(total_rows))
        else:
            indices = np.round(np.linspace(0, total_rows - 1, effective_max)).astype(int).tolist()

    # Ensure index 0 and last index are included
    if 0 not in indices:
        indices.insert(0, 0)
    if (total_rows - 1) not in indices:
        indices.append(total_rows - 1)
    indices = sorted(set(indices))

    has_tug = "Tug" in body_names or "thrust_n" in col_names or "tug_earth_distance_m" in col_names
    cone_deg = float(cfg.get("ceres_tug", {}).get("cone_half_angle_deg", 5.0))

    frames: list[dict[str, Any]] = []
    if needs_synthetic_t0:
        frames.append(_build_initial_frame_from_config(body_names, has_tug, focus_body, cfg, include_planets=include_planets))

    frame_iter = tqdm(indices, desc=f"Exporting {concept} frames", unit="frame", dynamic_ncols=True) if show_progress else indices
    for idx in frame_iter:
        t_val = _safe_float(pydict, "t_s", idx, float(idx))
        step_idx = int(pydict["step_index"][idx]) if "step_index" in pydict and pydict["step_index"][idx] is not None else idx
        flags_cnt = int(pydict["flags_count"][idx]) if "flags_count" in pydict and pydict["flags_count"][idx] is not None else 0

        # Focus body coordinates and velocities for heliocentric centering
        focus_x = _safe_float(pydict, f"{focus_body}_x_au", idx, 0.0)
        focus_y = _safe_float(pydict, f"{focus_body}_y_au", idx, 0.0)
        focus_z = _safe_float(pydict, f"{focus_body}_z_au", idx, 0.0)
        focus_vx = _safe_float(pydict, f"{focus_body}_vx_km_s", idx, 0.0)
        focus_vy = _safe_float(pydict, f"{focus_body}_vy_km_s", idx, _safe_float(pydict, f"{focus_body}_v_km_s", idx, 0.0))
        focus_vz = _safe_float(pydict, f"{focus_body}_vz_km_s", idx, 0.0)

        bodies_dict: dict[str, dict[str, float]] = {}
        for b_name in body_names:
            raw_x = _safe_float(pydict, f"{b_name}_x_au", idx, 0.0)
            raw_y = _safe_float(pydict, f"{b_name}_y_au", idx, 0.0)
            raw_z = _safe_float(pydict, f"{b_name}_z_au", idx, 0.0)

            # Velocities [km/s]
            raw_vx = _safe_float(pydict, f"{b_name}_vx_km_s", idx, 0.0)
            raw_vy = _safe_float(pydict, f"{b_name}_vy_km_s", idx, _safe_float(pydict, f"{b_name}_v_km_s", idx, 0.0))
            raw_vz = _safe_float(pydict, f"{b_name}_vz_km_s", idx, 0.0)

            # Mass [kg]
            mass_kg = _safe_float(pydict, f"{b_name}_mass_kg", idx, 0.0)

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

        if include_planets:
            t_yr = t_val / (86400.0 * 365.25)
            for p_name, p_data in SOLAR_SYSTEM_PLANETS.items():
                if p_name not in bodies_dict:
                    a_au = p_data["a_au"]
                    period_yr = p_data["period_yr"]
                    theta = 2.0 * math.pi * (t_yr / period_yr)
                    v_mag = p_data["v_base_km_s"]
                    px = a_au * math.cos(theta)
                    py = a_au * math.sin(theta)
                    pvx = -v_mag * math.sin(theta)
                    pvy = v_mag * math.cos(theta)
                    bodies_dict[p_name] = {
                        "x": round(float(px - focus_x), 6),
                        "y": round(float(py - focus_y), 6),
                        "z": 0.0,
                        "vx": round(float(pvx - focus_vx), 4),
                        "vy": round(float(pvy - focus_vy), 4),
                        "vz": 0.0,
                        "mass_kg": float(p_data["mass_kg"]),
                    }

        # Tug telemetry block
        tug_telemetry = None
        if has_tug:
            thrust_n = _safe_float(pydict, "thrust_n", idx, 0.0)
            eff_thrust_n = _safe_float(pydict, "effective_thrust_n", idx, thrust_n)
            pull_n = _safe_float(pydict, "gravitational_pull_n", idx, thrust_n)
            photon_n = _safe_float(pydict, "photon_radiation_thrust_n", idx, 0.0)
            cone_thrust_n = _safe_float(pydict, "thrust_per_cone_n", idx, thrust_n / 2.0)
            standoff_m = _safe_float(pydict, "tug_earth_distance_m", idx, 1.2701e9)
            beam_p = _safe_float(pydict, "beam_power_w", idx, 1.0e25)
            prop_spent = _safe_float(pydict, "expelled_mass_kg", idx, 0.0)

            half_ang_rad = math.radians(cone_deg)
            c_cant = math.cos(half_ang_rad)
            s_cant = math.sin(half_ang_rad)

            tug_telemetry = {
                "thrust_n": thrust_n,
                "effective_thrust_n": eff_thrust_n,
                "gravitational_pull_n": pull_n,
                "photon_radiation_thrust_n": photon_n,
                "thrust_per_cone_n": cone_thrust_n,
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
            "energy": _safe_float(pydict, "energy_drift", idx, 0.0),
            "momentum": _safe_float(pydict, "momentum_drift", idx, 0.0),
            "angular_momentum": _safe_float(pydict, "ang_mom_drift", idx, 0.0),
            "mass": _safe_float(pydict, "mass_drift", idx, 0.0),
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
    if show_progress:
        print(f"{_timer(t0)} {CYAN}Writing {len(frames):,} frames to JSON file:{RESET} {out_path}")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(replay_doc, f, indent=2)

    if show_progress:
        size_mb = out_path.stat().st_size / (1024 * 1024)
        print(f"{_timer(t0)} {BRIGHT_GREEN}Successfully exported {len(frames):,} frames ({size_mb:.2f} MB):{RESET} {out_path}")

    return replay_doc


if __name__ == "__main__":
    t_start = time.perf_counter()
    cur = Path(__file__).resolve().parent
    root = next((p for p in [cur, *cur.parents] if (p / "results").exists() or (p / "pyproject.toml").exists()), cur.parent.parent)
    default_parquet = root / "results" / "run_ceres_tug_full.parquet"
    if not default_parquet.exists():
        default_parquet = root / "results" / "run_0001.parquet"
    default_json = root / "results" / "replay_ceres_tug.json"

    in_file = sys.argv[1] if len(sys.argv) > 1 else str(default_parquet)
    out_file = sys.argv[2] if len(sys.argv) > 2 else str(default_json)

    print(f"\n{CYAN}┌──{RESET} {BOLD}{WHITE}REPLAY TELEMETRY EXPORT UTILITY{RESET} {CYAN}{'─' * 41}┐{RESET}")
    print(f"{CYAN}│{RESET}  {GRAY}Input Telemetry:{RESET}  {WHITE}{in_file}{RESET}")
    print(f"{CYAN}│{RESET}  {GRAY}Output Replay:{RESET}    {WHITE}{out_file}{RESET}")
    print(f"{CYAN}└──{'─' * 74}┘{RESET}\n")

    doc = export_parquet_to_replay_json(in_file, out_file, show_progress=True)
    total_time = time.perf_counter() - t_start

    print(f"\n{GREEN}┌──{RESET} {BOLD}{WHITE}EXPORT COMPLETED{RESET} {GREEN}{'─' * 56}┐{RESET}")
    print(f"{GREEN}│{RESET}  {BRIGHT_GREEN}Status:{RESET}           Successfully completed in {total_time:.2f} seconds")
    print(f"{GREEN}│{RESET}  {GRAY}Frames Exported:{RESET}  {WHITE}{doc['meta']['frame_count']:,}{RESET} frames")
    print(f"{GREEN}└──{'─' * 74}┘{RESET}\n")
