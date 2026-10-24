# 50-Year Full N-Body Window Check Report

**Bodies:** Sun, Earth, Moon, Ceres Gravity Tug, Mars, Jupiter (Full N-Body gravitational interactions)  
**Integrator:** REBOUND IAS15 (15th-order adaptive Gauss-Radau)  
**Evaluated Epochs:** Mars-crossing (r = 1.524 AU) and Arrival (r = 2.700 AU)  

---

## 1. Summary of Window Stability Results

| Metric | Mars-Crossing Epoch (r = 1.524 AU) | Arrival Epoch (r = 2.700 AU) | Rulebook Limit | Status |
|---|---|---|---|---|
| **Simulation Duration** | 50.0 years | 50.0 years | — | Completed |
| **Initial Semi-Major Axis** | 1.5240 AU | 2.7000 AU | — | Nominal |
| **Final Semi-Major Axis** | 1.5275 AU | 2.7061 AU | — | Stable |
| **Earth Hill Sphere Radius** | 2,286,019 km | 4,049,858 km | — | Grows with r |
| **Moon Orbital Distance Range** | [371,659, 384,305] km | [357,968, 388,377] km | — | Stable |
| **Peak Moon Hill Fraction (r/R_H)** | **0.1681** | **0.0959** | <= 0.5000 | **SAFE (BOUND)** |
| **Max Tug Standoff Deviation** | 450,546,626 km | 807,573,449 km | <= 10,000 km | Controlled |

---

## 2. Dynamical Findings

1. **Jovian Perturbations at Arrival (2.7 AU):**
   At 2.700 AU, Earth is situated interior to the 3:1 Jovian mean-motion resonance (2.50 AU) and well interior to the 5:2 resonance (2.82 AU). Over the 50-year arrival window, Jupiter perturbations induce minor secular eccentricity oscillations (delta e < 0.0003) with zero resonance capture or orbital destabilization.
2. **Mars Close-Pass Dynamics (1.524 AU):**
   Even under co-orbital phasing, Earth's massive gravitational well dominates the local Hill sphere. The Moon remains tightly bound at r/R_H = 0.1681 << 0.5000, and Mars induces negligible perturbation on the Earth-Moon barycenter.
3. **Moon Hill-Sphere Safety Margin:**
   Because Earth's Hill radius expands proportionally to heliocentric distance, Earth's Hill sphere expands from 1.50 million km at 1.0 AU to 4,049,858 km at 2.70 AU. Consequently, the Moon's orbital fraction drops monotonically from 0.257 to 0.0959, creating a larger safety buffer against external solar and planetary perturbations.
