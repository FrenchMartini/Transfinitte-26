# OrbitShift Physics Guide (Plain-Language Reference)

This document explains every equation used in the `physics/` package in plain language, along with its exact mathematical form and SI units.

---

## 1. Universal Constants (`physics/constants.py`)

All equations operate strictly in **SI units** (meters, kilograms, seconds, watts, kelvins):
- $G = 6.67430 \times 10^{-11}\text{ m}^3\text{ kg}^{-1}\text{ s}^{-2}$: Newton's gravitational constant.
- $M_\odot = 1.98847 \times 10^{30}\text{ kg}$: Mass of the Sun.
- $M_\oplus = 5.9722 \times 10^{24}\text{ kg}$: Initial mass of the Earth.
- $\mu_\odot = G M_\odot \approx 1.3271244 \times 10^{20}\text{ m}^3\text{ s}^{-2}$: Solar standard gravitational parameter (combines $G$ and $M_\odot$ for convenience).
- $\text{AU} = 1.495978707 \times 10^{11}\text{ m}$: Average Earth-Sun distance (1 Astronomical Unit).
- $\text{YEAR} = 31,557,600\text{ s}$: One Julian year ($365.25 \times 86,400\text{ s}$).

---

## 2. Gravity (`physics/gravity.py`)

### Gravitational Acceleration
The Sun pulls Earth inward toward the origin $(0, 0)$. The strength of gravity drops with the square of the distance $r = \|\mathbf{r}\|$:
$$\mathbf{a}_{\text{grav}}(\mathbf{r}) = -\frac{\mu_\odot}{\|\mathbf{r}\|^3}\,\mathbf{r} \quad [\text{m/s}^2]$$
- The minus sign means the pull points **toward** the Sun (opposite to position vector $\mathbf{r}$).
- Dividing $\mathbf{r}$ by $\|\mathbf{r}\|$ gives the unit direction vector $\hat{\mathbf{r}}$, and dividing by $\|\mathbf{r}\|^2$ gives the inverse-square magnitude $\mu_\odot / r^2$.

### Gravitational Force
By Newton's Second Law, the force on Earth (of mass $m$) is:
$$\mathbf{F}_{\text{grav}}(\mathbf{r}, m) = m\,\mathbf{a}_{\text{grav}}(\mathbf{r}) \quad [\text{N}]$$
By Newton's Third Law, Earth pulls the Sun with the exact opposite force $-\mathbf{F}_{\text{grav}}$.

---

## 3. Orbital Elements (`physics/orbital_elements.py`)

### Circular Velocity
For a planet to stay in a perfect circle of radius $r$, its centrifugal tendency ($v^2 / r$) must exactly balance the Sun's inward gravity ($\mu_\odot / r^2$):
$$v_{\text{circ}}(r) = \sqrt{\frac{\mu_\odot}{r}} \quad [\text{m/s}]$$
At $r = 1\text{ AU}$, $v_{\text{circ}} \approx 29,784.69\text{ m/s}$ ($\approx 29.78\text{ km/s}$).

### Kepler's Third Law (Orbital Period)
The time $T$ required to complete one full orbit depends only on the orbit's average size—its **semi-major axis** $a$:
$$T(a) = 2\pi \sqrt{\frac{a^3}{\mu_\odot}} \quad [\text{s}]$$
Larger orbits are both longer and slower, so orbital period grows as $a^{3/2}$.

### Specific Orbital Energy
"Specific" means **per kilogram of planet mass**. It is the sum of kinetic energy (motion) and potential energy (gravity):
$$\epsilon(\mathbf{r}, \mathbf{v}) = \frac{\|\mathbf{v}\|^2}{2} - \frac{\mu_\odot}{\|\mathbf{r}\|} \quad [\text{J/kg}]$$
- A negative value ($\epsilon < 0$) means Earth is gravitationally bound to the Sun.
- Without thrust, $\epsilon$ stays strictly constant along the entire orbit.

### Semi-Major Axis from Energy
The average orbital radius $a$ is directly tied to the specific orbital energy:
$$a = -\frac{\mu_\odot}{2\epsilon} \quad [\text{m}]$$

### Specific Angular Momentum
Angular momentum measures rotational sweep around the Sun. In 2D $(x, y)$, the out-of-plane specific angular momentum is:
$$h_z(\mathbf{r}, \mathbf{v}) = x v_y - y v_x \quad [\text{m}^2/\text{s}]$$
When no external torque acts on Earth, $h_z$ is constant (Kepler's Second Law: equal areas swept in equal times).

### Eccentricity Vector and Eccentricity
Eccentricity $e$ measures how stretched an orbit is ($e = 0$ is a perfect circle; $0 < e < 1$ is an ellipse; $e \ge 1$ escapes the Sun):
$$\mathbf{e} = \frac{\left(\|\mathbf{v}\|^2 - \frac{\mu_\odot}{\|\mathbf{r}\|}\right)\mathbf{r} - (\mathbf{r}\cdot\mathbf{v})\mathbf{v}}{\mu_\odot}, \qquad e = \|\mathbf{e}\| \quad [\text{dimensionless}]$$
The vector $\mathbf{e}$ always points from the Sun toward perihelion (the closest point of the orbit).

### Analytic Hohmann Transfer
A Hohmann transfer is the theoretical two-impulse ellipse connecting an inner circular orbit $r_1$ to an outer circular orbit $r_2$:
1. Transfer semi-major axis: $a_t = \frac{r_1 + r_2}{2}$
2. First velocity boost at $r_1$: $\Delta v_1 = \sqrt{\mu_\odot \left(\frac{2}{r_1} - \frac{1}{a_t}\right)} - \sqrt{\frac{\mu_\odot}{r_1}}$
3. Second velocity boost at $r_2$: $\Delta v_2 = \sqrt{\frac{\mu_\odot}{r_2}} - \sqrt{\mu_\odot \left(\frac{2}{r_2} - \frac{1}{a_t}\right)}$
4. Coast time (half an ellipse period): $t_{\text{transfer}} = \pi \sqrt{\frac{a_t^3}{\mu_\odot}}$

---

## 4. Propulsion & Equations of Motion (`physics/propulsion.py`, `physics/integrator.py`)

We evolve the 5-element state vector $\mathbf{y}(t) = [x, y, v_x, v_y, m]^T$ in time using SciPy's 8th-order Dormand-Prince Runge-Kutta integrator (`DOP853`) with relative tolerance `rtol = 1e-12`:
$$\frac{d\mathbf{r}}{dt} = \mathbf{v}, \qquad \frac{d\mathbf{v}}{dt} = \mathbf{a}_{\text{grav}}(\mathbf{r}) + \frac{\mathbf{F}_{\text{thrust}}(t, \mathbf{r}, \mathbf{v}, m)}{m}, \qquad \frac{dm}{dt} = -\dot{m}$$
where $\mathbf{F}_{\text{thrust}}$ is the thrust vector $[\text{N}]$ and $\dot{m}$ is the propellant mass flow rate $[\text{kg/s}]$.
