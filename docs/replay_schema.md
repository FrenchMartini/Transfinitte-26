# OrbitShift Replay Telemetry Schema (DRAFT v2)

This document specifies the JSON replay schema for visualizers and web frontend consumers.

## 1. Top-Level Structure

```json
{
  "format": "OCTO_JSON",
  "version": 2,
  "status": "DRAFT",
  "meta": {
    "concept": "Ceres Tug",
    "thresholds_confirmed": false,
    "config_hash": "sha256:...",
    "units": {
      "time": "s",
      "distance": "AU",
      "velocity": "km/s",
      "mass": "kg",
      "force": "N",
      "power": "W"
    },
    "focus_body_id": "Sun",
    "frame_count": 500,
    "downsampling_note": "Uniform decimation to <= 2000 frames with exact t=0 epoch preserved"
  },
  "num_bodies": 2,
  "num_arm_segments": null,
  "frames": [ ... ],
  "flags": [ ... ]
}
```

### 1.1 Top-Level Fields

| Field | Type | Required | Description | Producing Step |
|---|---|---|---|---|
| `format` | string | Yes | Format identifier (`"OCTO_JSON"`) | Step 3.4 |
| `version` | int | Yes | Schema version integer (`2`) | Step 3.4b |
| `status` | string | Yes | Status tag (`"DRAFT"`) | Step 3.4 |
| `meta` | object | Yes | Metadata block with run parameters and provenance | Step 3.4b |
| `meta.concept` | string | Yes | Architecture concept name (`"Ceres Tug"`) | Step 3.0 |
| `meta.thresholds_confirmed` | bool | Yes | `false` until all rulebook thresholds are validated | Step 3.4b |
| `meta.config_hash` | string | Yes | SHA-256 hex digest of `config/base.yaml` | Step 3.4b |
| `meta.units` | object | Yes | Unit specification mapping for numeric quantities | Step 3.4b |
| `meta.focus_body_id` | string | Yes | Identifier of focus body fixed at origin `(0, 0, 0)` | Step 3.4 |
| `meta.frame_count` | int | Yes | Total number of frames in `frames` ($\le 2000$) | Step 3.4 |
| `meta.downsampling_note` | string | Yes | Provenance note on decimation / downsampling | Step 3.4b |
| `num_bodies` | int | Yes | Number of distinct bodies represented | Step 3.4 |
| `num_arm_segments` | null | Yes | DEFERRED (Octo-Earth arms only; strictly `null`) | Step 3.0 |
| `frames` | list[object] | Yes | Sequence of timestamped simulation frames | Step 3.4 |
| `flags` | list[object] | Yes | Threshold violation flags emitted during run | Step 3.2 |

---

## 2. Frame Structure (`frames[]`)

Each element of `frames` represents a simulation snapshot:

```json
{
  "time_s": 0.0,
  "step_index": 0,
  "bodies": {
    "Sun": {
      "x": 0.0,
      "y": 0.0,
      "z": 0.0,
      "vx": 0.0,
      "vy": 0.0,
      "vz": 0.0,
      "mass_kg": 1.98847e30
    },
    "Earth": {
      "x": 1.0,
      "y": 0.0,
      "z": 0.0,
      "vx": 0.0,
      "vy": 29.7847,
      "vz": 0.0,
      "mass_kg": 5.9722e24
    },
    "Tug": {
      "x": 1.0,
      "y": 0.004572,
      "z": 0.0,
      "vx": 0.0,
      "vy": 29.7847,
      "vz": 0.0,
      "mass_kg": 9.4e20
    }
  },
  "tug_telemetry": {
    "thrust_n": 2.208e17,
    "tug_earth_distance_m": 6.84e8,
    "beam_power_w": 1.0e25,
    "beam_directions": [
      [0.0, -0.996195, 0.087156],
      [0.0, -0.996195, -0.087156]
    ],
    "propellant_spent_kg": 0.0
  },
  "ledger_drifts": {
    "energy": 0.0,
    "momentum": 0.0,
    "angular_momentum": 0.0,
    "mass": 0.0
  },
  "flag_count": 0,
  "joint_angles_rad": null,
  "segment_safety_factors": null
}
```

### 2.1 Per-Body Telemetry (`bodies.<name>`)

All positions are expressed in AU relative to the focus body (`Sun`), ensuring `Sun` is always at `(0, 0, 0)`:

| Field | Type | Unit | Description |
|---|---|---|---|
| `x` | float | AU | Position x relative to focus body |
| `y` | float | AU | Position y relative to focus body |
| `z` | float | AU | Position z relative to focus body |
| `vx` | float | km/s | Inertial velocity x component |
| `vy` | float | km/s | Inertial velocity y component |
| `vz` | float | km/s | Inertial velocity z component |
| `mass_kg` | float | kg | Instantaneous mass of body |

### 2.2 Tug Telemetry (`tug_telemetry`)

Populated when Ceres Tug propulsion is active; otherwise `null`:

| Field | Type | Unit | Description |
|---|---|---|---|
| `thrust_n` | float | N | Instantaneous rocket engine thrust |
| `tug_earth_distance_m` | float | m | Separation distance $d$ between Earth and Tug |
| `beam_power_w` | float | W | Laser/microwave power beamed from Sun station |
| `beam_directions` | list[list[float]] | - | Two 3D unit vectors for canted exhaust/beam split |
| `propellant_spent_kg` | float | kg | Cumulative reaction mass expelled |

### 2.3 Conservation Drifts (`ledger_drifts`)

Relative audit drifts computed by `Ledger.audit()`:

| Field | Type | Unit | Description |
|---|---|---|---|
| `energy` | float / null | relative | Relative energy drift $\Delta E / E_{\text{scale}}$ |
| `momentum` | float / null | relative | Relative linear momentum drift $\Delta p / p_{\text{scale}}$ |
| `angular_momentum` | float / null | relative | Relative angular momentum drift $\Delta L / L_{\text{scale}}$ |
| `mass` | float / null | relative | Relative mass drift $\Delta M / M_0$ |

### 2.4 Deferred Fields

The following fields are strictly `null` (never fabricated):
- `joint_angles_rad`: `null` (DEFERRED: Octo-Earth arms)
- `segment_safety_factors`: `null` (DEFERRED: Octo-Earth structural ring)
