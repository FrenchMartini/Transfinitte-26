# Phase 3C: Architecture Decision Record (ADR)

- **Date:** 2026-10-24
- **Status:** Proposed for Implementation Approval (Pre-Step 3 Gate)
- **Supporting Analysis:** [`docs/architecture_options.md`](architecture_options.md), [`py/experiments/feasibility_audit.py`](../py/experiments/feasibility_audit.py), [`results/architecture_comparison.json`](../results/architecture_comparison.json)

---

## 1. Recommended Primary Architecture: Candidate F (Hybrid Detached Variable-$d(t)$ Canted Gravity Tug + Beamed Power + L1 Solar Concentrator)

We recommend selecting **Candidate F** (with **Candidate A**—the standalone variable-$d(t)$ canted Ceres Gravity Tug—as the direct fallback if the rulebook appendix waives or redefines outer-orbit insolation limits).

### Why Candidate F Is Physically Superior to All Alternatives
Moving Earth from $1.0\text{ AU}$ to $2.7\text{ AU}$ in $10,000\text{ years}$ requires adding $\Delta E = +1.668 \times 10^{33}\text{ J}$ of orbital energy ($\bar{P}_{\text{mech}} = 5.285 \times 10^{21}\text{ W}$) and $\Delta L = +1.712 \times 10^{40}\text{ kg}\cdot\text{m}^2/\text{s}$ of orbital angular momentum ($F_{\theta,\text{avg}} = 2.206 \times 10^{17}\text{ N}$, $J = 6.963 \times 10^{28}\text{ N}\cdot\text{s}$).

Any physically honest architecture faces a fundamental **trilemma**:
1. **The Conservation Bottleneck:** Momentum must be exchanged with reaction mass or external fields. The entire Sun's solar wind ($8.0 \times 10^{14}\text{ N}$) is $276\times$ too small, and asteroid gravity assists require $1.39 \times 10^{25}\text{ kg}$ ($2.33\,M_\oplus$ or $14,806$ Ceres passes at $1\text{ pass}/0.68\text{ yr}$), which is dynamically impossible. Thus, **high-exhaust-velocity reaction mass is mandatory**.
2. **The Thermal & Structural Bottleneck:** Generating $2.21 \times 10^{17}\text{ N}$ with reaction mass requires $10^{23}\text{–}10^{25}\text{ W}$ of jet power. Even a $0.1\%\text{–}1\%$ conversion loss releases $10^{21}\text{–}10^{23}\text{ W}$ of waste heat—which exceeds Earth's surface waste-heat limit ($5\text{ W/m}^2 \times 4\pi R_\oplus^2 = 2.55 \times 10^{15}\text{ W}$) by **$10^6\text{ to }10^8\times$** if operated on Earth or an Earth-hugging ring! Furthermore, applying $2.21 \times 10^{17}\text{ N}$ through a mechanical structure attached to Earth requires impossible material strength.
3. **The Gravitational Coupling Solution:** **Gravity is the only frictionless, zero-structural-stress, thermally isolated linkage capable of transmitting $2.21 \times 10^{17}\text{ N}$ to Earth's entire bulk mass simultaneously.** By placing the thruster on a detached Ceres-mass tug ($9.4 \times 10^{20}\text{ kg}$) at $d(t) = 0.50\text{–}1.30\text{ million km}$ ahead of Earth:
   - Earth feels a uniform body acceleration of $3.71 \times 10^{-8}\text{ m/s}^2$ (zero crustal stress; surface tide $< 0.09\%$ of the Moon's tide).
   - The $10^{25}\text{ W}$ power conversion and directional waste-heat radiators are isolated $0.5\text{–}1.3\text{ million km}$ in deep space.
   - Shrinking separation $d(t) = d_0 \sqrt{M_{\text{tug}}(t) / M_{\text{tug},0}}$ from $1.303 \times 10^9\text{ m}$ to $5.017 \times 10^8\text{ m}$ compensates for the $85\%$ propellant mass depletion of Ceres.
   - Canting the thrusters by $\phi = 10^\circ$ clears Earth and its magnetosphere by $14\text{–}36\,R_\oplus$ with only a $1.54\%$ cosine penalty ($M_{\text{prop}} = 7.50 \times 10^{20}\text{ kg} \le 8.0 \times 10^{20}\text{ kg}$ budget).
   - Adding a lightweight ($16,000\text{ km}$ radius, $\sim 8 \times 10^{11}\text{ kg}$) solar concentrator mirror at Earth–Sun L1 maintains $1,361\text{ W/m}^2$ insolation as $r$ increases from $1.0\text{ AU}$ to $2.7\text{ AU}$, preventing global glaciation.

---

## 2. Summary of Rejected Alternatives and Why They Are Weaker

1. **Naive Fixed-Distance Ceres Tug ($d = 1.3 \times 10^9\text{ m}$ constant, $\phi = 0^\circ$ axial exhaust) — REJECTED:**
   - Fails Winning Condition 1 (gravity drops $85\%$ as propellant is expelled, reaching only $1.65\text{ AU}$ in $10,000\text{ yr}$) and Winning Condition 2 ($\phi = 0^\circ$ exhaust hits Earth directly).
2. **Candidate B (Earth-Mounted Ring / Surface Mass Drivers or Fusion Rockets) — REJECTED:**
   - Fails Winning Condition 2 (`max_surface_waste_heat_w_m2`): dissipates $10^{21}\text{–}10^{22}\text{ W}$ inside Earth's environment ($10^6\times$ above the $2.55 \times 10^{15}\text{ W}$ global limit) and fails Winning Condition 3 (`min_safety_factor >= 1.5`) due to $2.21 \times 10^{17}\text{ N}$ structural bearing loads.
3. **Candidate C (Pure Directed Photon Momentum, $F = 2P/c$) — REJECTED:**
   - Requires $3.31 \times 10^{25}\text{ W}$ ($8.64\%\,L_\odot$) for single reflection; even $10^{-4}$ mirror absorption deposits $3.3 \times 10^{21}\text{ W}$ of heat into the mirror film.
4. **Candidate D (Standalone Solar Radiation Pressure / Mirror Array) — REJECTED as Primary Thruster:**
   - Because sunlight drops as $1/r^2$, completing the spiral in $10,000\text{ yr}$ requires $F_{\theta,1\text{AU}} = 6.46 \times 10^{17}\text{ N}$, demanding a mirror of radius $1.42\text{ AU}$ blocking $50.6\%$ of the entire Sun. (Retained only at a $1.8 \times 10^{-8}\times$ smaller scale as the $16,000\text{ km}$ climate mirror in Candidate F.)
5. **Candidate E (Asteroid Gravity Assists & Solar-Wind / IMF Lorentz Arms) — REJECTED:**
   - **Gravity assists:** Max impulse at the $2.5\,R_\oplus$ Roche limit is $5,003\text{ m/s}$ per kg, requiring $1.39 \times 10^{25}\text{ kg}$ ($14,806$ Ceres passes $= 1\text{ pass}/0.675\text{ yr}$), violating the $5.5\text{–}8.5\text{ yr}$ Earth–Jupiter orbital period and ejecting the Moon.
   - **Lorentz arms:** Pushing against Earth's internal dipole field produces **zero net force** by Newton's Third Law; pushing against the external solar wind / IMF ($B \approx 5\text{ nT}$) fails because the entire Sun's $4\pi$ solar wind momentum flux ($8.0 \times 10^{14}\text{ N}$) is $276\times$ smaller than $2.21 \times 10^{17}\text{ N}$.

---

## 3. Declared Hypothetical Enablers (3 of 3 Slots Used)

Candidate F cleanly maps onto the 3 permitted entries in [`config/hypothetical_enablers.yaml`](../config/hypothetical_enablers.yaml):
1. **`E1` — Solar-Statite / Dyson Beamed-Power Array (`1.05e25 W`):** Relaxes `power.max_watts`; books $-P_{\text{beam}}/c$ recoil on the emitter and $+P_{\text{beam}}/c$ on the tug.
2. **`E2` — Relativistic $0.3c$ Plasma Accelerator & Directional Radiator Shield:** Relaxes `propulsion.max_exhaust_velocity_m_s` and directs tug waste heat away from Earth so surface waste heat stays $< 5\text{ W/m}^2$.
3. **`E3` — Pre-Positioned Ceres Tug at $1\text{ AU}$ + L1 Solar Concentrator Mirror:** Accounts for initial capture of Ceres at $d_0 = 1.30 \times 10^9\text{ m}$ and maintains $1,361\text{ W/m}^2$ insolation on Earth out to $2.7\text{ AU}$.

---

## 4. Remaining Blockers & Three Most Important Unresolved Questions

1. **Rulebook Appendix Thresholds (`config/rulebook_thresholds.yaml`):** What are the official organizer values for `min_insolation_w_m2`, `min_equilibrium_temp_k`, `max_surface_waste_heat_w_m2`, and `target_radius_tolerance_au`? (Determines whether the L1 climate mirror in Candidate F is strictly required or if Candidate A suffices on its own.)
2. **Relativistic vs. Classical Ledger Convention (`octo/core/ledger.py`):** Should `Ledger.book()` include the special-relativistic Lorentz factor $\gamma = (1 - v_e^2/c^2)^{-1/2} = 1.04828$ for exhaust momentum ($\gamma \Delta m_0 \mathbf{v}_e$) and kinetic energy ($(\gamma - 1)\Delta m_0 c^2$), or does the competition benchmark expect classical Newtonian formulas ($\Delta m \mathbf{v}_e$ and $\frac{1}{2}\Delta m v_e^2$) everywhere? (Our design supports both via a config toggle.)
3. **Pluggable Driver Scope for Step 3–6:** Since our architecture in `octo/` is modular and driver-based, we can implement **Candidate F / Candidate A** as our winning mission profile while keeping the pluggable `propulsion` / `structure` / `em` / `multibody` drivers available so the simulator can also demonstrate *why* Candidates B–E fail honestly under the same `Ledger`.

---

## 5. Readiness to Proceed to Implementation

**Verdict: READY TO PROCEED TO STEP 3.**  
The analytical physics is closed, conservation paths are fully identified, and all existing 44 unit tests remain green. Once you approve this architecture decision, we will proceed to **Step 3** (Coupler + `rebound` N-body Orbit Driver + Hohmann Milestone, followed by the Candidate F / A Gravity Tug propulsion driver in Step 4).
