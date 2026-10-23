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
- **Last Prior Commit Hash:** `20ae2c8` (`step 1d: add test_no_hardcoded_limits.py and update docs/physics.md`)
- **Current Test Count & Result:** 23 tests — **23 PASSED** (`pytest -v`)
- **Build Steps Progress:**
  - **Step 0 (Audit & Architecture Mapping):** DONE
  - **Step 1 (Restructure into `octo/`, Configs, `reference.json`, AST Limit Check):** DONE
  - **Step 2 (`octo/core/`: README, `units`, `state`, `exchange`, `ledger`, `flags`, `FlagRegistry`, `recorder` skeleton):** IN PROGRESS (Step 2.0 complete)
  - **Step 3 (`orbit` driver + Coupler + Hohmann Milestone):** NOT STARTED
  - **Step 4 (`propulsion` driver variants + Rocket/Power cross-checks):** NOT STARTED
  - **Step 5 (`structure` + `em` drivers):** NOT STARTED
  - **Step 6 (`multibody` driver + `windowed_full` thrust-map builder):** NOT STARTED
  - **Step 7 (`power` + `habitability` drivers + threshold validator):** NOT STARTED
  - **Step 8 (`averaged` mode in coupler + thrust-map agreement report):** NOT STARTED
  - **Step 9 (`py/experiments/`: sweep, montecarlo, optimize, surrogate):** NOT STARTED
  - **Step 10 (Three.js frontend + live WebSocket server):** NOT STARTED
  - **Step 11 (Final report generator):** NOT STARTED

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

### Replay Binary Schema (`octo/core/recorder.py`) — **DRAFT**
- Header (`OCTO` magic, version, endianness, frame/body/segment counts, units, `focus_body_id`), float32 relative positions, joint angles, safety factors, ledger drifts, and trailing flag table. Marked **DRAFT** until confirmed with the frontend owner.

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
- `orbit_targets.target_radius_au` (`2.7 AU`), `target_radius_tolerance_au` (`0.05 AU`), `max_eccentricity` (`0.05`)
- `conservation.max_energy_rel_error` (`1e-9`), `max_momentum_rel_error` (`1e-9`), `max_mass_rel_error` (`1e-12`)

---

## 10. Changelog

- **2026-10-24 (`1760db8`):** Pre-restructure baseline (Phase 0 & Phase 1 initial prototype).
- **2026-10-24 (`341a176` — `20ae2c8`):** Step 1 — Restructured into `octo/` package, added `pyproject.toml`, `config/base.yaml`, `config/rulebook_thresholds.yaml`, `config/hypothetical_enablers.yaml`, `results/reference.json`, Section 2 physics benchmarks, and AST hard-coded limit check (`tests/test_no_hardcoded_limits.py`).
- **2026-10-24 (Step 2.0):** Created `README.md` and `tests/test_readme.py`; removed default `rtol`/`atol` from `propagate_orbit` so `ALLOWLIST` only contains `0.5`.
