# OrbitShift 3D Viewer (Ceres Tug Simulation)

A real-time, deterministic 3D celestial visualizer built in Three.js and TypeScript for the **TRANSFINITTE challenge** (Black Ant Robotics / NIT Tiruchirappalli).

The viewer visualizes the 10,000-year migration of Earth from 1.0 AU to 2.7 AU driven by the Ceres Gravity Tug.

---

## 1. Quick Start

### Prerequisites
- Node.js 18+ (tested on Node v25 / v22)
- npm

### Installation
```bash
cd web
npm install
```

### Run Locally (Dev Server)
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Run Automated Tests (Vitest)
```bash
npm run test
```

### Production Build
```bash
npm run build
```

---

## 2. Telemetry and Loading Replays

The viewer adheres to the **OrbitShift Replay Telemetry Schema (OCTO_JSON v2 DRAFT)** (`docs/replay_schema.md`).

- **Default:** Automatically attempts to fetch `/results/replay_ceres_tug.json` (1,201 frames spanning 9,566 years).
- **Fallback:** If `/results/replay_ceres_tug.json` is missing or fails validation, it falls back seamlessly to the built-in synthetic test mock (`web/mock/replay_mock.json`).
- **Load via URL Query Parameter:**
  - Real run: `http://localhost:5173/?file=/results/replay_ceres_tug.json`
  - Synthetic test mock: `http://localhost:5173/?file=/mock/replay_mock.json`
- **Drag-and-Drop:** Drag and drop any `.json` or `.octo` replay file anywhere onto the browser window.
- **File Picker:** Click **"📂 Load Replay"** in the top-right toolbar.

---

## 3. Visualizer Architecture & Stage F1 Features

1. **Pure Kinematic Playback (Zero Physics on Client):**
   - The visualizer **never computes physics**. It reads positions, velocities, and monitors directly from telemetry frames and uses strictly linear interpolation (LERP) between snapshots for 60 fps rendering.
2. **Double-Precision Floating Origin (`web/src/coords.ts`):**
   - Converts heliocentric ecliptic $(X, Y, Z)$ to Three.js Y-up $(X, Z, -Y)$ with floating-origin subtraction in Float64 prior to passing into scene units. Eliminates 32-bit single-precision GPU vertex jitter.
3. **Solar-System View (in AU):**
   - Sun at origin $(0, 0, 0)$ with point-light illumination.
   - Earth and Tug positions tracked from replay frames.
   - Continuous spiral trail for Earth colored by semi-major axis $a(t)$ (gradient from 1.0 AU blue to 2.7 AU gold).
   - Reference orbital boundary rings:
     - Mars Crossing at $1.524\text{ AU}$ (orange dashed ring)
     - Asteroid Belt Entry at $2.20\text{ AU}$ (amber dashed ring)
     - Target Orbit Arrival at $2.70\text{ AU}$ (cyan solid ring)
   - Procedural starfield and logarithmic depth buffer for sub-millimeter to astronomical depth fidelity.
4. **Instanced Asteroid Belt (2.2 AU to 3.2 AU):**
   - 2,500 instanced asteroid particles generated with a deterministic PRNG seed (`Mulberry32(42)`).
   - Prominently labeled with a **"Asteroid Belt (Illustrative)"** badge.
   - Ceres native orbit ($2.77\text{ AU}$) is distinctly highlighted.
5. **Timeline Controller:**
   - Play/pause toggle (Spacebar shortcut).
   - Scrubbing slider with simulated time readout in Julian years ($t / 31,557,600$) and frame indices.
   - Log-scale playback speed control ($1\times \to 500\times$ years/second).
   - Scrubber pip markers indicating condition failure epochs (clicking jumps directly to the failure timestamp).
6. **Rulebook & Safety Indicators:**
   - Persistent banner: **"⚠ Thresholds not confirmed by organizers"** displayed when `meta.thresholds_confirmed === false`.
   - Condition failures displayed in red.

---

## 4. Current Schema Requests (for Backend Steps 5, 7, 8, 9)

The frontend currently uses graceful placeholders ("not available yet" / illustrative rings) for fields scheduled in future backend steps:

| Requested Field | Target Schema Location | Expected Backend Step | Current Stage F1 Status / Placeholder |
|---|---|---|---|
| `Moon`, `Mars`, `Jupiter` | `frames[].bodies.<name>` | Step 7 (Windowed runs) | Fixed reference rings for Mars ($1.52\text{ AU}$) and Belt ($2.2\text{ AU}$); Moon deferred to Stage F2 |
| `beam_clearance_earth_m`, `beam_clearance_moon_m` | `tug_telemetry` | Step 5 (Monitors) | Displayed as "not available yet" |
| `segment_safety_factors` | `frames[].segment_safety_factors` | Step 8 (Structure) | Rendered in neutral grey ("not available yet") |
| `conditions[]` | Top-level | Step 9 (Acceptance) | Parsed from mock data; missing in real replay until Step 9 |
| `enablers[]` | Top-level | Step 9 (Acceptance) | Parsed from mock data; missing in real replay until Step 9 |
| `insolation_w_m2`, `waste_heat_w_m2` | `frames[]` | Step 5 (Monitors) | Parsed from mock; missing in real replay until Step 5 |

---

## 5. Known Backend Anomalies (Observed as-is)
- **Frame 0 offset:** In `results/replay_ceres_tug.json`, Earth position at $t=0$ shows ~10 days of orbital motion from $(1, 0, 0)$.
- **Sun velocity:** Sun is pinned at $(0, 0, 0)$ AU, but has non-zero velocity in raw replay.
- *The frontend presents these exactly as given by telemetry without client-side monkeypatching, per project specification.*
