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
Jet kinetic power at efficiency $\eta$ satisfies:
$$P_{\text{in}} = \frac{\frac{1}{2}\dot{m} v_e^2}{\eta} = \frac{F v_e}{2\eta} \quad [\text{W}]$$
