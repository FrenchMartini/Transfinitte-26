# Phase 3E: Architecture Decision Record v2 (ADR v2)

- **Date:** 2026-10-24
- **Supersedes:** `docs/architecture_decision.md` (retained in version history)
- **Primary References:** `Moving Earth Orbit Research.pdf`, `docs/new_research_validation.md`, `py/experiments/new_research_validation.py`, `results/new_research_validation.json`

---

## 1. Definitive Architecture Decision

We formally select **The Upgraded Standoff Gravity Tug with Out-of-Ecliptic Bi-Conical Plumes, Thermal Shadow Shielding, and Adaptive L1 Climate Mirror** (formerly categorized as Candidate F / Upgraded Shielded Swarm) as our **Primary Architecture**.

### The Decisive Comparison

| Architecture | 10,000-Yr Target | Momentum Mechanism | Power & Thermal Feasibility | Planetary / Lunar Safety | Enabler Compliance (Max 3) | Overall Verdict |
|---|---|---|---|---|---|---|
| **1. Upgraded Standoff Gravity Tug + L1 Mirror (Adopted)** | **PASS** ($e < 10^{-4}$) | Gravitational coupling ($2.21 \times 10^{17}\text{ N}$) + canted ($\pm 5^\circ\text{–}10^\circ$) $0.3c$ exhaust + beam photon push ($P/c$) | **PASS** ($1.02 \times 10^{25}\text{ W}$ Dyson beam; 5-layer specular shield cuts Earth flux to $< 10^{-4}$ solar constant) | **PASS** (Zero plume hit; tide $< 0.09\%$ Moon; $1361\text{ W/m}^2$ insolation held at $2.7\text{ AU}$) | **PASS** (3 enablers: Dyson beam, $0.3c$ thruster/shield, pre-positioned Ceres + L1 mirror) | **GO (Primary)** |
| **2. Lunar Gravity Tractor ("Moon-Tug")** | **PASS** (in principle) | Earth-Moon gravitational bond ($1.98 \times 10^{20}\text{ N}$) | **FAIL** (dumps $10^{23}\text{–}10^{25}\text{ W}$ directly into cis-lunar space) | **FAIL** (excites lunar librations; expels $1\%$ of lunar mass or requires hovering tractor over Moon) | **FAIL** (exceeds enablers; violates Moon retention / contamination rules) | **NO-GO** |
| **3. Bae Photonic Laser Thruster (PLT) Cavity** | **PASS** (in principle) | Resonant intracavity photon recycling ($S_{\text{amp}} = 250$) | **PASS** ($1.32 \times 10^{23}\text{ W}$) | **PASS** (no propellant) | **FAIL** (requires a mirror of radius $1,450,000\text{ km} = 228\,R_\oplus$, physically unbuildable) | **NO-GO** |
| **4. Active Star-Lifting Tug** | **PASS** | $0.3c$ neutral beam fed by solar coronal hydrogen | **PASS** | **PASS** | **FAIL** (requires building an unmodeled $10^{25}\text{ W}$ coronal magnetic scoop and $1\text{ AU}$ matter-beam transport) | **NO-GO** |
| **5. Earth-Ring Mechanical Thrusters** | **PASS** | Direct ring-mounted exhaust ($v_e = 3,000\text{ km/s}$) | **FAIL** (surface waste heat exceeds limit by $10^6\times$) | **FAIL** (crustal shear forces violate $\text{SF} \ge 1.5$) | **FAIL** | **NO-GO** |
| **6. Korycansky Asteroid Flyby Slingshots** | **FAIL** (requires 200 passes/yr) | Gravitational assists | **PASS** (Jovian energy) | **FAIL** (ejects Moon; extreme impact risk) | **FAIL** | **NO-GO** |

---

## 2. Answers to the Six Decision Gate Questions

### 1. Does the new research materially improve on the previous proposal?
**YES.** The PDF solves the four fatal engineering bottlenecks we identified in Phase 3:
- It eliminates the lunar destruction and Earth contamination risks by establishing the **$\pm 5.0^\circ$ out-of-ecliptic bi-conical canting geometry** ($z_{\text{beam}} = 1.137 \times 10^8\text{ m} > 3.3\,z_{M,\max}$).
- It solves the thermal sterilization crisis via **directional edge-on radiators and a 5-layer specular shadow shield**.
- It identifies the **radial photon push ($F_r = 3.336 \times 10^{16}\text{ N}$)** from the incoming power beam and provides the exact yaw-trim angle ($\psi_r = 8.70^\circ$) to balance it in the momentum ledger.
- It proves that the gravity tractor instability time constant is **$\tau = 19.21\text{ days}$**, verifying that standard non-stiff PID feedback controls the system cleanly.

### 2. Is the Moon-Tug actually more feasible, or does it simply move the unresolved propulsion problem elsewhere?
**It simply moves the problem elsewhere.** Pushing the Moon with $2.23 \times 10^{17}\text{ N}$ avoids importing Ceres, but it requires either mounting $10^{25}\text{ W}$ of thrusters on the Moon (sterilizing cis-lunar space with waste heat and vaporizing lunar regolith) or hovering an artificial tractor above the Moon (which re-creates the exact same tractor mass problem). Tugging Earth directly with an asteroid-mass body in deep space is far cleaner.

### 3. Is active star-lifting a defensible competition enabler or an unsupported assumption?
**It is an unsupported assumption.** While the Sun has ample mass, lifting $2.44 \times 10^9\text{ kg/s}$ of plasma from the solar gravity well and beaming it across $1\text{ AU}$ without divergence requires an unmodeled second mega-engineering project. The asteroid belt already contains $1.71 \times 10^{21}\text{ kg}$ in Ceres, Vesta, Pallas, and Hygiea—plenty to supply the $7.50 \times 10^{20}\text{ kg}$ propellant budget directly at the tug.

### 4. Which architecture has the strongest quantitative evidence?
**The Upgraded Standoff Gravity Tug (with Bi-Conical Out-of-Ecliptic Plumes, Thermal Shadow Shielding, and L1 Climate Mirror).** Every governing equation—gravitational pulling force, relativistic mass consumption, out-of-ecliptic plume clearance, and climate reflector aperture—is closed, verified, and backed by peer-reviewed literature cited in the document.

### 5. Which assumptions would make that recommendation fail?
1. If the competition judges disqualify the $10^{25}\text{ W}$ circumsolar beamed power array as exceeding the scope of Enabler 1.
2. If unneutralized ions in the exhaust beam suffer magnetic bending in the solar wind (prevented by specifying neutral atoms or coilgun-accelerated macroscopic pellets).
3. If the competition rulebook mandates that Ceres remain completely untouched in its native orbit.

### 6. Should we begin the orbit simulator now, run another analytical calculation first, or reject the proposed architectures?
**BEGIN THE ORBIT SIMULATOR NOW (Step 3).**
The theoretical feasibility phase is completely closed. The physics is sound, the control equations are defined, the plume geometry is validated, and the 44 existing unit tests are green. We are ready to implement the coupler and N-body orbit driver.
