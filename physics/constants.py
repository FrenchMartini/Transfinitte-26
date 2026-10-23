"""Universal physical constants in SI units.

Central rule: ONLY universal physical constants belong here.
No rulebook limits, tolerances, or design parameters may be placed in this file.
"""

# Newtonian constant of gravitation [m^3 kg^-1 s^-2] (CODATA 2018)
G: float = 6.67430e-11

# Solar mass [kg] (IAU 2015 nominal solar mass parameter / G)
M_SUN: float = 1.98847e30

# Earth mass [kg] (IAU 2015 nominal terrestrial mass parameter / G)
M_EARTH: float = 5.9722e24

# Lunar mass [kg]
M_MOON: float = 7.342e22

# Mean Earth-Moon distance [m]
R_EARTH_MOON: float = 3.844e8

# Earth mean radius [m] (IAU nominal equatorial/mean radius)
R_EARTH: float = 6.371e6

# Astronomical Unit [m] (IAU 2012 exact definition)
AU: float = 1.495978707e11

# Julian year [s] (365.25 days * 86400 s/day)
YEAR: float = 31557600.0

# Standard solar gravitational parameter [m^3 s^-2]
MU_SUN: float = G * M_SUN

# Nominal total solar irradiance at 1 AU [W m^-2] (IAU 2015 nominal)
SOLAR_CONSTANT_1AU: float = 1361.0

# Stefan-Boltzmann constant [W m^-2 K^-4]
SIGMA_SB: float = 5.670374419e-8

# Earth Bond albedo [dimensionless]
EARTH_BOND_ALBEDO: float = 0.30
