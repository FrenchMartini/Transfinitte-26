# TEAM CONTEXT & HANDOFF GUIDE — OrbitShift ("Octo-Earth" / Ceres Gravity Tug)

> **Last Updated:** 2026-10-24 (After completion of **Step 4.3**)  
> **Repository:** `https://github.com/FrenchMartini/Transfinitte-26.git` (`main` branch)  
> **Python Environment:** Python 3.11+ (`.venv/bin/pytest`, `.venv/bin/python`)

---

## 1. Executive Summary & Mission Objective

We are building **OrbitShift (`octo`)**, a deterministic, conservation-auditing multi-physics simulation core in Python 3.11+ for the **TRANSFINITTE 2026 challenge** (Black Ant Robotics / NIT Tiruchirappalli).

### The Engineering Goal
Move Earth from its current orbit at **$a_0 = 1.0000\text{ AU}$** out to **$a_{\text{target}} = 2.7000\text{ AU}$** within **$10,000\text{ simulated years}$**, while keeping Earth habitable, retaining the Moon, maintaining structural safety factors $\ge 1.5$, closing all conservation laws (mass, linear momentum, angular momentum, energy) via an explicit `Ledger`, and explaining any physical threshold overrides using at most **3 declared hypothetical enablers** (`config/hypothetical_enablers.yaml`).

### The 6 Mandatory Winning Conditions
1. **Target Orbit Reached:** Earth reaches $2.7\text{ AU}$ ($e \approx 0$) within $\le 10,000\text{ years}$.
2. **Earth Stays Safe:** Every habitability and planetary safety limit in `config/rulebook_thresholds.yaml` holds throughout the run.
3. **Structure Survives:** Every structural element maintains safety factor $\ge 1.5$.
4. **Code is Validated:** Every closed-form benchmark in `results/reference.json` passes automated CI tests.
5. **Physics is Honest:** Every force is booked with its equal-and-opposite reaction in `octo/core/ledger.py`; mass, linear momentum, angular momentum, and total energy close within tolerance at every step.
6. **No Unresolved Flags:** Only flags matched by declared hypothetical enablers in `config/hypothetical_enablers.yaml` are allowed; any unexplained flag fails the run.

---

## 2. Primary Architecture Decision & Physical Design

Following independent feasibility audits of all candidate architectures (see `docs/architecture_options.md`, `docs/architecture_decision.md`, `docs/feasibility_corrections.md`, and `py/experiments/feasibility_audit.py`), the team **accepted the Ceres Gravity Tug concept as the primary design**, with the following mandatory physical corrections:

### Accepted Primary Architecture: **Ceres Gravity Tug**
- **Mechanism:** A massive asteroid-class gravity tractor ($M_{\text{tug}} = 9.4 \times 10^{20}\text{ kg}$ in Option A, or $2.726 \times 10^{20}\text{ kg}$ Vesta-class in Option B) hovers ahead of Earth along its orbital velocity vector $\hat{\mathbf{t}}$ at equilibrium standoff distance $d = \sqrt{G M_{\text{tug}} / a_{\oplus}}$.
- **Gravitational Coupling:** The tug pulls Earth forward tangentially via gravity ($F_{\text{pull}} = G M_{\oplus} M_{\text{tug}} / d^2 \approx 2.3256 \times 10^{17}\text{ N}$), transferring orbital energy and angular momentum to Earth without touching Earth's surface or atmosphere (zero surface stress, zero atmospheric stripping, zero crustal tidal disruption).
- **Relativistic Propulsion on the Tug:**
  - Exhaust velocity: $v_e = 0.3c = 89,937,737.4\text{ m/s}$, Lorentz factor $\gamma = 1 / \sqrt{1 - 0.3^2} = 1.0482848367$.
  - Mass flow rate: $\dot{m} = 2.501 \times 10^9\text{ kg/s}$ (adopted in `config/base.yaml` to reach $2.7\text{ AU}$ in $\sim 9,500\text{ years}$ with margin).
  - Nominal relativistic thrust: $F_{\text{nom}} = \dot{m}\gamma v_e = 2.357952 \times 10^{17}\text{ N}$.
  - Relativistic jet power: $P_{\text{jet}} = (\gamma - 1)\dot{m}c^2 = 1.084696 \times 10^{25}\text{ W}$ ($\approx 2.83\%$ of solar luminosity $L_{\odot}$).
- **Mandatory Physical Corrections Encoded in `octo`:**
  1. **Out-of-Ecliptic Two-Cone Plume Canting ($\theta_{\text{cant}} = \pm 5.0^\circ$):**
     The tug's exhaust splits into two symmetric cones tilted $\pm 5.0^\circ$ out of the ecliptic plane so the relativistic plasma plume clears both Earth and the Moon's inclined orbit (clearance $> 1.137 \times 10^8\text{ m} > 3.3\times$ max lunar vertical excursion). Forward thrust retention: $\cos(5.0^\circ) = 0.996195$ ($0.38\%$ cosine loss).
  2. **Photon Beam Momentum Push & In-Ecliptic Yaw Trim ($\psi_{\text{yaw}} = 8.0822^\circ$):**
     Beamed power ($P_{\text{beam}} = 1.0 \times 10^{25}\text{ W}$) from the near-Sun collector imparts a radial outward photon force $F_{\text{photon}} = P_{\text{beam}}/c = 3.335641 \times 10^{16}\text{ N}$ on the tug. To cancel this radial force, the tug yaws its thrust vector inward by $\psi_{\text{yaw}} = \arctan(F_{\text{photon}} / F_{\text{cant}}) = 8.082184^\circ$ ($\cos\psi_{\text{yaw}} = 0.990067$, $0.99\%$ cosine loss).
  3. **Combined Effective Tangential Thrust:**
     $$F_{\text{eff}} = F_{\text{nom}} \cos(5.0^\circ) \cos(8.082184^\circ) = \mathbf{2.325648 \times 10^{17}\text{ N}}$$
  4. **Tug Accelerates With Earth:**
     Total forward thrust required on the tug is $F_{\text{req}} = F_{\text{pull}} + M_{\text{tug}} a_{\oplus} = F_{\text{pull}}(1 + M_{\text{tug}}/M_{\oplus})$.
  5. **Continuous Propellant Resupply (Enabler E2):**
     Tug mass $M_{\text{tug}}$ is held constant via continuous reaction-mass resupply from the asteroid belt (`BeltSupply` counterparty in `State`), expelling $7.5106 \times 10^{20}\text{ kg}$ over the 9,516-year spiral ($79.9\%$ of Ceres' mass). If resupply is turned off (`resupply_propellant: false`), recomputing $d(t) = \sqrt{G M_{\text{tug}}(t) / a_{\oplus}}$ preserves constant pull on Earth (verified in `tests/test_tug_trajectory.py`).
  6. **Radiative Thermal Shielding & Off-Axis L1 Solar Concentrator (Enabler E3):**
     Naive $(1-R)^N$ multi-foil shielding was proved invalid without inter-layer side-radiation (`tests/test_thermal_shield.py`); thermal attenuation uses an explicit `ASSUMED` configurable threshold (`thermal_shield_attenuation: 1.0e-5`). An off-axis solar concentrator at L1 maintains $1361\text{ W/m}^2$ insolation on Earth as $r_{\oplus}$ grows from $1.0\text{ AU}$ to $2.7\text{ AU}$.

### Proposed Hypothetical Enablers (Pending Rulebook Section 7 Confirmation)
- **E1 (`PowerPlant`):** Near-Sun power collector ($~2.9\% L_{\odot}$) and coherent beamed-power link delivering $\sim 1.096 \times 10^{25}\text{ W}$ to the tug.
- **E2 (`BeltSupply` + `ExhaustSink`):** Ceres/Vesta-class gravity tug relocated to Earth standoff position, $0.3c$ relativistic ion/plasma accelerator, and automated asteroid-belt reaction-mass supply pipeline ($7.51 \times 10^{20}\text{ kg}$ total).
- **E3 (`Radiation` / `Space`):** Deep-space radiative shadow shield, tug waste-heat radiators ($1.085 \times 10^{23}\text{ W}$), and off-axis L1 solar concentrator lens maintaining $1361\text{ W/m}^2$ insolation on Earth out to $2.7\text{ AU}$.

### Deferred Components (Octo-Earth Concept Only)
- `em` driver, Lorentz-force articulated arms, circumterrestrial rigid structural ring, and binary `.octo` 3D arm-joint frontend replay are marked **DEFERRED** (`null` in replay JSON).

---

## 3. Non-Negotiable Engineering & Workflow Rules

Every teammate working on this repo **must** follow these rules (enforced by automated tests):
1. **Strict TDD:** For every feature or fix, write a failing test first (**RED**), run `.venv/bin/pytest` to see it fail, write the minimal code to pass (**GREEN**), and commit per sub-step.
2. **Never Loosen a Tolerance or Edit a Test to Force a Pass:** Expected answers in tests must come from independent closed-form calculations (`tools/closed_form_spiral.py`, `results/reference.json`), never copied from the simulation under test. An honest FAIL with a clear physical cause is always preferred over tuning a test.
3. **One Home for Every Number (Enforced by `tests/test_no_hardcoded_limits.py`):**
   - Universal physical constants live **only** in `octo/core/constants.py`.
   - Rulebook safety/target/conservation limits live **only** in `config/rulebook_thresholds.yaml`.
   - Closed-form benchmark values and tolerances live **only** in `results/reference.json`.
   - Run parameters and integrator settings live **only** in `config/base.yaml`.
   - `tests/test_no_hardcoded_limits.py` parses the Python AST of every file in `octo/` and fails if any rulebook threshold literal appears in code.
4. **Conservation & Driver Isolation:**
   - Drivers never call other drivers directly. They read `State` and book immutable `Exchange` objects to `Ledger`.
   - `Ledger.book(exchange)` automatically applies $+\mathbf{F}$ to `b` and $-\mathbf{F}$ to `a`, making one-sided forces impossible.
5. **Determinism:** Single-threaded execution within a run, fixed iteration order, and `math.fsum` for all ledger reductions.
6. **Keep `README.md` Updated (Enforced by `tests/test_readme.py`):** Update `README.md` Sections 2, 8, and 10 at each step.

---

## 4. Build Steps Progress (Steps 0 – 4.3 Complete, Steps 5 – 9 Next)

| Step | Description | Status | Key Files |
|---|---|---|---|
| **Step 0** | Audit & Architecture Mapping | **DONE** | `ARCHITECTURE.md`, `docs/` |
| **Step 1** | Restructure into `octo/`, Configs, `reference.json`, AST Limit Scanner | **DONE** | `pyproject.toml`, `config/*.yaml`, `tests/test_no_hardcoded_limits.py` |
| **Step 2** | Core Contracts: `units`, `state`, `exchange`, `ledger`, `flags`, `recorder`, `README` | **DONE** | `octo/core/*.py`, `tests/test_core_contracts.py`, `tests/test_ledger.py` |
| **Step 3.0** | Verification Gate: 7 Ledger Mutations Killed + Thermal Shield Audit | **DONE** | `tests/test_ledger.py`, `tests/test_thermal_shield.py` |
| **Step 3.1** | `OrbitDriver` with REBOUND IAS15 & External Force Callback from `Ledger` | **DONE** | `octo/drivers/orbit.py`, `tests/test_orbit_rebound.py` |
| **Step 3.2** | `SimulationCoupler` (Strang Splitting Loop, Audit Every Step, Parquet & Plots) | **DONE** | `octo/core/coupler.py`, `tests/test_coupler.py` |
| **Step 3.3** | First Milestone: $1.0 \to 2.7\text{ AU}$ Hohmann Probe Transfer with Full Ledger Closure | **DONE** | `tests/test_hohmann_probe.py`, `results/replay_hohmann.json` |
| **Step 3.4 / 3.4b** | Replay Exporter (`DRAFT v2`), $\le 2000$ Frame Cap, Null Preservation, Schema Doc | **DONE** | `py/export_replay.py`, `docs/replay_schema.md`, `tests/test_export_replay.py` |
| **Step 4 / 4.1** | `CeresTugDriver` (Relativistic Rocket, Two-Cone Cant, Yaw Trim, PD Controller, 96% Cov) | **DONE** | `octo/drivers/propulsion.py`, `tests/test_propulsion_tug.py`, `tests/test_tug_trajectory.py` |
| **Step 4.2** | Config Consistency, Option A vs B N-Body Trade Study, Reduced Model, Full 9,516-Yr Run | **DONE** | `tests/test_config_consistency.py`, `config/ceres_tug_option_b.yaml`, `py/run_full_spiral_simulation.py` |
| **Step 4.3** | Benchmark Sync, Heliocentric Replay Frame 0, 200-Yr Reduced vs Full Audit, Actor Ledger | **DONE** | `tools/closed_form_spiral.py`, `reports/ledger_by_actor.md`, `tests/test_reduced_model.py` |
| **Step 5** | **Monitors** (Habitability, Insolation, Moon Hill Sphere, Acceleration/Jerk, Waste Heat) | **NEXT** | To be implemented in `octo/drivers/` or `octo/monitors/` |
| **Step 6** | **Flags, Enablers & Rulebook Validator** (End-to-End Enabler Matching & Pass/Fail Gate) | **PENDING** | `octo/core/flags.py`, `config/hypothetical_enablers.yaml` |
| **Step 7** | **Full 10,000-Year Run & Final Orbit Verification** (With All Monitors & Validator Active) | **PENDING** | `octo/cli.py`, `py/run_full_spiral_simulation.py` |
| **Step 8** | **Structure Driver** (Tug/Collector Structural Loads & Safety Factor $\ge 1.5$ Checks) | **PENDING** | `octo/drivers/structure.py` |
| **Step 9** | **Final Acceptance Report & Submission Package** | **PENDING** | `reports/`, `results/` |

---

## 5. Key Findings, Trade Studies & Current Known Issues

### 5.1 Option A vs Option B Config Consistency & 1-Year N-Body Trade Study (Step 4.2)
For a delivered pull $F_{\text{pull}} \approx 2.325 \times 10^{17}\text{ N}$, the gravitational equilibrium relation $F_{\text{pull}} = G M_{\oplus} M_{\text{tug}} / d_0^2$ admits a family of $(M_{\text{tug}}, d_0)$ pairs. We tested two consistent configurations in a full 1-year Sun–Earth–Moon–Tug REBOUND IAS15 N-body simulation:

| Parameter / Metric | **Option A (`config/base.yaml`)** | **Option B (`config/ceres_tug_option_b.yaml`)** |
|---|---|---|
| **Tug Mass $M_{\text{tug}}$** | $9.400 \times 10^{20}\text{ kg}$ ($100\%$ Ceres) | $2.7261 \times 10^{20}\text{ kg}$ ($29\%$ Ceres / Vesta-class) |
| **Equilibrium Standoff $d_0$** | $1.2701 \times 10^9\text{ m}$ ($1,270,100\text{ km}$) | $6.8400 \times 10^8\text{ m}$ ($684,000\text{ km}$) |
| **Fraction of Earth Hill Radius ($d_0 / R_{\text{Hill}}$)** | **$0.8487$** ($84.9\%$ — near outer Hill boundary) | **$0.4570$** ($45.7\%$ — deep inside stable Hill sphere) |
| **Max Standoff Deviation (1 yr)** | $63,251\text{ km}$ | **$12,473\text{ km}$** ($5.1\times$ tighter tracking) |
| **Max Controller Thrust Swing $\Delta F$** | $1.057 \times 10^{17}\text{ N}$ ($45.5\%$ of nominal) | **$4.256 \times 10^{16}\text{ N}$** ($18.3\%$ of nominal) |
| **RMS Controller Effort $\Delta F_{\text{rms}}$** | $5.835 \times 10^{16}\text{ N}$ ($25.1\%$ of nominal) | **$1.831 \times 10^{16}\text{ N}$** ($7.9\%$ of nominal — **$3.2\times$ less effort**) |
| **Moon Bound Status** | BOUND ($r_{\text{Moon}} \in [375,088,\; 399,222]\text{ km}$) | BOUND ($r_{\text{Moon}} \in [375,066,\; 399,250]\text{ km}$) |

- **Status:** Option B is recommended for superior Hill-sphere stability and $3.2\times$ lower control effort; Option A is currently kept in `config/base.yaml` for full Ceres mass compatibility until the team confirms switching `config/base.yaml` to Option B.

### 5.2 The 1 Honest Test Failure (`test_reduced_model_vs_full_nbody_window`) & How to Fix It
In Step 4.3, we added `reduced_model_validation_tol: 0.01` (`ASSUMED`, the 1% agreement target from `ARCHITECTURE.md`) to `config/base.yaml` and compared the **Reduced (Averaged) Model** (Sun + Earth in REBOUND IAS15, Tug driver-managed at $\mathbf{r}_{\oplus} + d_0\hat{\mathbf{t}}$) against the **Full N-Body Model** (Sun + Earth + Tug in REBOUND IAS15 with the 1D PD controller) over **200 years**:
- **Least-squares $da/dt$ (Full N-Body):** $8.880572 \times 10^{-5}\text{ AU/yr}$
- **Least-squares $da/dt$ (Reduced Model):** $8.346108 \times 10^{-5}\text{ AU/yr}$
- **Ratio:** $1.064037$ (**$+6.40\%$ discrepancy** vs the $1.00\%$ target).
- **Exact Physical Cause:**
  1. In the full N-body run, the Tug is initialized at Cartesian $(r_0, d_0)$ with velocity $(0, v_0)$ instead of on the circle of radius $r_0$ at angle $\theta_0 = d_0/r_0$, and is controlled by a purely 1D proportional-derivative (PD) loop on scalar distance $d = |\mathbf{r}_{\text{tug}} - \mathbf{r}_{\oplus}|$ without an integral (I) term or radial Hill-frame control.
  2. Solar tidal forces in the rotating Clohessy-Wiltshire / Hill frame cause the Tug to settle at a steady-state proportional droop of **$d_{\text{eq}} = 0.9691\,d_0$** ($3.09\%$ closer to Earth than $d_0$) with radial inward Hill offset $x_{\text{Hill}} = -0.180\,d_0$.
  3. Because gravity scales as $1/d^2$, sitting at $0.9691\,d_0$ increases the gravitational pull on Earth by $1/(0.9691)^2 - 1 = \mathbf{+6.48\%}$, which directly produces the $+6.40\%$ faster orbital expansion rate $da/dt$!
- **How Teammates Can Fix It (Once Approved):**
  Upgrade the station-keeping controller in `CeresTugDriver` (and `test_reduced_model.py`) from a 1D scalar PD controller to a **2D Hill-frame PID controller (or feedforward solar-tidal + Coriolis trim)** that controls both radial Hill coordinate $x_{\text{Hill}} \to 0$ and along-track coordinate $y_{\text{Hill}} \to d_0$ with zero steady-state droop ($d_{\text{eq}} = d_0$).

### 5.3 Lunar Reflex Oscillation of Earth's Osculating Semi-Major Axis (Step 4.3)
- When the Moon is included in short-window N-body runs, Earth orbits the Earth–Moon barycenter (EMB) every synodic month with reflex velocity $v_{\text{reflex}} \approx 12.42\text{ m/s}$ and reflex radius $r_{\text{reflex}} \approx 4,671\text{ km}$.
- This modulates Earth's heliocentric osculating semi-major axis $a_{\oplus}(t)$ by **$\pm 9.45 \times 10^{-4}\text{ AU}$** (peak-to-peak $1.890 \times 10^{-3}\text{ AU} \approx 282,700\text{ km}$), which is $11.4\times$ larger than 1 year of secular spiral drift ($8.3 \times 10^{-5}\text{ AU/yr}$).
- By contrast, the **Earth–Moon Barycenter (EMB)** semi-major axis $a_{\text{EMB}}(t)$ grows smoothly and monotonically without monthly reflex oscillation.

### 5.4 Full 9,516-Year Spiral + 50-Year Coast Run Summary (`py/run_full_spiral_simulation.py`)
- **Arrival at $2.7000\text{ AU}$:** $t = \mathbf{9,516.03\text{ years}}$ ($347,573$ active steps of $\Delta t = 10\text{ days}$; note that continuous tangential thrust with config yaw $\psi = 8.0822^\circ$ arrives at **$9,486.90\text{ years}$**, matching closed-form $\Delta v / a_{\text{eff}} = 9,486.85\text{ years}$ within $0.05\text{ yr}$).
- **Final Orbit after 50-Year Unpowered Ballistic Coast ($t = 9,566.03\text{ yr}$):**
  - Semi-major axis: $a_f = \mathbf{2.7000\text{ AU}}$
  - Eccentricity: $e_f = \mathbf{0.000093}$ ($\ll 0.05$ limit)
- **Total Propellant Used:** $7.5106 \times 10^{20}\text{ kg}$ ($79.90\%$ of Ceres mass)
- **Energy & Momentum Closure:** Documented by actor in [`reports/ledger_by_actor.md`](file:///Users/adithya_na1r/tf26/reports/ledger_by_actor.md).
- **Wall Time:** $\sim 54\text{ seconds}$ for the entire 9,566-year run.

---

## 6. Repository Directory & File Map

```text
tf26/
├── README.md                          # Project overview, current status, contracts, decisions, changelog
├── TEAM_CONTEXT.md                    # THIS FILE: Complete handoff context for teammates
├── ARCHITECTURE.md                    # System architecture & competition engineering specification
├── pyproject.toml                     # Python package definition & pytest configuration
├── config/
│   ├── base.yaml                      # Primary run configuration (Option A, mode: "averaged", mdot=2.501e9)
│   ├── ceres_tug_option_b.yaml        # Option B consistent config (d=6.84e8 m, M_tug=2.7261e20 kg)
│   ├── rulebook_thresholds.yaml       # All 18 safety, orbit target, and conservation limits (marked ASSUMED)
│   └── hypothetical_enablers.yaml     # Declared hypothetical enablers (max 3)
├── octo/
│   ├── __init__.py                    # Top-level package entry
│   ├── core/
│   │   ├── constants.py               # Exact IAU/CODATA SI constants (G, GM_SUN, AU, M_EARTH, C_LIGHT, YEAR)
│   │   ├── units.py                   # Strongly-typed SI unit wrappers (Meters, Kilograms, Seconds, etc.)
│   │   ├── state.py                   # BodyState & deterministic State container
│   │   ├── exchange.py                # Immutable Exchange record (force_on_b, reaction_on_a, mass_out, power_in, heat_out)
│   │   ├── ledger.py                  # Central Conservation Ledger (book, audit, net_force_on, summary_by_actor)
│   │   ├── flags.py                   # Flag dataclass & FlagRegistry matching flags against enablers
│   │   ├── thresholds.py              # Loader, validator, and AssumedThresholdWarning for rulebook_thresholds.yaml
│   │   ├── recorder.py                # ParquetResultsWriter & BinaryReplayRecorder skeleton
│   │   └── coupler.py                 # SimulationCoupler (Strang-splitting macro-step loop, DriverRegistry, plots)
│   └── drivers/
│       ├── orbit.py                   # OrbitDriver (REBOUND IAS15 N-body & averaged mode, Hohmann & Kepler helpers)
│       └── propulsion.py              # CeresTugDriver (relativistic rocket, cant/yaw losses, PD controller, Exchanges)
├── tools/
│   └── closed_form_spiral.py          # Standalone closed-form spiral benchmark calculator (imports NOTHING from octo)
├── py/
│   ├── export_replay.py               # Exports Parquet telemetry to DRAFT v2 JSON replay (<=2000 frames, heliocentric)
│   ├── run_full_spiral_simulation.py  # Runs full 9,516-yr spiral + 50-yr coast, saves Parquet, PNG plot, and replay JSON
│   └── experiments/
│       └── feasibility_audit.py       # Analytical feasibility & physics verification scripts
├── results/
│   ├── reference.json                 # Closed-form benchmark reference numbers and tolerances
│   ├── replay_ceres_tug.json          # Full 9,566-yr Ceres Tug replay JSON (1,201 frames, DRAFT v2)
│   ├── replay_hohmann.json            # 1.26-yr Hohmann probe transfer replay JSON (301 frames, DRAFT v2)
│   └── spiral_trajectory_9500yr.png   # Plot of Earth semi-major axis a(t) from 1.0 AU to 2.7 AU + 50-yr coast
├── reports/
│   └── ledger_by_actor.md             # Full 9,516-yr conservation ledger table broken down by simulated & non-simulated actors
├── docs/
│   ├── physics.md                     # Governing equations and SI units
│   ├── replay_schema.md               # DRAFT v2 JSON replay schema specification
│   ├── architecture_options.md        # Evaluation of candidate concepts
│   ├── architecture_decision.md       # Primary selection of Ceres Gravity Tug
│   └── feasibility_corrections.md     # Physical corrections to research claims
└── tests/                             # 86 automated tests (85 passing, 1 honest fail on 200-yr 1% target)
    ├── test_config_consistency.py
    ├── test_core_contracts.py
    ├── test_coupler.py
    ├── test_export_replay.py
    ├── test_flags.py
    ├── test_hohmann_probe.py
    ├── test_ledger.py
    ├── test_no_hardcoded_limits.py
    ├── test_orbit_rebound.py
    ├── test_physics.py
    ├── test_propulsion_tug.py
    ├── test_readme.py
    ├── test_recorder.py
    ├── test_reduced_model.py
    ├── test_thermal_shield.py
    ├── test_thresholds.py
    └── test_tug_trajectory.py
```

---

## 7. Quick-Start Commands for Teammates

```bash
# 1. Create / activate virtual environment (Python 3.11+)
python3 -m venv .venv
.venv/bin/pip install --upgrade pip setuptools
.venv/bin/pip install -e .

# 2. Run the full test suite with coverage
.venv/bin/pytest --cov=octo --cov-report=term-missing

# 3. Recompute closed-form spiral benchmarks from config/base.yaml
.venv/bin/python tools/closed_form_spiral.py

# 4. Run the full 9,516-year spiral + 50-year coast simulation & export replay
.venv/bin/python py/run_full_spiral_simulation.py

# 5. Export any Parquet telemetry file to DRAFT v2 replay JSON
.venv/bin/python py/export_replay.py results/run_ceres_tug_full.parquet results/replay_ceres_tug.json
```

---

## 8. Open Questions & Decisions Needed Before Step 5

1. **Station-Keeping Controller Upgrade (for 1% 200-yr Reduced-vs-Full Target):**
   Should we upgrade the 1D scalar PD controller in `CeresTugDriver` to a 2D Hill-frame PID/feedforward controller so that steady-state standoff droop ($d_{\text{eq}} = 0.9691\,d_0$) is eliminated and `test_reduced_model_vs_full_nbody_window` passes within the $1\%$ target?
2. **Option B vs Option A in `config/base.yaml`:**
   Should we promote Option B ($d_0 = 6.84 \times 10^8\text{ m}, M_{\text{tug}} = 2.726 \times 10^{20}\text{ kg}$, $0.457\,R_{\text{Hill}}$) from `config/ceres_tug_option_b.yaml` into `config/base.yaml`?
3. **PowerPlant `beam_power_w` Alignment:**
   Should `ceres_tug.beam_power_w` in `config/base.yaml` be set to $P_{\text{jet}} + P_{\text{waste}} = 1.0956 \times 10^{25}\text{ W}$ (currently `1.0e25 W` nominal while `propulsion.power_w` is `1.085e25 W`)?
4. **Next Build Step:**
   Once confirmed, proceed to **Step 5 (Monitors: Habitability, Insolation, Moon Hill-Sphere Check, Acceleration/Jerk, and Surface Waste Heat)**.
