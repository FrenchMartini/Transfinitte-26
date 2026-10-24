# Octo-Earth Physics Guide (Plain-Language Reference)

This document explains every equation used in the `octo` package in plain language, along with its exact mathematical form and SI units.

---

## 1. Universal Constants (`octo/core/constants.py`)

All equations operate strictly in **SI units** (meters, kilograms, seconds, watts, kelvins):
- $GM_\odot = 1.32712440018 \times 10^{20}\text{ m}^3\text{ s}^{-2}$: Standard solar gravitational parameter (IAU 2015 Resolution B3 / JPL DE440).
- $G = 6.67430 \times 10^{-11}\text{ m}^3\text{ kg}^{-1}\text{ s}^{-2}$: Newton's gravitational constant (CODATA 2018 / 2022).
- $M_\odot = 1.98847 \times 10^{30}\text{ kg}$: Mass of the Sun.
- $M_\oplus = 5.9722 \times 10^{24}\text{ kg}$: Initial mass of the Earth (IAU 2015 nominal).
- $R_\oplus = 6.371 \times 10^{6}\text{ m}$: Volumetric mean radius of the Earth.
- $\text{AU} = 1.495978707 \times 10^{11}\text{ m}$: 1 Astronomical Unit (IAU 2012 exact definition).
- $\text{YEAR} = 31,557,600\text{ s}$: One Julian year ($365.25 \times 86,400\text{ s}$).
- $c = 299,792,458\text{ m/s}$: Speed of light in vacuum (SI exact).
- $S_0 = 1361.0\text{ W/m}^2$: Nominal solar irradiance at 1 AU (IAU 2015 Resolution B3).

---

## 2. Gravity (`octo/drivers/orbit.py`)

### Gravitational Acceleration
The Sun pulls Earth inward toward the origin $(0, 0)$. The strength of gravity drops with the square of the distance $r = \|\mathbf{r}\|$:
$$\mathbf{a}_{\text{grav}}(\mathbf{r}) = -\frac{GM_\odot}{\|\mathbf{r}\|^3}\,\mathbf{r} \quad [\text{m/s}^2]$$
- The minus sign means the pull points **toward** the Sun (opposite to position vector $\mathbf{r}$).
- Dividing $\mathbf{r}$ by $\|\mathbf{r}\|$ gives the unit direction vector $\hat{\mathbf{r}}$, and dividing by $\|\mathbf{r}\|^2$ gives the inverse-square magnitude $GM_\odot / r^2$.

### Gravitational Force
By Newton's Second Law, the force on Earth (of mass $m$) is:
$$\mathbf{F}_{\text{grav}}(\mathbf{r}, m) = m\,\mathbf{a}_{\text{grav}}(\mathbf{r}) \quad [\text{N}]$$
By Newton's Third Law, Earth pulls the Sun with the exact opposite force $-\mathbf{F}_{\text{grav}}$.

---

## 3. Orbital Elements & Transfers (`octo/drivers/orbit.py`)

### Circular Velocity
For a planet to stay in a perfect circle of radius $r$, its centrifugal tendency ($v^2 / r$) must exactly balance the Sun's inward gravity ($GM_\odot / r^2$):
$$v_{\text{circ}}(r) = \sqrt{\frac{GM_\odot}{r}} \quad [\text{m/s}]$$
At $r = 1\text{ AU}$, $v_{\text{circ}} \approx 29.78\text{ km/s}$; at $r = 2.7\text{ AU}$, $v_{\text{circ}} \approx 18.13\text{ km/s}$.

### Kepler's Third Law (Orbital Period)
The time $T$ required to complete one full orbit depends only on the orbit's average size—its **semi-major axis** $a$:
$$T(a) = 2\pi \sqrt{\frac{a^3}{GM_\odot}} \quad [\text{s}]$$

### Specific Orbital Energy and Total Orbital Energy
"Specific" means **per kilogram of planet mass**. It is the sum of kinetic energy (motion) and potential energy (gravity):
$$\epsilon(\mathbf{r}, \mathbf{v}) = \frac{\|\mathbf{v}\|^2}{2} - \frac{GM_\odot}{\|\mathbf{r}\|} = -\frac{GM_\odot}{2a} \quad [\text{J/kg}]$$
Multiplying by the planet's mass $m$ gives total mechanical orbital energy:
$$E(a) = -\frac{GM_\odot m}{2a} \quad [\text{J}]$$

### Semi-Major Axis from Energy
$$a = -\frac{GM_\odot}{2\epsilon} \quad [\text{m}]$$

### Specific Angular Momentum
In 2D $(x, y)$, the out-of-plane specific angular momentum is:
$$h_z(\mathbf{r}, \mathbf{v}) = x v_y - y v_x \quad [\text{m}^2/\text{s}]$$

### Eccentricity Vector and Eccentricity
Eccentricity $e$ measures how stretched an orbit is ($e = 0$ is a perfect circle; $0 < e < 1$ is an ellipse):
$$\mathbf{e} = \frac{\left(\|\mathbf{v}\|^2 - \frac{GM_\odot}{\|\mathbf{r}\|}\right)\mathbf{r} - (\mathbf{r}\cdot\mathbf{v})\mathbf{v}}{GM_\odot}, \qquad e = \|\mathbf{e}\| \quad [\text{dimensionless}]$$

### Analytic Hohmann Transfer & Slow-Spiral $\Delta v$
Connecting an inner circular orbit $r_1$ to an outer circular orbit $r_2$:
1. Transfer semi-major axis: $a_t = \frac{r_1 + r_2}{2}$
2. First impulse at $r_1$: $\Delta v_1 = \sqrt{GM_\odot \left(\frac{2}{r_1} - \frac{1}{a_t}\right)} - \sqrt{\frac{GM_\odot}{r_1}}$
3. Second impulse at $r_2$: $\Delta v_2 = \sqrt{\frac{GM_\odot}{r_2}} - \sqrt{GM_\odot \left(\frac{2}{r_2} - \frac{1}{a_t}\right)}$
4. Coast duration (half an ellipse period): $t_{\text{transfer}} = \pi \sqrt{\frac{a_t^3}{GM_\odot}}$
5. Continuous low-thrust circle-to-circle spiral $\Delta v$:
$$\Delta v_{\text{spiral}} = \left|v_{\text{circ}}(r_1) - v_{\text{circ}}(r_2)\right| = \sqrt{\frac{GM_\odot}{r_1}} - \sqrt{\frac{GM_\odot}{r_2}}$$
For $1\text{ AU} \to 2.7\text{ AU}$, $\Delta v_{\text{Hohmann}} \approx 10.997\text{ km/s}$ and $\Delta v_{\text{spiral}} \approx 11.658\text{ km/s}$ ($\approx 11.7\text{ km/s}$).

---

## 4. Section 2 Energetics & Scaling Facts (`octo/drivers/orbit.py`)

### Orbital Energy Change ($\Delta E$)
Moving Earth from $a_1 = 1\text{ AU}$ ($E_1 \approx -2.65 \times 10^{33}\text{ J}$) to $a_2 = 2.7\text{ AU}$ ($E_2 \approx -0.98 \times 10^{33}\text{ J}$) requires adding mechanical energy:
$$\Delta E = E(a_2) - E(a_1) = \frac{GM_\odot M_\oplus}{2}\left(\frac{1}{a_1} - \frac{1}{a_2}\right) \approx +1.67 \times 10^{33}\text{ J}$$

### Average Power Over 10,000 Years
Spread uniformly over $\Delta t = 10,000\text{ years} = 3.15576 \times 10^{11}\text{ s}$:
$$P_{\text{avg}} = \frac{\Delta E}{\Delta t} \approx 5.29 \times 10^{21}\text{ W} \quad (\sim 5 \times 10^{21}\text{ W})$$

### Sunlight Radiation Pressure Force on Earth
Photons carry momentum $p = E / c$. The solar power intercepted by Earth's circular cross-section $\pi R_\oplus^2$ at 1 AU is $P_{\text{sun}} = S_0 \pi R_\oplus^2 \approx 1.74 \times 10^{17}\text{ W}$, exerting a direct radiation force:
$$F_{\text{rad}} = \frac{S_0}{c}\,\pi R_\oplus^2 \approx 5.79 \times 10^{8}\text{ N} \quad (\sim 6 \times 10^{8}\text{ N})$$

### Insolation Ratio
Solar flux drops with the inverse square of distance from the Sun:
$$\frac{S(r_1)}{S(r_2)} = \left(\frac{r_2}{r_1}\right)^2 = 2.7^2 = 7.29 \quad (\sim 7)$$

---

## 5. Propulsion & Equations of Motion (`octo/drivers/propulsion.py`, `octo/drivers/orbit.py`)

We evolve the state vector $\mathbf{y}(t) = [x, y, v_x, v_y, m]^T$ in time using `DOP853` (`rtol = 1e-12`):
$$\frac{d\mathbf{r}}{dt} = \mathbf{v}, \qquad \frac{d\mathbf{v}}{dt} = \mathbf{a}_{\text{grav}}(\mathbf{r}) + \frac{\mathbf{F}_{\text{thrust}}(t, \mathbf{r}, \mathbf{v}, m)}{m}, \qquad \frac{dm}{dt} = -\dot{m}$$
## 6. Conservation Ledger & Rocket-Exhaust Closure (`octo/core/ledger.py`)

### Newton's Third Law (Action-Reaction Pairing)
Every physical interaction is booked as an immutable `Exchange` between exerting component $a$ and receiving component $b$ ($a \neq b$). When $a$ exerts force $\mathbf{F}_{\text{on }b}$ on $b$ at inertial point $\mathbf{r}_p$, the `Ledger` automatically books the equal-and-opposite reaction on $a$:
$$\mathbf{F}_{\text{on }a} = -\mathbf{F}_{\text{on }b} \quad [\text{N}]$$
and the corresponding equal-and-opposite torques about the origin:
$$\boldsymbol{\tau}_{\text{on }b} = \mathbf{r}_p \times \mathbf{F}_{\text{on }b}, \qquad \boldsymbol{\tau}_{\text{on }a} = \mathbf{r}_p \times \mathbf{F}_{\text{on }a} = -\boldsymbol{\tau}_{\text{on }b} \quad [\text{N}\cdot\text{m}]$$
Because no public method exists to apply a force without booking an `Exchange`, the net internal force $\sum \mathbf{F}$ and net internal torque $\sum \boldsymbol{\tau}$ across all components are identically zero at every step.

### Expelled Mass, Momentum, and Kinetic Energy Closure
When a rocket or mass driver on body $b$ (moving at inertial velocity $\mathbf{v}_b$) expels reaction mass at rate $\dot{m}$ over timestep $\Delta t$ with exhaust velocity $\mathbf{v}_e$ relative to $b$:
1. **Expelled mass increment:**
$$\Delta m_{\text{ex}} = \dot{m}\,\Delta t \quad [\text{kg}]$$
2. **Inertial exhaust velocity:**
$$\mathbf{v}_{\text{ex, inertial}} = \mathbf{v}_b + \mathbf{v}_e \quad [\text{m/s}]$$
3. **Momentum carried by the exhaust:**
$$\Delta \mathbf{p}_{\text{ex}} = \Delta m_{\text{ex}}\,\mathbf{v}_{\text{ex, inertial}}, \qquad \Delta \mathbf{L}_{\text{ex}} = \mathbf{r}_p \times \Delta \mathbf{p}_{\text{ex}}$$
4. **Kinetic energy carried by the exhaust in the inertial frame:**
$$\Delta K_{\text{ex}} = \frac{1}{2}\,\Delta m_{\text{ex}}\,\|\mathbf{v}_{\text{ex, inertial}}\|^2 \quad [\text{J}]$$

### Independent State Audit (`Ledger.audit`)
To catch rogue drivers or numerical drift, `Ledger.audit(state, t)` never trusts running sums alone—it recomputes total system quantities directly from `State` and compares them against the initial baseline at $t = t_0$:
- **Mass Conservation:**
$$\frac{\left|\sum_i m_i(t) + M_{\text{expelled}}(t) - M_{\text{total}}(t_0)\right|}{M_{\text{total}}(t_0)} \le \varepsilon_{\text{mass}}$$
- **Linear Momentum Conservation:**
$$\frac{\left\|\sum_i m_i \mathbf{v}_i(t) + \mathbf{P}_{\text{exhaust}}(t) - \mathbf{P}_{\text{total}}(t_0)\right\|}{P_{\text{scale}}} \le \varepsilon_{\text{momentum}}$$
- **Angular Momentum Conservation:**
$$\frac{\left\|\sum_i \left(\mathbf{r}_i \times m_i \mathbf{v}_i(t) + \mathbf{L}_{\text{spin},i}(t)\right) + \mathbf{L}_{\text{exhaust}}(t) - \mathbf{L}_{\text{total}}(t_0)\right\|}{L_{\text{scale}}} \le \varepsilon_{\text{momentum}}$$
- **Total Energy Conservation:**
$$E_{\text{total}}(t) = \sum_i \frac{1}{2}m_i\|\mathbf{v}_i\|^2 - \sum_{i < j} \frac{G m_i m_j}{\|\mathbf{r}_i - \mathbf{r}_j\|} + E_{\text{stored}}(t) + E_{\text{heat}}(t) + E_{\text{radiated}}(t) + K_{\text{exhaust}}(t)$$
$$\frac{\left|E_{\text{total}}(t) - E_{\text{total}}(t_0)\right|}{E_{\text{scale}}} \le \varepsilon_{\text{energy}}$$
All sums use Python's exact floating-point accumulator (`math.fsum`) in a fixed deterministic order.

---

## 7. Climate Mirror Optics & Radiation Pressure (`octo/drivers/habitability.py`)

### Mirror Sizing & Geometry
To maintain Earth's solar insolation at $1\text{ AU}$ levels ($S_0 = 1361.166\text{ W/m}^2$) when Earth reaches $r = 2.700\text{ AU}$:
1. **Unmitigated solar flux at $2.7\text{ AU}$:**
   $$S_{\text{raw}}(2.7\text{ AU}) = \frac{S_0}{(2.7)^2} = \frac{1361.166}{7.29} \approx 186.72\text{ W/m}^2$$
2. **Deficit irradiance requiring supplementation:**
   $$\Delta S = S_0 - S_{\text{raw}} = 1361.166 - 186.72 = 1174.45\text{ W/m}^2$$
3. **Total supplemental power across Earth's cross-sectional disk ($\pi R_\oplus^2 = 1.2752 \times 10^{14}\text{ m}^2$):**
   $$P_{\text{deficit}} = \Delta S \times \pi R_\oplus^2 \approx 1.4976 \times 10^{17}\text{ W}$$
4. **Collector area sizing:**
   Positioned at the Earth-Sun L1 sub-solar point ($d_{L1} \approx r (M_\oplus / 3M_\odot)^{1/3} \approx 0.0100\,r$, $r_{\text{mirror}} = 2.673\text{ AU}$, $S_{\text{mirror}} \approx 190.50\text{ W/m}^2$), with specular reflectivity $R = 0.95$ and normal orientation $\theta = 0^\circ$:
   $$A_{\text{mirror}} = \frac{P_{\text{deficit}}}{S_{\text{mirror}}\,R\,\eta_{\text{capture}}} \approx \frac{1.4976 \times 10^{17}\text{ W}}{190.50\text{ W/m}^2 \times 0.95 \times 1.0} \approx 8.27 \times 10^{14}\text{ m}^2$$
   Using the conservative heliocentric distance $2.700\text{ AU}$ ($S \approx 186.72\text{ W/m}^2$) yields the adopted configuration area:
   $$A_{\text{mirror}} = \frac{1.4976 \times 10^{17}\text{ W}}{186.72\text{ W/m}^2 \times 0.95} = \mathbf{8.44 \times 10^{14}\text{ m}^2}$$

### Areal Density & Radiation Pressure Instability
For a gossamer reflective membrane of mass $M_{\text{mirror}} = 1.0 \times 10^{11}\text{ kg}$:
- **Areal density:**
  $$\sigma = \frac{M_{\text{mirror}}}{A_{\text{mirror}}} = \frac{1.0 \times 10^{11}\text{ kg}}{8.44 \times 10^{14}\text{ m}^2} \approx 1.185 \times 10^{-4}\text{ kg/m}^2 = \mathbf{0.1185\text{ g/m}^2}$$
- **Solar radiation force:**
  $$F_{\text{rad}} = \frac{S_{\text{mirror}} A_{\text{mirror}}}{c}\,(1 + R)\,\cos^2\theta \approx \frac{190.50 \times 8.44 \times 10^{14}}{2.9979 \times 10^8}\,(1 + 0.95) \approx \mathbf{1.045 \times 10^9\text{ N}}$$
- **Radiation acceleration:**
  $$a_{\text{rad}} = \frac{F_{\text{rad}}}{M_{\text{mirror}}} = \frac{1.045 \times 10^9\text{ N}}{1.0 \times 10^{11}\text{ kg}} \approx \mathbf{0.01045\text{ m/s}^2}$$
- **Solar gravity at mirror location ($r_{\text{mirror}} \approx 2.673\text{ AU}$):**
  $$g_\odot = \frac{GM_\odot}{r_{\text{mirror}}^2} = \frac{1.3271 \times 10^{20}}{(3.9987 \times 10^{11})^2} \approx \mathbf{8.300 \times 10^{-4}\text{ m/s}^2}$$
- **Acceleration ratio:**
  $$\frac{a_{\text{rad}}}{g_\odot} = \frac{0.01045}{0.0008300} \approx \mathbf{12.60} \quad (\text{or } \mathbf{12.85} \text{ at } 2.700\text{ AU})$$
Because outward radiation acceleration is $\sim 12.6 - 12.9\times$ stronger than the Sun's entire gravitational pull, a passive L1 orbit does not exist. Without active station-keeping propulsion, the mirror is blown away into deep space, raising `MIRROR_STATION_KEEPING_UNMODELLED`.

---

## 8. Tug Waste Heat Flux & Radiator View Factors (`octo/drivers/habitability.py`)

### Waste Heat Dissipation & Solid-Angle Geometry
- **Tug jet power:** $P_{\text{jet}} = (\gamma - 1)\dot{m}c^2 = 1.0847 \times 10^{25}\text{ W}$
- **Beamed input power:** $P_{\text{beam}} = 1.0956 \times 10^{25}\text{ W}$
- **Accelerator waste heat ($99.0\%$ efficiency):**
  $$P_{\text{waste}} = P_{\text{beam}} - P_{\text{jet}} \approx 1.085 \times 10^{23}\text{ W}$$
- **Equilibrium standoff distance:** $d_0 = 1.2701 \times 10^9\text{ m}$
- **Sky solid-angle fraction subtended by Earth:**
  $$f_{\text{sky}} = \frac{\pi R_\oplus^2}{4\pi d_0^2} = \frac{R_\oplus^2}{4 d_0^2} = \frac{(6.371 \times 10^6)^2}{4 (1.2701 \times 10^9)^2} \approx 6.290 \times 10^{-6}$$

### Unshielded vs Shielded Surface Flux
- **Unshielded incident flux on Earth:**
  $$F_{\text{waste, unshielded}} = \frac{P_{\text{waste}}}{4\pi d_0^2} = \frac{1.085 \times 10^{23}\text{ W}}{4\pi (1.2701 \times 10^9\text{ m})^2} \approx \mathbf{5,351\text{ W/m}^2}$$
  Because $5,351\text{ W/m}^2 > 5.0\text{ W/m}^2$ (the rulebook threshold `earth_safety.max_surface_waste_heat_w_m2`), unshielded isotropic waste radiation violates planetary habitability.
- **Sphere-average unshielded flux on Earth ($F/4$):**
  $$\bar{F}_{\text{waste, sphere}} = \frac{5,351\text{ W/m}^2}{4} \approx \mathbf{1,338\text{ W/m}^2}$$
- **Shielded incident flux (with attenuation $\tau = 1.0 \times 10^{-5}$):**
  $$F_{\text{waste, shielded}} = \tau\,F_{\text{waste, unshielded}} = 1.0 \times 10^{-5} \times 5,351 \approx \mathbf{0.05351\text{ W/m}^2} \quad (\text{sphere-average } \mathbf{0.01338\text{ W/m}^2}) \ll 5.0\text{ W/m}^2$$
- **Radiator View Factor Geometric Derivation:**
  For a planar radiator oriented edge-on toward Earth with area $A_{\text{rad}}$ and pointing error angle $\delta\theta$:
  The projected radiator area visible from Earth is $A_{\text{proj}} = A_{\text{rad}} \sin(\delta\theta) \approx A_{\text{rad}} \delta\theta$.
  To achieve geometric attenuation $\tau \le 1.0 \times 10^{-5}$, the radiator view factor requires:
  $$\delta\theta \le 1.0 \times 10^{-5}\text{ rad} \approx \mathbf{2.06\text{ arcseconds}}$$
  Because holding $2.06\text{ arcsecond}$ attitude precision across $10,000\text{ years}$ is an operational assumption, attenuation is maintained as `ASSUMED` in `config/rulebook_thresholds.yaml` and listed explicitly in report limitations.

