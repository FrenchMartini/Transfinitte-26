# Octo-Earth Simulation: Architecture and Build Specification

Handoff document for an AI (or engineer) building this system. Read it fully before writing code. Sections 1 to 3 are context and constraints. Sections 4 to 10 are the design to implement. Section 11 is the build order. Section 12 lists open questions that need a human answer.

---

## 1. Project context

This is a software entry for the TRANSFINITTE challenge (organizer: Black Ant Robotics; National Institute of Technology Tiruchirappalli / Institution's Innovation Council).

**Challenge:** build a computer simulation of a machine that moves Earth to a new orbit, for example from 1 AU out to about 2.7 AU near the asteroid belt, without harming the planet or life on it.

**Reference concept, "Octo-Earth":**
- A structural ring built around Earth along a great circle.
- Eight articulated arms rooted on the ring at equal 45 degree spacing, all at the same mounting radius.
- Arms up to about 12,000 km long, with segments, hinges, motors and a gripper at each tip.
- Conductors in the arms carry current that interacts with magnetic fields through the Lorentz force.
- The arms extend together on coordinated trajectories and keep the system balanced.

The team may simulate Octo-Earth, change it, or propose another concept acting on a planet-sized body (gravity tractor, steered asteroid flybys, mass driver, solar sail or mirror array, magnetic sail). The propulsion method is therefore **pluggable** and must be swappable by configuration.

**Winning conditions (all required):**

| Condition | Meaning in practice |
|---|---|
| Earth reaches its target orbit | Within 10,000 simulated years |
| Earth stays safe | Every threshold in the rulebook appendix holds for the whole run |
| The structure survives | Every structural safety factor stays at or above 1.5 |
| The code is validated | Every applicable benchmark passes |
| The physics is honest | Every force booked with its reaction; energy and momentum conserved |
| No unresolved flags | Only flags caused by the declared hypothetical enablers are allowed |

Up to **three hypothetical enablers** may be declared (rulebook section 7). Entries that honestly show their concept failing are still scored and can win other awards. Honesty is therefore valued over a fake pass.

**Not yet seen by the author of this document:** the rulebook appendix (thresholds), the benchmark list, section 7 text, the scoring rubric, and the required submission format and interfaces. Treat every threshold in this document as a placeholder to be replaced by `config/rulebook_thresholds.yaml`.

---

## 2. Key physics facts the design must respect

All values were computed by hand and should be re-verified in code (these become benchmark tests).

- GM_sun = 1.327e20 m^3/s^2, 1 AU = 1.496e11 m, Earth mass = 5.972e24 kg.
- Circular speed at 1 AU is about 29.8 km/s; at 2.7 AU about 18.1 km/s.
- Hohmann transfer 1 AU to 2.7 AU: about 6.2 km/s plus 4.8 km/s, total about 11.0 km/s. A slow continuous-thrust circle-to-circle spiral costs about 11.7 km/s.
- Orbital energy E = -GMm/2a. For Earth: E(1 AU) = -2.65e33 J, E(2.7 AU) = -0.98e33 J, so **delta E = +1.67e33 J**.
- Spread over 10,000 years (3.16e11 s) this needs about **5e21 W** average power, roughly 30,000 times all sunlight Earth intercepts (about 1.7e17 W) over that period. An energy-source enabler is unavoidable.
- Average thrust needed is about M * dv / t = 2e17 N. Jet power at 100% efficiency is 0.5 * F * v_e, consistent with the energy figure (use as a cross-check).
- Rocket equation: mass fraction = 1 - exp(-dv / v_e). With v_e = 30 km/s and dv = 11.7 km/s this is about 0.32 of Earth's mass. At v_e = 3,000 km/s (fusion class) it is about 0.4 percent of Earth's mass, but required power rises about a hundredfold.
- **Newton's third law is the core constraint.** Internal forces cannot move the centre of mass of a closed system. Every concept must identify what it exchanges momentum with: ejected reaction mass, radiation, the solar wind or interplanetary magnetic field, or other bodies. The Lorentz force on the arms needs an external field, and the reaction on the field source must be booked.
- Sunlight pressure on Earth's cross-section gives only about 6e8 N, about 3e8 times too small, so a sail or mirror only works at Dyson-swarm scale (an enabler).
- Insolation at 2.7 AU is about 7 times lower than at 1 AU, which matters for the habitability check.

---

## 3. Guiding principles

1. **Conservation first.** No driver may apply a force without its reaction. The ledger enforces this structurally, not by convention.
2. **Drivers never talk to each other.** They read shared state and post `Exchange` records to the ledger. All coupling goes through the ledger and the state.
3. **Honest failure beats a fake pass.** If a concept fails a condition, report it clearly.
4. **Determinism.** The same config must produce bit-identical output. Single-threaded runs, fixed reduction order, no fast-math.
5. **Python never computes physics.** It sets up runs and analyses results. The final answer always comes from a full deterministic C++ run, never from a surrogate.
6. **Everything assumed is declared.** Any physically impossible assumption must appear in `hypothetical_enablers.yaml`, and any flag it causes must link to it.
7. **Validate before extending.** Every module ships with benchmarks against closed-form results before more complexity is added.

---

## 4. System overview

```
Python (experiments)    Optuna, sweeps, Monte Carlo, surrogate, reports
        |  nanobind (in process)  or  CLI + Parquet
        v
C++20 core (libocto)    Coupler -> Drivers -> Ledger/Validator -> Recorder
        |  (a) run files   (b) WebSocket stream
        v
Three.js frontend       orbit view, arm view, ledger dashboard
```

| Layer | Language | Main tools |
|---|---|---|
| Simulation core | C++20 | CMake, Eigen, REBOUND (N-body, C library), Pinocchio or RBDL (multibody), yaml-cpp, spdlog |
| Bindings | C++ exposing a Python API | nanobind (pybind11 acceptable) |
| Experiments | Python 3.12 | Optuna, NumPy, pandas, scikit-learn or PyTorch, pytest |
| Storage | Parquet, custom binary | Apache Arrow |
| Live stream | C++ | Boost.Beast or uWebSockets |
| Frontend | TypeScript | Three.js, Vite, Plotly or uPlot |
| Config | YAML | yaml-cpp, PyYAML |
| Tests | C++ and Python | GoogleTest or Catch2, RapidCheck, pytest, hypothesis, Google Benchmark |
| DevOps | Docker, CMake presets, GitHub Actions | |

---

## 5. Repository layout

```
octo/
  CMakeLists.txt
  config/
    base.yaml
    hypothetical_enablers.yaml
    rulebook_thresholds.yaml
  cpp/
    core/        state, exchange, ledger, flags, coupler, recorder, units
    drivers/     orbit, propulsion, multibody, em, structure, power, habitability
    bindings/    nanobind module
    server/      WebSocket streamer
    tests/       gtest + benchmarks vs closed-form results
  py/
    sweep.py  montecarlo.py  optimize.py  surrogate.py  report.py
  web/           Vite + Three.js app
  docs/          propulsion.md and per-driver notes
  .github/workflows/
```

---

## 6. Core C++ contracts (implement these first, keep them stable)

These headers are the contract every other component depends on. Changing them requires agreement from all components.

```cpp
// core/units.h : strong types so unit mix-ups fail at compile time.
// Use mp-units, or small wrappers: struct Meters { double v; }; etc.
// All internal math is SI (m, kg, s, N, J, W, T, A).

using ComponentId = std::uint32_t;   // Earth, Sun, Ring, Arm0..Arm7, Tip0..Tip7, ...
using DriverId    = std::uint32_t;

struct Exchange {
  double t;                          // simulation time [s]
  ComponentId a, b;                  // a exerts, b receives
  Vec3 force_on_b;                   // [N]; reaction on a is -force_on_b (created by ledger)
  Vec3 point;                        // application point [m], used for torque
  double power_in   = 0.0;           // energy delivered by a power source [W]
  double heat_out   = 0.0;           // dissipated [W]
  double mass_out   = 0.0;           // reaction mass expelled [kg/s]
  std::optional<Vec3> exhaust_v;     // exhaust velocity relative to a [m/s]
  DriverId owner;
};

struct Flag {
  std::string code;                  // e.g. "MOMENTUM_DRIFT", "SAFETY_FACTOR_LOW"
  double t;
  DriverId source;
  std::string quantity;              // quantity that triggered it
  double value, limit;
  std::optional<std::string> enabler_id;   // set if explained by a declared enabler
};

class Driver {
public:
  virtual ~Driver() = default;
  virtual void step(State&, double t, double dt, Ledger&) = 0;
  virtual double dt_hint() const = 0;                  // natural timescale [s]
  virtual void outputs(const State&, OutputMap&) const = 0;
  virtual std::string name() const = 0;
};

class Ledger {
public:
  void book(const Exchange&);        // creates the reaction pair; rejects unpaired forces
  std::vector<Flag> audit(const State&, double t);     // E, p, L drift and thresholds
  // Totals: linear momentum, angular momentum, energy
  //   (KE + PE + stored + heat + radiated + exhaust KE).
};
```

Rules for the ledger:
- `book()` must make a one-sided force impossible. Include a test that tries to bypass it and expects failure.
- Expelled mass is booked with its momentum and kinetic energy, so the reaction on the planet is explicit.
- Use compensated (Kahan) or `long double` summation for running totals. Fixed reduction order.
- Tolerances (for example relative energy drift per step under 1e-10) are read from config, not hard-coded.
- Drivers register by name from config, so `propulsion` can be swapped without touching the coupler.

**Floating-point rules:** never `-ffast-math`; use `-ffp-contract=off`; no non-deterministic parallel reductions inside a run. Parallelize **across runs**, not inside a run.

---

## 7. Drivers

| Driver | Responsibility | Suggested basis |
|---|---|---|
| `orbit` | N-body dynamics: Sun, Earth, Moon, Jupiter, Mars and others; applies net force from the ledger | REBOUND (WHFast or IAS15) |
| `propulsion` | Pluggable concept: exhaust velocity, mass flow, power, efficiency from config. Posts thrust and exhaust exchanges. Cross-checks thrust against power (P = 0.5 * F * v_e / efficiency) | custom |
| `multibody` | 8 articulated arms (hinges, motors, balancing); angular momentum bookkeeping; builds the cached thrust map | Pinocchio, RBDL, or custom Newton-Euler |
| `em` | Biot-Savart fields from arm currents, Lorentz force F = I (L x B), external field models (Earth, solar wind), resistive losses | custom, IGRF for Earth's field |
| `structure` | Stress, strain, buckling, gravity-gradient and tidal loads, fatigue, thermal loads; reports safety factor per segment | analytic beam and cable models first, FEM later |
| `power` | Energy source, conversion efficiency, waste heat | custom |
| `habitability` | Insolation vs distance, tidal effects, atmosphere and magnetosphere checks, simple energy-balance climate model; evaluates the rulebook appendix thresholds | custom |

Propulsion variants to support behind one interface: mass driver, ion or fusion exhaust, solar sail or reflector, gravity tractor, Lorentz-force arms. The chosen variant and its parameters come from `config/base.yaml`.

---

## 8. Coupler and run modes

Timescales span roughly ten orders of magnitude (arm motion in seconds, orbit over years, mission over 10,000 years). Do not run everything at the smallest step.

| Mode | What runs | Use |
|---|---|---|
| `averaged` | Orbit at macro steps (days to years). Arms replaced by a cached thrust map F(phase, configuration) | Full 10,000-year runs and sweeps |
| `windowed_full` | All drivers at native steps for short windows at chosen epochs | Builds the thrust map; verifies the averaged model |
| `stress` | Structure and multibody only, worst-case loads | Safety factor 1.5 check |

Per macro step (Strang splitting):

```
half step : power, propulsion   (book Exchanges)
full step : orbit               (reads net force from the ledger, integrates)
half step : propulsion, power
then      : structure, habitability, ledger.audit
```

The thrust map used in `averaged` mode must be built from `windowed_full` runs, and the report must state their agreement (target: thrust error under 1 percent). Without that, the fast path is unproven.

---

## 9. Configuration and honesty system

**`config/base.yaml`:** run mode, time span, macro step, driver list and parameters, propulsion variant (exhaust velocity, mass flow, power, efficiency), initial conditions, target orbit, random seed, output paths.

**`config/rulebook_thresholds.yaml`:** every threshold from the rulebook appendix, one place, evaluated by the validator each macro step so no driver can skip a check. (Placeholder until the appendix is available.)

**`config/hypothetical_enablers.yaml`:** at most three entries:

```yaml
enablers:
  - id: E1
    name: "Fusion power source"
    relaxes: ["power.max_watts"]          # quantities this enabler relaxes
    value: 5.0e21                          # assumed capability
    justification: "..."
    sources: ["..."]
```

**Flag handling:** every `Flag` records the driver and quantity that raised it. A `FlagRegistry` checks each flag against declared enablers. Flags explained by an enabler are allowed; anything else is unresolved and fails the run. The final report lists per winning condition: pass or fail, with evidence.

---

## 10. Interfaces to other layers

### 10.1 Python API (nanobind)

```python
import octo
result = octo.run(config_dict, mode="averaged")   # releases the GIL
result.flags          # list of flags with enabler links
result.conditions     # pass/fail per winning condition
result.metrics        # final orbit, energy and momentum drift, min safety factor, ...
```

Also provide a CLI: `octo_run config.yaml --out run_0042.parquet`, so sweeps can be distributed and a single run can be debugged without Python.

### 10.2 Run output

- **Results table (Parquet):** one row per run with inputs, key outputs, flags, pass/fail per condition. This is also the future surrogate training set.
- **Replay file (custom binary):** decimated snapshots for the frontend. Proposed schema (finalize with the frontend owner before implementing):
  - Header: magic `OCTO`, version, endianness, number of frames, number of bodies, number of arm segments, time unit, length unit, focus-body id.
  - Per frame: time, positions of bodies relative to the focus body (float32, already scaled), arm joint angles, per-segment safety factor, ledger totals (energy, momentum, angular momentum drift), flag count.
  - Flags and events in a trailing table.
- Do the unit scaling and floating-origin conversion **in C++**, so the frontend never sees raw 1e11 m values in float32.

### 10.3 Frontend (Three.js)

- Two scenes: a heliocentric orbit view and an Earth-centred ring and arms view. Switch between them; no single scale shows both.
- Use a logarithmic depth buffer.
- Panels: energy and momentum drift plots, live flag list, safety factor shown as colour along each arm, per-condition pass or fail table.
- Modes: **replay** (load a run file, scrub the timeline; build this first) and **live** (WebSocket binary frames as `Float32Array`-friendly layouts, with commands to pause, change config or jump to an epoch; practical only for `windowed_full`, or `averaged` at accelerated playback).
- Build it first against a mock replay file so it is not blocked on the core.

### 10.4 Experiments (Python)

- `sweep.py`: grid or Latin hypercube over exhaust velocity, power, arm length, thrust profile.
- `montecarlo.py`: perturb initial conditions and material strengths to show robustness.
- `optimize.py`: Optuna using the averaged simulator as the objective.
- `surrogate.py`: trains on sweep results, **suggests candidates only**. The final answer always comes from a full deterministic C++ run through the ledger.

---

## 11. Validation (the "code is validated" condition)

Every module needs closed-form or reference benchmarks, run in CI:

- Two-body energy conservation and Kepler period.
- Hohmann transfer 1 AU to 2.7 AU (dv about 11.0 km/s).
- Rocket equation and thrust-power cross-check.
- Beam deflection and Euler buckling formulas.
- Simple pendulum and a 2-link arm (multibody sanity).
- Lorentz force on a straight conductor in a uniform field.
- Ledger tests: a deliberately one-sided force must fail; energy, linear and angular momentum stay within tolerance on closed systems.
- Property-based tests (RapidCheck, hypothesis) for conservation under random configs.
- Timestep convergence studies and bit-reproducibility test (same config, same output).

The official benchmark list (not yet seen) must be added to this set and mapped one to one in the report.

---

## 12. Build order

1. `core/` (state, units, exchange, ledger, flags, recorder skeleton) with tests, including the one-sided-force failure test. Agree the replay file schema with the frontend.
2. `orbit` driver (REBOUND) plus the Hohmann benchmark. **First milestone:** a Hohmann run through the coupler, ledger passing, written to a replay file and shown in the frontend.
3. `propulsion` driver with the rocket-equation and thrust-power cross-checks, plus `hypothetical_enablers.yaml` and the flag registry.
4. `structure` driver with beam and buckling benchmarks, then `em`.
5. `multibody` driver and the thrust-map builder (`windowed_full`).
6. `power` and `habitability` drivers, then the rulebook threshold validator.
7. `averaged` mode in the coupler with the thrust-map agreement report.
8. Python bindings and experiments layer.
9. Live WebSocket server.
10. Final report generator: pass or fail per winning condition, with flags and enabler links.

Parallel work is possible once the headers in section 6 and the replay schema are fixed: core and ledger, orbit and propulsion, multibody/structure/em, Python experiments, and frontend can proceed in parallel.

---

## 13. Open questions (need a human answer before or during the build)

1. Rulebook appendix: the actual thresholds and units.
2. Benchmark list and any required reference implementations.
3. Section 7 wording on hypothetical enablers and what counts as an "unresolved flag".
4. Required submission format, entry points or interfaces (does the organizer expect a specific API or CLI?).
5. Which propulsion concept the team chooses (decision planned at hour 4 of the schedule) and its parameters.
6. Target orbit specification: exact semi-major axis, eccentricity tolerance, and what "reaches" means.
7. Whether the Moon must be kept with Earth and how habitability is scored.
8. Team size and who owns which driver.

---

## 14. Status

This is a design, not working code. Nothing here has been compiled or run. Numbers in section 2 were derived by hand and should be reproduced by tests before being relied on.
