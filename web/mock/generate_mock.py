#!/usr/bin/env python3
"""Generate web/mock/replay_mock.json according to OCTO_JSON schema v2 for frontend testing."""

import json
import math
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
MOCK_FILE = ROOT_DIR / "mock" / "replay_mock.json"

YEAR_S = 31557600.0
AU_M = 1.495978707e11
TOTAL_YEARS = 9500.0
FRAME_COUNT = 200

frames = []
for i in range(FRAME_COUNT):
    fraction = i / (FRAME_COUNT - 1)
    t_yr = fraction * TOTAL_YEARS
    t_s = t_yr * YEAR_S

    # Earth spirals outward from 1.0 AU to 2.7 AU
    r_earth = 1.0 + 1.7 * fraction
    # Total accumulated angle theta(t)
    # Omega ~ 2*pi / (r^(3/2))
    theta = 2.0 * math.pi * (t_yr / (r_earth ** 1.5))
    x_earth = r_earth * math.cos(theta)
    y_earth = r_earth * math.sin(theta)

    # Tangential velocity
    v_mag = 29.78 / math.sqrt(r_earth)
    vx_earth = -v_mag * math.sin(theta)
    vy_earth = v_mag * math.cos(theta)

    # Tug leads Earth by ~0.0085 AU along tangential direction
    tx = -math.sin(theta)
    ty = math.cos(theta)
    d_au = 1.2701e9 / AU_M
    x_tug = x_earth + d_au * tx
    y_tug = y_earth + d_au * ty

    # Mars (~1.524 AU)
    theta_mars = 2.0 * math.pi * (t_yr / (1.524 ** 1.5))
    x_mars = 1.524 * math.cos(theta_mars)
    y_mars = 1.524 * math.sin(theta_mars)

    # Jupiter (~5.204 AU)
    theta_jup = 2.0 * math.pi * (t_yr / (5.204 ** 1.5))
    x_jup = 5.204 * math.cos(theta_jup)
    y_jup = 5.204 * math.sin(theta_jup)

    # Failure epoch around year 500
    waste_heat = 0.05 if t_yr < 500.0 else 8.4

    # Segment safety factors: engine mount below 1.5 (0.48)
    # Make some frames have null fields to test "not available yet"
    segment_factors = {
        "engine_mount": 0.48,
        "shadow_shield": 1.85,
        "radiator_panels": 2.10
    } if i % 2 == 0 else None

    frame = {
        "time_s": float(t_s),
        "step_index": i,
        "bodies": {
            "Sun": {
                "x": 0.0, "y": 0.0, "z": 0.0,
                "vx": 0.0, "vy": 0.0, "vz": 0.0,
                "mass_kg": 1.98847e30
            },
            "Earth": {
                "x": float(x_earth), "y": float(y_earth), "z": 0.0,
                "vx": float(vx_earth), "vy": float(vy_earth), "vz": 0.0,
                "mass_kg": 5.9722e24
            },
            "Tug": {
                "x": float(x_tug), "y": float(y_tug), "z": 0.0,
                "vx": float(vx_earth), "vy": float(vy_earth), "vz": 0.0,
                "mass_kg": 9.4e20
            },
            "Mars": {
                "x": float(x_mars), "y": float(y_mars), "z": 0.0,
                "vx": float(-24.0 * math.sin(theta_mars)), "vy": float(24.0 * math.cos(theta_mars)), "vz": 0.0,
                "mass_kg": 6.4171e23
            },
            "Jupiter": {
                "x": float(x_jup), "y": float(y_jup), "z": 0.0,
                "vx": float(-13.0 * math.sin(theta_jup)), "vy": float(13.0 * math.cos(theta_jup)), "vz": 0.0,
                "mass_kg": 1.8982e27
            }
        },
        "tug_telemetry": {
            "thrust_n": 2.358e17 if fraction < 0.99 else 0.0,
            "tug_earth_distance_m": 1.2701e9,
            "beam_power_w": 1.0e25,
            "beam_directions": [
                [0.0, -0.996195, 0.087156],
                [0.0, -0.996195, -0.087156]
            ],
            "propellant_spent_kg": float(7.51e20 * fraction)
        },
        "ledger_drifts": {
            "energy": 0.0,
            "momentum": 0.0,
            "angular_momentum": 0.0,
            "mass": 0.0
        },
        "flag_count": 1 if t_yr >= 500.0 else 0,
        "joint_angles_rad": None,  # Required null
        "segment_safety_factors": segment_factors,  # Contains 0.48 < 1.5, or null
        "insolation_w_m2": 1361.0,
        "waste_heat_w_m2": float(waste_heat),
        "moon_distance_m": 3.844e8
    }
    frames.append(frame)

mock_data = {
    "format": "OCTO_JSON",
    "version": 2,
    "status": "DRAFT",
    "meta": {
        "concept": "Ceres Tug",
        "thresholds_confirmed": False,  # Triggers persistent banner
        "config_hash": "sha256:mock_hash_for_testing_0123456789abcdef",
        "units": {
            "time": "s",
            "distance": "AU",
            "velocity": "km/s",
            "mass": "kg",
            "force": "N",
            "power": "W"
        },
        "focus_body_id": "Sun",
        "frame_count": FRAME_COUNT,
        "downsampling_note": "Synthetic test mock with 200 frames for frontend validation"
    },
    "num_bodies": 5,
    "num_arm_segments": None,  # Required null
    "flags": [
        {
            "code": "UNCONFIRMED_THRESHOLD",
            "t": 0.0,
            "source": "rulebook",
            "quantity": "thermal_shield_attenuation",
            "value": 1.0e-5,
            "limit": 1.0e-5,
            "enabler_id": "E3"
        }
    ],
    "conditions": [
        {
            "id": "target_orbit",
            "name": "Earth reaches target orbit (2.7 AU)",
            "status": "PASS",
            "measured_value": 2.700,
            "limit": 2.700,
            "first_failing_time_s": None,
            "enabler_id": None,
            "assumed": False
        },
        {
            "id": "max_surface_waste_heat",
            "name": "Earth surface waste heat below limit",
            "status": "FAIL",
            "measured_value": 8.4,
            "limit": 5.0,
            "first_failing_time_s": 500.0 * YEAR_S,
            "enabler_id": None,
            "assumed": True
        },
        {
            "id": "structural_safety_factor",
            "name": "Structural safety factor >= 1.5",
            "status": "FAIL",
            "measured_value": 0.48,
            "limit": 1.5,
            "first_failing_time_s": 10.0 * YEAR_S,
            "enabler_id": None,
            "assumed": False
        }
    ],
    "enablers": [
        {
            "id": "E1",
            "name": "Circumsolar Power & Beaming Array",
            "relaxes": ["power.max_watts"],
            "value": 1.0e25,
            "justification": "Near-Sun statite collector array"
        },
        {
            "id": "E2",
            "name": "High-Impulse Standoff Gravity Tractor",
            "relaxes": ["propulsion.exhaust_velocity_m_s"],
            "value": 8.99e7,
            "justification": "0.3c relativistic accelerator with asteroid belt resupply"
        },
        {
            "id": "E3",
            "name": "Adaptive L1 Solar Insolation Compensator",
            "relaxes": ["earth_safety.min_insolation_w_m2"],
            "value": 1361.0,
            "justification": "Parabolic reflector maintaining constant terrestrial solar constant"
        }
    ],
    "frames": frames
}

MOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
with open(MOCK_FILE, "w", encoding="utf-8") as f:
    json.dump(mock_data, f, indent=2)

print(f"Generated {MOCK_FILE} with {len(frames)} frames.")
