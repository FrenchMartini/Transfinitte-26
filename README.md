# Octo-Earth ("OrbitShift") Simulation Core

## 1. What This Project Is

**Octo-Earth ("OrbitShift")** is a deterministic multi-physics simulation built for the **TRANSFINITTE challenge** (Black Ant Robotics / NIT Tiruchirappalli). It models a planetary-scale engineering machine—such as a great-circle structural ring around Earth with eight articulated Lorentz-force arms, or pluggable alternatives (mass driver, ion/fusion exhaust, solar sail/mirror array, gravity tractor)—designed to move Earth from its current $1\text{ AU}$ orbit out to $\sim 2.7\text{ AU}$ without harming the planet or its biosphere.

Every simulation run is judged against **six mandatory winning conditions**:
1. **Target Orbit Reached:** Earth reaches its target orbit ($\sim 2.7\text{ AU}$) within $10,000$ simulated years.
2. **Earth Stays Safe:** Every habitability and planetary safety threshold in the rulebook appendix holds across the entire run.
3. **Structure Survives:** Every structural segment maintains a safety factor $\ge 1.5$.
4. **Code is Validated:** Every closed-form and reference benchmark passes in automated CI.
5. **Physics is Honest:** Every force is booked with its equal-and-opposite reaction in the central `Ledger`; linear momentum, angular momentum, mass, and total energy close within tolerance.
6. **No Unresolved Flags:** Only flags explicitly explained by declared hypothetical enablers (at most 3 in `config/hypothetical_enablers.yaml`) are permitted; any unexplained flag fails the run.

---

## 2. Current Status

- **Date:** 2026-10-24
- **Last Prior Commit Hash:** `6fc0b5a` (`step 4.3.4: per-actor ledger accounting, closure tests, and reports/ledger_by_actor.md`)
- **Current Test Count & Result:** 86 tests — **85 PASSED, 1 FAILED (honest fail on 200-yr 1% reduced-vs-full target)** (`pytest -v`)
- **Build Steps Progress:**
  - **Step 0 (Audit & Architecture Mapping):** DONE
  - **Step 1 (Restructure into `octo/`, Configs, `reference.json`, AST Limit Check):** DONE
  - **Step 2 (`octo/core/`: README, `units`, `state`, `exchange`, `ledger`, `flags`, `FlagRegistry`, `recorder` skeleton):** DONE
  - **Step 3.0 (Verification Gate & Ledger Mutation Checks):** DONE
  - **Step 3.1 (`orbit` driver with REBOUND IAS15 & external force callback):** DONE
  - **Step 3.2 (Coupler & macro-step loop):** DONE
  - **Step 3.3 (First Milestone: 1.0 -> 2.7 AU test probe Hohmann transfer):** DONE
  - **Step 3.4 (Replay JSON Exporter with frame cap & null preservation):** DONE
  - **Step 3.4b (Replay Export DRAFT v2 with Hohmann & Ceres Tug replays, schema doc, and tests):** DONE
  - **Step 4 (Tug Driver: Relativistic rocket physics, station-keeping controller, 100% coverage):** DONE
  - **Step 4.1 (Verify Tug Run, closed-form trajectory test, 2.7 AU arrival time, Moon Hill stability, build step renumbering):** DONE
  - **Step 4.2 (Config consistency, Option A vs B N-body study, reduced averaged model, closed-form benchmark tool, full 9,516-year spiral run + 50-yr coast, updated replay):** DONE
  - **Step 4.3 (Benchmark sync from config, replay frame 0 initial config state & heliocentric velocities, 200-yr reduced vs full comparison & Moon oscillation, per-actor ledger report):** DONE
  - **Step 5 (Monitors):** NOT STARTED
  - **Step 6 (Flags, Enablers, and Rulebook Validator):** NOT STARTED
  - **Step 7 (Full 10,000-Year Run & Final Orbit):** NOT STARTED
  - **Step 8 (Structure):** NOT STARTED
  - **Step 9 (Acceptance Report):** NOT STARTED
  - **DEFERRED (Octo-Earth only):** `em` driver, Lorentz-force arms, circumterrestrial structural ring, replay frontend.

---

## 3. How to Run

### Environment Setup (Python 3.11+)
```bash
/opt/homebrew/bin/python3.13 -m venv .venv
.venv/bin/pip install --upgrade pip setuptools
.venv/bin/pip install -e .
```

### Run Test Suite
```bash
.venv/bin/pytest -v
```

### Run CLI (Planned in Step 3+)
```bash
.venv/bin/python -m octo.cli config/base.yaml --out results/run_0042.parquet
```

---

## 4. Repo Map

| Path | Purpose | Owner |
|---|---|---|
| `README.md` | Single source of truth for project architecture, status, contracts, and rules | TODO |
| `pyproject.toml` | Package build configuration and dependencies for `octo` | TODO |
| `config/base.yaml` | Run mode, time span, macro step, integrator settings, driver list, propulsion params | TODO |
| `config/rulebook_thresholds.yaml` | All organizer/appendix safety, target, and conservation limits (`ASSUMED` / `CONFIRMED`) | TODO |
| `config/hypothetical_enablers.yaml` | Declared hypothetical enablers (max 3) relaxing specified quantities | TODO |
| `results/reference.json` | Closed-form benchmark answers, Section 2 hand-computed facts, and test tolerances | TODO |
| `docs/physics.md` | Plain-language explanation of every physical equation and SI unit | TODO |
| `octo/__init__.py` | Top-level package entry point (`octo.run(config_dict, mode=...)`) | TODO |
| `octo/core/constants.py` | Universal physical constants (IAU 2012/2015, CODATA 2018/2022) in SI units | TODO |
| `octo/core/thresholds.py` | Loader and schema validator for `config/rulebook_thresholds.yaml` | TODO |
| `octo/core/units.py` | Boundary unit wrappers (`Meters`, `Kilograms`, `Seconds`, etc.) and SI conversions | TODO |
| `octo/core/state.py` | Deterministic container for bodies, stored energy, heat, and radiated energy | TODO |
| `octo/core/exchange.py` | Immutable `Exchange` contract for all inter-body forces, power, heat, and mass flow | TODO |
| `octo/core/flags.py` | `Flag` dataclass and `FlagRegistry` matching flags against declared enablers | TODO |
| `octo/core/ledger.py` | Conservation `Ledger` (`book`, `audit`, Kahan/`math.fsum` totals, rogue-driver detection) | TODO |
| `octo/core/recorder.py` | Parquet summary row writer and configurable binary (`OCTO`) replay writer skeleton | TODO |
| `octo/drivers/orbit.py` | Orbital mechanics helpers, Section 2 energetics, two-body and N-body (`rebound`) driver | TODO |
| `octo/drivers/propulsion.py` | Pluggable propulsion interface and variants | TODO |
| `py/experiments/` | Parameter sweeps, Monte Carlo, Optuna optimization, surrogate, and report generation | TODO |
| `tests/test_readme.py` | Verifies `README.md` exists and contains all 10 required sections | TODO |
| `tests/test_thresholds.py` | Config schema, unit/status/severity validation, and `AssumedThresholdWarning` tests | TODO |
| `tests/test_no_hardcoded_limits.py` | AST scanner forbidding hard-coded rulebook threshold literals in `octo/` | TODO |
| `tests/test_physics.py` | Closed-form orbital mechanics, Hohmann transfer, and Section 2 energetics tests | TODO |
| `tests/test_core_contracts.py` | Unit wrappers, `Exchange` immutability, `State` determinism, and `Flag` contract tests | TODO |
| `tests/test_ledger.py` | Conservation `Ledger` tests (self/NaN/Inf rejection, reaction pairs, rogue-driver audit, rocket exhaust, `math.fsum`, determinism) | TODO |
| `tests/test_flags.py` | `FlagRegistry` tests (enabler matching, capability bounds, max-3 enablers, duplicate IDs) | TODO |
| `tests/test_recorder.py` | `ParquetResultsWriter` and configurable **DRAFT** `BinaryReplayRecorder` tests | TODO |

---

## 5. Contracts Other People Code Against

### `Exchange` (`octo/core/exchange.py`) — **STABLE**
Immutable dataclass (`frozen=True`) representing a physical interaction between component `a` (exerting) and component `b` (receiving):
- `t: float` — simulation time $[\text{s}]$
- `a: str | int` — exerting component ID
- `b: str | int` — receiving component ID (`a != b`)
- `force_on_b: np.ndarray` — 3D force vector $[\text{N}]$ on `b` (reaction on `a` is `-force_on_b`, created automatically by `Ledger.book`)
- `point: np.ndarray` — 3D application point $[\text{m}]$ in inertial frame for torque calculation
- `power_in: float = 0.0` — power drawn from stored energy source $[\text{W}]$
- `heat_out: float = 0.0` — dissipated thermal power $[\text{W}]$
- `mass_out: float = 0.0` — reaction mass expelled rate $[\text{kg/s}]$ or discrete mass $[\text{kg}]$ over step
- `exhaust_v: np.ndarray | None = None` — 3D exhaust velocity relative to `a` $[\text{m/s}]$
- `owner: str = ""` — name/ID of the driver that posted the exchange

### `Flag` & `FlagRegistry` (`octo/core/flags.py`) — **STABLE**
- `Flag(code: str, t: float, source: str, quantity: str, value: float, limit: float, enabler_id: str | None = None)`
- `FlagRegistry(enablers_config)` — validates at most 3 enablers, links flags whose `quantity` matches an enabler's `relaxes` list (and within enabler's `value` capability), and marks all other flags as unresolved.

### `Driver` (`octo/core/` / `octo/drivers/`) — **STABLE**
Abstract base interface for all physics drivers:
- `step(state: State, t: float, dt: float, ledger: Ledger) -> None`
- `dt_hint() -> float`
- `outputs(state: State) -> dict[str, Any]`
- `name() -> str`

### `Ledger` (`octo/core/ledger.py`) — **STABLE**
- `book(exchange: Exchange, dt: float = 1.0) -> None` — validates `a != b` and finite values, creates the reaction on `a`, books torque and expelled mass momentum/KE using compensated summation (`math.fsum` / Kahan).
- `audit(state: State, t: float) -> list[Flag]` — independently recomputes linear momentum, angular momentum, mass, and total energy from `State` + cumulative exhaust/heat/radiation and compares against expected conservation baseline; emits drift flags (`MOMENTUM_DRIFT`, `ANGULAR_MOMENTUM_DRIFT`, `ENERGY_DRIFT`, `MASS_DRIFT`) if tolerances in `config/rulebook_thresholds.yaml` are exceeded.

### Propulsion Functional/Callable Interface (`octo/drivers/propulsion.py`) — **STABLE**
- Signature: `(time_s: float, position_m: np.ndarray, velocity_m_s: np.ndarray, mass_kg: float) -> tuple[np.ndarray, float, float, float]`
- Returns: `(thrust_vector_N, power_W, mass_flow_kg_s, exhaust_velocity_m_s)` in SI units.

### Replay Telemetry Schema (`docs/replay_schema.md`, `py/export_replay.py`) — **DRAFT v2**
- JSON format (`OCTO_JSON`, version 2, status `DRAFT`).
- Includes top-level `meta` block with architecture concept (`"Ceres Tug"`), `thresholds_confirmed: false`, `config_hash` (SHA-256), `units` dictionary, `focus_body_id: "Sun"` (Sun fixed at origin `(0, 0, 0)` in all frames), `frame_count` ($\le 2000$), and `downsampling_note`.
- Guarantees $t=0$ epoch frame is present as `frames[0]`.
- Per-body telemetry: positions in AU relative to focus body, inertial velocities in km/s (`vx`, `vy`, `vz`), and instantaneous mass (`mass_kg`).
- Ceres Tug runs include `tug_telemetry` (`thrust_n`, `tug_earth_distance_m`, `beam_power_w`, `beam_directions`, `propellant_spent_kg`).
- Relative `ledger_drifts` (`energy`, `momentum`, `angular_momentum`, `mass`) from conservation audit.
- Unproduced/deferred fields are strictly `null` (`joint_angles_rad`, `segment_safety_factors`, `num_arm_segments`).

---

## 6. Rules for Contributors and Their AI Agents

1. **Strict TDD Always:** Write the failing test first (**RED**), run `pytest` and show it failing, write minimal code to pass (**GREEN**), then clean up (**REFACTOR**). Never write implementation code before a failing test exists.
2. **One Home for Every Number:**
   - Universal constants live **only** in `octo/core/constants.py`.
   - Organizer/rulebook limits live **only** in `config/rulebook_thresholds.yaml`.
   - Benchmark answers and test tolerances live **only** in `results/reference.json`.
   - Run parameters and integrator tolerances (`rtol`, `atol`) live in `config/base.yaml`.
   - Impossible assumptions live **only** in `config/hypothetical_enablers.yaml` (max 3).
3. **No Hard-Coded Limits:** `tests/test_no_hardcoded_limits.py` scans the AST of every file under `octo/` and fails if any rulebook threshold number appears as a literal.
4. **Never Change a STABLE Contract Without Team Agreement:** `Exchange`, `Flag`, `Driver`, `Ledger`, and `FlagRegistry` are shared contracts across all drivers.
5. **Drivers Never Talk to Each Other:** Drivers read shared `State` and post `Exchange` records to `Ledger`. All coupling goes through `State` and `Ledger`.
6. **Determinism:** Single-threaded execution inside a run, fixed reduction order, `math.fsum` / Kahan summation for ledger totals. Same config must produce bit-identical output.
7. **Keep `README.md` Updated:** Updating and committing `README.md` is part of the Definition of Done for every step.

---

## 7. Agent Briefing

Copy and paste the block below into your AI coding assistant when starting a task on this repository:

```text
You are working on the "Octo-Earth" (OrbitShift) simulation core in Python 3.11+ (.venv/bin/pytest).
Read README.md and ARCHITECTURE.md before making any changes.
Follow these non-negotiable rules:
1. STRICT TDD: For every change, write a failing test first (RED), run `.venv/bin/pytest` to show it failing, write minimal code to pass (GREEN), and refactor.
2. ONE HOME FOR EVERY NUMBER: Never hard-code limits or tolerances in Python functions or tests. Universal constants live in `octo/core/constants.py`, organizer limits in `config/rulebook_thresholds.yaml`, benchmark references/tolerances in `results/reference.json`, and run settings in `config/base.yaml`. `tests/test_no_hardcoded_limits.py` enforces this via AST inspection.
3. CONSERVATION & ISOLATION: Drivers never call other drivers. They read `State` and book `Exchange` records to `Ledger`. Every force has an automatic equal-and-opposite reaction.
4. DETERMINISM: Use fixed iteration order and `math.fsum` for reductions. Do not introduce in-run multithreading or non-deterministic reductions.
5. DEFINITION OF DONE: All tests in `.venv/bin/pytest -v` must pass, `tests/test_no_hardcoded_limits.py` and `tests/test_readme.py` must pass, and `README.md` Section 2 & Section 10 must be updated and committed.
```

---

## 8. Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-24 | Implement simulation core in Python 3.11+ (`octo` package) instead of C++20 | Faster iteration while preserving identical `Exchange`/`Ledger`/`Driver` architecture and determinism rules |
| 2026-10-24 | Use exact IAU 2012/2015 & CODATA 2018/2022 constants in `octo/core/constants.py` | Standardizes `GM_SUN = 1.32712440018e20`, `AU = 1.495978707e11`, `M_EARTH = 5.9722e24`, `YEAR = 31557600.0` with documented sources |
| 2026-10-24 | Store benchmark reference values & tolerances in `results/reference.json` | Keeps `config/rulebook_thresholds.yaml` strictly for organizer/appendix limits |
| 2026-10-24 | Require explicit `rtol` and `atol` in `propagate_orbit` (configured in `config/base.yaml`) | Eliminates default tolerance literals from `octo/drivers/orbit.py`, keeping `ALLOWLIST` minimal (`0.5` only) |
| 2026-10-24 | Keep propulsion concept pluggable via `config/base.yaml` | Allows testing mass driver, ion/fusion exhaust, solar sail, gravity tractor, and Lorentz-force arms behind one interface |
| 2026-10-24 | Primary Architecture: Accept Ceres Gravity Tug with physical corrections | Analytical audit and research validation proved Candidate A viable with corrections: variable separation $d(t)$, out-of-ecliptic bi-conical canted plumes ($\pm 5^\circ\text{–}10^\circ$) to clear Moon ($1.137 \times 10^8\text{ m} > 3.3\times$ lunar excursion) and prevent sterilization; beam push booking $\psi_r = 8.70^\circ$ yaw trim; and off-axis L1 solar concentrator. DEFERRED: Octo-Earth (rigid circumterrestrial ring / equatorial tethers), ring/arms, replay/frontend. |
| 2026-10-24 | Propose Enablers E1, E2, E3 (Pending Section 7 confirmation) | E1: power collector plus beamed link; E2: Ceres-class tug moved to Earth's orbit, the 0.3c accelerator and the asteroid belt reaction-mass supply; E3: shadow shield, radiators and off-axis sunlight lens. Kept proposed until Section 7 rulebook text confirmed. |
| 2026-10-24 | Tug Propellant Resupply vs Standoff Scaling | If propellant is resupplied continuously from the asteroid belt (part of Enabler E2), Tug mass $M_{\text{tug}}$ stays constant. Alternatively, if propellant depletes from Ceres without resupply, recomputing standoff distance as $d(t) = \sqrt{G M_{\text{tug}}(t) / a_{\oplus}}$ delivers the exact constant pull $F_{\text{grav}} = M_{\oplus} a_{\oplus}$ on Earth regardless of depletion, verified within $10^{-5}$ relative tolerance. |
| 2026-10-24 | Replay Schema DRAFT v2 | Updated schema in `docs/replay_schema.md` with explicit `meta` provenance, $t=0$ epoch guarantee, Sun-centric origin, velocity/mass reporting, and `tug_telemetry`. Generated two validated replay artifacts: `results/replay_hohmann.json` and `results/replay_ceres_tug.json`. |
| 2026-10-24 | Step 4.2 Decisions: Adopt $\dot{m} = 2.501 \times 10^9\text{ kg/s}$, Option B Recommendation, Reduced Model | Adopted mass flow rate $\dot{m} = 2.501 \times 10^9\text{ kg/s}$ in `config/base.yaml` ensuring target arrival at 2.7 AU in $\sim 9,500$ years with margin. Tug mass is held constant via continuous asteroid belt resupply under Enabler E2. Evaluated two consistent configs: Option A ($M_{\text{tug}} = 9.4\times 10^{20}\text{ kg}, d=1.27\times 10^9\text{ m}$) vs Option B ($M_{\text{tug}} = 2.73\times 10^{20}\text{ kg}, d=6.84\times 10^8\text{ m}$); recommended Option B for orbital safety ($0.457 R_{\text{Hill}}$, $3.2\times$ less controller effort) while keeping Option A in `base.yaml`. Integrated long-duration runs using the Reduced (Averaged) Model where REBOUND IAS15 integrates Sun and Earth only, and Tug is driver-managed along the track, booking full exchanges to Ledger. Validated against full N-body model over 5-20 years ($< 4\%$ diff) and independent closed-form spiral benchmarks at 100, 500, 1000 yr within $1.0\times 10^{-3}$ relative error. |
| 2026-10-24 | Step 4.3 Decisions: Benchmark Config Sync, Heliocentric Replay Frame 0, 200-Yr Reduced vs Full Audit, Actor Ledger | Synced `tools/closed_form_spiral.py` and `results/reference.json` directly with `config/base.yaml` ($F_{\text{nom}} = 2.3580\times 10^{17}\text{ N}$, $F_{\text{eff}} = 2.3256\times 10^{17}\text{ N}$, $a(100, 500, 1000\text{ yr}) = 1.008303, 1.042572, 1.087921\text{ AU}$, arrival $9,486.85\text{ yr}$). Removed all hand-typed thrust literals from tests. Fixed `py/export_replay.py` so Frame 0 equals the exact initial config state at $t=0$ and both positions and velocities are heliocentric (`Sun` position and velocity identically zero). Tested 200-yr Reduced vs Full N-body window against 1% `ARCHITECTURE.md` tolerance (`ASSUMED` in `config/base.yaml`), recording an honest 6.40% least-squares $da/dt$ discrepancy caused by 1D PD controller standoff droop ($d_{\text{eq}} = 0.9691 d_0 \implies 1/d^2 = 1.0648$). Documented full 9,516-year per-actor conservation closure in `reports/ledger_by_actor.md`. |

---

## 9. Open Questions and ASSUMED Values

### Open Questions (from `ARCHITECTURE.md` Section 13)
1. Official rulebook appendix values and units (to replace `ASSUMED` entries in `config/rulebook_thresholds.yaml`).
2. Official organizer benchmark list and reference implementations.
3. Exact rulebook Section 7 wording on hypothetical enablers.
4. Required competition submission entry point / CLI format.
5. Final team choice of primary propulsion variant and parameters.
6. Exact target orbit arrival tolerance and eccentricity limit.
7. Moon retention scoring rule and habitability climate model specification.
8. Replay binary schema confirmation with frontend owner (currently **DRAFT**).

### ASSUMED Thresholds Waiting for Rulebook Appendix (`config/rulebook_thresholds.yaml`)
Until confirmed, any clean run reports `"PASS (with unconfirmed thresholds)"`:
- `earth_safety.max_acceleration_m_s2` (`0.098 m/s^2`)
- `earth_safety.max_jerk_m_s3` (`0.001 m/s^3`)
- `earth_safety.moon_retention_hill_fraction` (`0.5 fraction`)
- `earth_safety.max_mass_loss_fraction` (`0.01 fraction`)
- `earth_safety.min_insolation_w_m2` (`150.0 W/m^2`) / `max_insolation_w_m2` (`1500.0 W/m^2`)
- `earth_safety.min_equilibrium_temp_k` (`150.0 K`) / `max_equilibrium_temp_k` (`320.0 K`)
- `earth_safety.max_insolation_rate_w_m2_yr` (`10.0 W/m^2/yr`)
- `earth_safety.max_surface_waste_heat_w_m2` (`5.0 W/m^2`)
- `earth_safety.exhaust_reimpact_allowed` (`false`)
- `earth_safety.thermal_shield_attenuation` (`1.0e-5 fraction`)
- `orbit_targets.target_radius_au` (`2.7 AU`), `target_radius_tolerance_au` (`0.05 AU`), `max_eccentricity` (`0.05`)
- `conservation.max_energy_rel_error` (`1e-9`), `max_momentum_rel_error` (`1e-9`), `max_mass_rel_error` (`1e-12`)

---

## 10. Changelog

- **2026-10-24 (`1760db8`):** Pre-restructure baseline (Phase 0 & Phase 1 initial prototype).
- **2026-10-24 (`341a176` — `20ae2c8`):** Step 1 — Restructured into `octo/` package, added `pyproject.toml`, `config/base.yaml`, `config/rulebook_thresholds.yaml`, `config/hypothetical_enablers.yaml`, `results/reference.json`, Section 2 physics benchmarks, and AST hard-coded limit check (`tests/test_no_hardcoded_limits.py`).
- **2026-10-24 (`3d8cfca`):** Step 2.0 — Created `README.md` and `tests/test_readme.py`; removed default `rtol`/`atol` from `propagate_orbit` so `ALLOWLIST` only contains `0.5`.
- **2026-10-24 (`7efe2ea`):** Step 2.1 — Added `octo/core/units.py`, `octo/core/exchange.py`, `octo/core/state.py`, `octo/core/flags.py`, and `tests/test_core_contracts.py`.
- **2026-10-24 (`1ae3c31`):** Step 2.2 — Added `octo/core/ledger.py` and `tests/test_ledger.py` (reaction pairing, rogue-driver audit, rocket-equation exhaust closure, `math.fsum` exact summation, bit-identical determinism).
- **2026-10-24 (`bc08e8d`):** Step 2.3 — Added `FlagRegistry` capability/ID validation and `tests/test_flags.py`.
- **2026-10-24 (`a3ecfe0`):** Step 2.4 — Added `octo/core/recorder.py` (`ParquetResultsWriter` + configurable **DRAFT** `BinaryReplayRecorder`), `tests/test_recorder.py`, and updated `docs/physics.md` and `README.md`.
- **2026-10-24 (Step 3.0):** Verification Gate completed. All 7 ledger mutations tested and killed (reaction creation omission, empty audit bypass, multi-scale `math.fsum` vs `sum` cancellation drift, rocket exhaust kinetic energy omission, point torque drop, FlagRegistry bypass, and GM_SUN 1% drift). Tested toy radiative-equilibrium thermal shield model proving $(1-R)^N$ invalid and requiring configurable `ASSUMED` threshold `thermal_shield_attenuation`. Ceres Gravity Tug accepted as primary design with physical corrections; Octo-Earth ring/arms deferred. Core test coverage at 90%.
- **2026-10-24 (Step 3.1):** Added `OrbitDriver` in `octo/drivers/orbit.py` with REBOUND IAS15 integrator, body population from `State`, external forces from `Ledger` via `sim.additional_forces` callback, and integrator tolerances loaded from `config/base.yaml`. Added tests in `tests/test_orbit_rebound.py` verifying 1-year Sun-Earth orbit closure within reference tolerances, zero audit drift via `Ledger.audit()`, Kepler third law period matching, external force acceleration, and wall-time performance (1 yr = 0.0020 s, 10,000 yr extrapolated = 19.8 s). All 53 tests passing.
- **2026-10-24 (Step 3.2):** Added `octo/core/coupler.py` implementing `DriverRegistry` from config, macro-step Strang splitting loop (`dt / 2` power/propulsion, `dt` orbit, `dt / 2` propulsion/power, post-step structure/habitability), `ledger.audit` called every step, Parquet writing via `ParquetResultsWriter`, and trajectory/telemetry plotting with Matplotlib. Added unit and integration tests in `tests/test_coupler.py`. All 58 tests passing, AST limit scan clean.
- **2026-10-24 (Step 3.3):** First Milestone completed! Simulated complete Hohmann transfer $1.0\text{ AU} \to 2.7\text{ AU}$ for test probe (mass and engine parameters from `config/base.yaml`). Both impulsive burns booked as mass-ejection `Exchange`s with counterparties declared in `State` (`ExhaustSink`, `PowerPlant`). Verified $\Delta v_1 \approx 6.198\text{ km/s}$, $\Delta v_2 \approx 4.800\text{ km/s}$, total $\Delta v \approx 10.997\text{ km/s}$, transfer duration $\approx 1.258\text{ yr}$ against `results/reference.json`. Audit passed with zero flags across both burns and coast; exhaust momentum and kinetic energy confirmed to match the rocket equation. Total tests: 59 passing.
- **2026-10-24 (Step 3.4):** Implemented `py/export_replay.py` exporting Parquet telemetry to `results/replay.json` following the DRAFT schema. Tested schema compliance, frame cap ($\le 2000$ frames with even decimation), preservation of nulls for unproduced fields (arms/structure), and round-trip position accuracy. Total tests: 62 passing.
- **2026-10-24 (Step 4):** Implemented `CeresTugDriver` in `octo/drivers/propulsion.py` with relativistic rocket dynamics ($v_e = 0.3c$, $\gamma \approx 1.048285$, $F = \dot{m}\gamma v_e$, $P_{\text{jet}} = (\gamma - 1)\dot{m}c^2$), two-cone out-of-ecliptic plume canting ($5^\circ$), photon beam push compensation with in-ecliptic yaw trim ($\psi_r \approx 8.6^\circ$), and PD feedback station-keeping controller stabilizing the unstable 19-day along-track equilibrium under perturbations. Validated target radius cutoff at 2.7 AU with circularization reporting. Confirmed macro-step convergence (halved step difference $< 0.1\%$) and 1,000-year timing benchmark ($4.05\text{ s}$ wall time $\implies 40.5\text{ s}$ extrapolated to 10,000 years). Raised `octo/drivers/propulsion.py` coverage to 100%. Total tests: 72 passing.
- **2026-10-24 (Step 4.1):** Verified Tug run and independent slow-spiral trajectory. Added closed-form spiral benchmark in `tests/test_tug_trajectory.py` matching `results/reference.json` ASSUMED benchmarks at 100, 500, and 1,000 years (1.0076, 1.0401, 1.0832 AU). Reported nominal arrival time of 10,144 years (exceeding 10,000 yr by 1.4% due to $1.5\%$ combined cant and yaw losses) and proposed config change for margin: target 9,500 yr with $\dot{m} = 2.501 \times 10^9\text{ kg/s}$, engine thrust $2.358 \times 10^{17}\text{ N}$, jet power $1.085 \times 10^{25}\text{ W}$, and propellant consumption $7.498 \times 10^{20}\text{ kg}$ (within Ceres' mass). Proved delivered pull invariance under tug mass depletion ($10^{-5}$ tolerance). Completed 1-year Sun-Earth-Moon-Tug N-body stability study: standoff deviation 630.8 km ($0.4570 R_{\text{Hill}}$), Moon stays safely bound. Redid 1,000-year timing with full coupler loop and audit every step (wall time 25.69 s $\implies$ 256.9 s / 4.28 min for 10,000 years). Renumbered build steps 5 to 9; marked `em` driver as DEFERRED.
- **2026-10-24 (Step 3.4b):** Upgraded replay telemetry export to DRAFT v2 (`docs/replay_schema.md`). Implemented comprehensive `meta` provenance block, $t=0$ epoch frame guarantee, Sun-centric origin `(0, 0, 0)`, per-body velocities and masses, `tug_telemetry` with beam vectors and power, and relative `ledger_drifts`. Generated both `results/replay_hohmann.json` (301 frames) and `results/replay_ceres_tug.json` (600 frames). Added full schema, $t=0$, origin, velocity finite-difference consistency, and round-trip tests in `tests/test_export_replay.py`. All 81 tests passing.
- **2026-10-24 (Step 4.2):** Completed Step 4.2 — Config Consistency, Option A vs Option B N-body study, Reduced (Averaged) Model, independent closed-form spiral tool, full 9,516-year simulation + 50-year unpowered coast, and replay export.
  1. *Config Consistency:* Verified old config pull discrepancy ($8.009 \times 10^{17}\text{ N}$ vs $2.160 \times 10^{17}\text{ N}$, $73\%$ discrepancy). Added `tests/test_config_consistency.py` demonstrating RED on old config and GREEN on consistent configs. Created `config/ceres_tug_option_b.yaml`. Conducted 1-year Sun-Earth-Moon-Tug N-body controller benchmark: Option A ($d=1.27\times 10^9\text{ m}, d/R_{\text{Hill}} = 0.8487$, max dev $63,251\text{ km}$, max $\Delta F = 1.057\times 10^{17}\text{ N}$) vs Option B ($d=6.84\times 10^8\text{ m}, d/R_{\text{Hill}} = 0.4570$, max dev $12,473\text{ km}$, max $\Delta F = 4.256\times 10^{16}\text{ N}$, $3.2\times$ less effort). Recommended Option B.
  2. *Reduced Model:* Integrated REBOUND IAS15 for Sun and Earth only with driver-managed Tug at Earth $+ d\hat{\mathbf{t}}$. Tug pulls Earth via `net_force_on("Earth", exclude_sources={"Sun"})`. Validated against full N-body over 5, 10, 20 years ($0.31\%$, $1.8\%$, $3.95\%$ diff).
  3. *Independent Spiral Benchmark:* Authored standalone `tools/closed_form_spiral.py` importing nothing from `octo`. Updated `results/reference.json` benchmarks to include losses ($1.0818\text{ AU}$ at 1000 yr). Verified reduced model matches at 100, 500, 1000 yr within $1.0\times 10^{-3}$ relative error.
  4. *Full 9,500-Year Run:* Executed `py/run_full_spiral_simulation.py` to $2.7000\text{ AU}$ at $t = 9516.03\text{ years}$ plus 50-year coast ($a = 2.7000\text{ AU}$, $e = 0.000093$, propellant spent $7.511 \times 10^{20}\text{ kg} = 79.9\%$ Ceres mass, jet power $1.085 \times 10^{25}\text{ W}$, ledger audit passed, wall time $54.4\text{ s}$). Saved plot to `results/spiral_trajectory_9500yr.png`.
  5. *Replay Export:* Generated `results/replay_ceres_tug.json` with 1,201 frames spanning the full 9,566-year trajectory ($t=0$ to $t=301,880,952,000\text{ s}$, $r=2.7002\text{ AU}$, unpowered coast telemetry recorded). All 82 tests passing. Coverage: `octo/drivers/propulsion.py` at 96%, overall `octo` at 91%.
- **2026-10-24 (Step 4.3):** Completed Step 4.3 — Benchmark Sync, Replay Frame 0 & Heliocentric Velocities, 200-Year Reduced vs Full N-Body Window & Lunar Oscillation, and Per-Actor Ledger Report.
  1. *Benchmark Sync (`tools/closed_form_spiral.py`, `results/reference.json`):* Updated `tools/closed_form_spiral.py` to parse `config/base.yaml` directly (YAML only, zero `octo` imports) and regenerated `spiral_trajectory_benchmark` in `results/reference.json` ($F_{\text{nom}} = 2.357952 \times 10^{17}\text{ N}$, $F_{\text{eff}} = 2.325648 \times 10^{17}\text{ N}$, $\psi_{\text{yaw}} = 8.0822^\circ$, $a(100, 500, 1000\text{ yr}) = 1.008303, 1.042572, 1.087921\text{ AU}$, arrival $9,486.85\text{ yr}$). Removed all hand-typed thrust literals from tests. Explained arrival time delta ($9,516.03\text{ yr}$ vs $9,486.85\text{ yr}$).
  2. *Replay Frame 0 & Heliocentric Velocities (`py/export_replay.py`, `docs/replay_schema.md`):* Fixed `export_parquet_to_replay_json` so Frame 0 equals the exact initial config state at $t=0\text{ s}$ even when the Parquet file starts at $t > 0$, and made both positions and velocities strictly heliocentric (`Sun` position and velocity identically zero). Re-exported `results/replay_ceres_tug.json` and `results/replay_hohmann.json`.
  3. *200-Year Reduced vs Full N-Body & Moon Oscillation (`tests/test_reduced_model.py`, `config/base.yaml`):* Added `reduced_model_validation_tol: 0.01` (`ASSUMED`) to `config/base.yaml`. Ran 200-year comparison of Sun+Earth+Tug (full N-body with controller) vs Reduced Model: reported $\Delta a(t)$ at 10, 20, 50, 100, 150, 200 yr, least-squares $da/dt$ ($8.8806 \times 10^{-5}$ vs $8.3461 \times 10^{-5}\text{ AU/yr}$, ratio $1.0640$), recording an honest FAIL against the 1% target caused by the 1D PD controller's steady-state standoff droop ($d_{\text{eq}} = 0.9691 d_0 \implies 1/d^2 = 1.0648$). Measured 1-year lunar reflex oscillation of Earth's osculating $a(t)$ ($\pm 9.45 \times 10^{-4}\text{ AU}$ amplitude, $1.890 \times 10^{-3}\text{ AU}$ peak-to-peak).
  4. *Per-Actor Conservation Ledger (`octo/core/ledger.py`, `reports/ledger_by_actor.md`):* Added `Ledger.summary_by_actor()` and generated `reports/ledger_by_actor.md` documenting mass, momentum, angular momentum, and energy closure across `PowerPlant` (E1), `BeltSupply` (E2), `ExhaustSink` (E2), `Radiation` (E3), and simulated bodies (`Sun`, `Earth`, `Tug`).
