"""Universal physical constants in SI units.

Central rule: ONLY universal physical constants belong in this file.
No rulebook limits, benchmark tolerances, or design parameters may appear here.

Sources:
- IAU 2015 Resolution B3 (Prsa et al., 2016, AJ 152, 41): nominal solar and
  planetary conversion constants (GM_SUN, R_EARTH, SOLAR_CONSTANT_1AU).
- IAU 2012 Resolution B2: exact definition of the Astronomical Unit (AU).
- IAU 1994 Style Manual: Julian year definition (YEAR = 365.25 * 86400 s).
- CODATA 2018 / 2022 internationally recommended values (Tiesinga et al.,
  2021, Rev. Mod. Phys. 93, 025010): Newtonian constant of gravitation (G),
  speed of light in vacuum (C_LIGHT), Stefan-Boltzmann constant (SIGMA_SB).
"""

import math

# Nominal solar mass parameter GM_sun [m^3 s^-2]
# Source: IAU 2015 Resolution B3 nominal value (1.3271244e20; JPL DE440: 1.32712440018e20)
GM_SUN: float = 1.32712440018e20

# Alias for compatibility with standard astrodynamics notation
MU_SUN: float = GM_SUN

# Newtonian constant of gravitation [m^3 kg^-1 s^-2]
# Source: CODATA 2018 / 2022 recommended value
G: float = 6.67430e-11

# Solar mass [kg]
# Source: IAU 2015 nominal GM_SUN / CODATA 2018 G
M_SUN: float = 1.98847e30

# Earth mass [kg]
# Source: IAU 2015 nominal GM_earth (3.986004e14 m^3 s^-2) / CODATA 2018 G
M_EARTH: float = 5.9722e24

# Lunar mass [kg]
# Source: NASA JPL Planetary and Lunar Ephemerides DE440 (GM_moon / G)
M_MOON: float = 7.342e22

# Mean Earth-Moon semi-major axis [m]
# Source: NASA JPL Lunar Laser Ranging nominal mean distance
R_EARTH_MOON: float = 3.844e8

# Nominal Earth volumetric mean radius [m]
# Source: IAU/IUGG nominal mean radius of Earth
R_EARTH: float = 6.371e6

# Astronomical Unit [m]
# Source: IAU 2012 Resolution B2 (exact definition)
AU: float = 1.495978707e11

# Julian year [s]
# Source: IAU standard Julian year (365.25 days * 86400 s/day, exact)
YEAR: float = 31557600.0

# Speed of light in vacuum [m s^-1]
# Source: SI / CODATA exact definition
C_LIGHT: float = 299792458.0

# Nominal solar luminosity L_sun [W]
# Source: Participant Guide Section 3 (Page 6) / IAU 2015 Resolution B3
L_SUN: float = 3.828e26

# Solar constant (total solar irradiance) at 1 AU [W m^-2]
# Source: Participant Guide Section 2.5 (Page 5): S = L_sun / (4 * pi * AU^2)
SOLAR_CONSTANT_1AU: float = L_SUN / (4.0 * math.pi * (AU**2))

# Stefan-Boltzmann constant [W m^-2 K^-4]
# Source: CODATA 2018 exact derived value from h, c, k_B
SIGMA_SB: float = 5.670374419e-8

# Earth Bond albedo [dimensionless]
# Source: Participant Guide Section 6 Benchmark 10 (Page 9)
EARTH_BOND_ALBEDO: float = 0.306
