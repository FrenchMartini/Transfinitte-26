/**
 * OrbitShift Viewer Configuration and Reference Parameters.
 *
 * Grounded in the Planetary Propulsion Simulation Hackathon Participant Guide (Oct 2026).
 */

// Universal Physical Constants (IAU 2012 / CODATA 2018)
export const AU_METERS = 1.495978707e11;
export const YEAR_SECONDS = 31557600.0;
// Viewer convention: one axial turn per 24 simulated hours, epoch angle zero.
export const EARTH_ROTATION_PERIOD_SECONDS = 86400;
export const C_LIGHT = 299792458.0;
export const GM_SUN = 1.32712440018e20; // m^3/s^2
export const M_EARTH = 5.9722e24; // kg
export const M_CERES = 9.393e20; // kg nominal Ceres mass

// Astrodynamic Reference Rings (in AU per Guide Section 1 & Section 6 Benchmark 7)
export const TARGET_ORBIT_AU = 2.70; // Competition goal radius (Section 1: "from 1 AU out to about 2.7 AU near the asteroid belt")
export const MARS_ORBIT_AU = 1.524; // Mean semi-major axis of Mars (Section 6 Benchmark 7: "Hohmann 1 -> 1.524 AU")
export const ASTEROID_BELT_INNER_AU = 2.20; // Inner boundary of Main Asteroid Belt
export const ASTEROID_BELT_OUTER_AU = 3.20; // Outer boundary of Main Asteroid Belt
export const CERES_SEMI_MAJOR_AXIS_AU = 2.77; // Native Ceres semi-major axis

// Guide Section 3: "The numbers that decide everything"
export const TOTAL_MIGRATION_ENERGY_J = 1.7e33; // Section 3: Energy to raise Earth-Moon from 1 AU to 2.7 AU (~1.7 x 10^33 J)
export const SOLAR_LUMINOSITY_W = 3.828e26; // Section 3: Sun's entire output (3.828 x 10^26 W)
export const SUN_OUTPUT_DAYS_EQUIVALENT = 50.0; // Section 3: ~50 days of Sun's entire output
export const NOMINAL_SPIRAL_DELTA_V_KM_S = 11.6; // Section 3: Velocity change, slow spiral (~11.6 km/s)
export const HOHMANN_DELTA_V1_KM_S = 6.2; // Section 3: Hohmann transfer burn 1 (~6.2 km/s)
export const HOHMANN_DELTA_V2_KM_S = 4.8; // Section 3: Hohmann transfer burn 2 (~4.8 km/s)
export const HOHMANN_TOTAL_DELTA_V_KM_S = 11.0; // Section 3: Hohmann transfer total (~11.0 km/s)
export const NOMINAL_AVERAGE_POWER_W = 5.4e21; // Section 3: Average power to finish within 10,000 years (~5.4 x 10^21 W)
export const NOMINAL_SPIRAL_FORCE_N = 2.2e17; // Section 3: Constant force needed for that spiral (~2.2 x 10^17 N)
export const LORENTZ_FORCE_BENCHMARK_N = 60.0; // Section 3: 1 MA x 12,000 km x 5 nT (~60 N)

// Guide Section 2.5 & Section 6 Benchmark 10: Habitability & Thermal Physics
export const EARTH_ALBEDO = 0.306; // Section 6 Benchmark 10: Earth albedo
export const STEFAN_BOLTZMANN_SIGMA = 5.670374e-8; // W/(m^2 K^4)
export const EQUILIBRIUM_TEMP_1AU_K = 254.0; // Section 2.5 & Benchmark 10: ~254 K at 1 AU
export const EQUILIBRIUM_TEMP_2_7AU_K = 155.0; // Section 2.5: ~155 K at 2.7 AU unshielded
export const MAX_SURFACE_WASTE_HEAT_W_M2 = 5.0; // Section 7: Waste heat radiation limit

// Guide Section 1 & Section 6: Validation, Ledger & Integrity Constraints
export const MAX_SIMULATION_YEARS = 10000; // Winning Condition 1: Within 10,000 simulated years
export const MIN_STRUCTURAL_SAFETY_FACTOR = 1.5; // Winning Condition 3: Safety factor >= 1.5
export const CONSERVATION_TOLERANCE = 1.0e-9; // Section 6 Benchmarks 4, 5 & Ledger check: 10^-9
export const EARTH_MOON_PERIOD_DAYS = 365.256; // Section 6 Benchmark 6: 365.256 days
export const ASSUMED_BEAM_CANT_DEG = 5.0; // Dual out-of-ecliptic relativistic thruster exhaust canting (North/South)

// Visual Scene Scales (in Scene Units where 1 AU = 10 units for depth resolution)
export const SCENE_SCALE_AU = 10.0;

// Outer Ice Giants Orbits (in AU) & Periods (IAU / NASA Planetary Fact Sheets)
export const URANUS_ORBIT_AU = 19.191; // Mean semi-major axis of Uranus
export const NEPTUNE_ORBIT_AU = 30.069; // Mean semi-major axis of Neptune
export const URANUS_PERIOD_YR = 84.011; // Orbital period of Uranus in years
export const NEPTUNE_PERIOD_YR = 164.79; // Orbital period of Neptune in years

// Planetary Axial Rotation Periods in Seconds (IAU / NASA Planetary Fact Sheets)
export const MERCURY_ROTATION_PERIOD_SECONDS = 58.6462 * 86400.0; // 58.65 days
export const VENUS_ROTATION_PERIOD_SECONDS = -243.018 * 86400.0; // 243 days (retrograde)
export const MOON_ROTATION_PERIOD_SECONDS = 27.32166 * 86400.0; // 27.32 days (tidally locked)
export const MARS_ROTATION_PERIOD_SECONDS = 1.025957 * 86400.0; // 24.62 hours
export const JUPITER_ROTATION_PERIOD_SECONDS = 0.41354 * 86400.0; // 9.93 hours
export const SATURN_ROTATION_PERIOD_SECONDS = 0.44401 * 86400.0; // 10.66 hours
export const URANUS_ROTATION_PERIOD_SECONDS = -0.71833 * 86400.0; // 17.24 hours (retrograde, tilt 97.8 deg)
export const NEPTUNE_ROTATION_PERIOD_SECONDS = 0.67125 * 86400.0; // 16.11 hours (prograde, tilt 28.3 deg)
export const SUN_ROTATION_PERIOD_SECONDS = 27.0 * 86400.0; // 27 days differential equatorial

// Moon Orbital Periods in Seconds (IAU / NASA Fact Sheets)
export const PHOBOS_ORBIT_PERIOD_SECONDS = 0.31891 * 86400.0; // 7.65 hours
export const DEIMOS_ORBIT_PERIOD_SECONDS = 1.26244 * 86400.0; // 30.30 hours

export const IO_ORBIT_PERIOD_SECONDS = 1.769138 * 86400.0; // 1.77 days
export const EUROPA_ORBIT_PERIOD_SECONDS = 3.551181 * 86400.0; // 3.55 days
export const GANYMEDE_ORBIT_PERIOD_SECONDS = 7.154553 * 86400.0; // 7.15 days
export const CALLISTO_ORBIT_PERIOD_SECONDS = 16.689018 * 86400.0; // 16.69 days

export const TITAN_ORBIT_PERIOD_SECONDS = 15.94542 * 86400.0; // 15.95 days
export const ENCELADUS_ORBIT_PERIOD_SECONDS = 1.370218 * 86400.0; // 1.37 days
export const TETHYS_ORBIT_PERIOD_SECONDS = 1.887802 * 86400.0; // 1.89 days
export const RHEA_ORBIT_PERIOD_SECONDS = 4.517500 * 86400.0; // 4.52 days

export const TITANIA_ORBIT_PERIOD_SECONDS = 8.706 * 86400.0; // 8.71 days (Uranus)
export const OBERON_ORBIT_PERIOD_SECONDS = 13.463 * 86400.0; // 13.46 days (Uranus)
export const TRITON_ORBIT_PERIOD_SECONDS = -5.877 * 86400.0; // 5.88 days retrograde (Neptune)

// Playback Speed Units in Years Per Real Second
export const SPEED_DAY_YEARS_PER_SEC = 1.0 / 365.25; // ~0.002738 yr/s (1 day / real second)
export const SPEED_WEEK_YEARS_PER_SEC = 7.0 / 365.25; // ~0.019165 yr/s (1 week / real second)
export const SPEED_MONTH_YEARS_PER_SEC = 1.0 / 12.0; // ~0.083333 yr/s (1 month / real second)
export const SPEED_YEAR_YEARS_PER_SEC = 1.0; // 1.0 yr/s (1 year / real second)

export const MIN_PLAYBACK_SPEED_YEARS_PER_SEC = SPEED_DAY_YEARS_PER_SEC; // Min speed: 1 day/s
export const MAX_PLAYBACK_SPEED_YEARS_PER_SEC = 500.0; // Max speed: 500 yr/s
export const DEFAULT_PLAYBACK_SPEED_YEARS_PER_SEC = SPEED_MONTH_YEARS_PER_SEC; // Default: 1 month/s

// Relativistic Plasma Thruster & Quarry Asteroid Mining (Enabler E2/E3)
export const NOMINAL_MASS_FLOW_RATE_KG_S = 2.501e9; // 2,501,000 t/s (2.501 Mt/s)
export const RELATIVISTIC_EXHAUST_VELOCITY_KM_S = 89937.7; // 0.300 c
export const RELATIVISTIC_LORENTZ_GAMMA = 1.048285; // gamma = 1 / sqrt(1 - 0.3^2)
export const QUARRY_INITIAL_MASS_KG = 9.400e20; // 100% Ceres-mass reaction mass reserve
export const QUARRY_INITIAL_RADIUS_KM = 473.0; // Initial quarry mean radius
export const JET_KINETIC_POWER_W = 1.0847e25; // 2.83% L_sun
export const FLASH_VAPORIZATION_TEMP_K = 3000.0; // Silicate & water ice flash vaporization temperature

// Dual-Lagrange Hexagonal Heating Swarm & Statite Constants (Enabler E3)
export const L1_MIRROR_AREA_M2 = 8.44e14; // Gossamer reflector area
export const L1_MIRROR_RADIUS_KM = 16380.0; // Equivalent circular radius
export const L1_MIRROR_REFLECTIVITY = 0.95; // 95% specular reflectivity
export const L1_MIRROR_MASS_KG = 1.0e11; // 10^11 kg gossamer membrane (sigma = 0.1185 g/m^2)
export const L1_MIRROR_RADIATION_FORCE_N = 1.045e9; // Solar radiation pressure force on mirror
export const STATITE_TRIM_AUTHORITY = 0.25; // Electrochromic margin for propellantless solar tacking
export const L2_HALO_RADIUS_KM = 14000.0; // L2 Night-Side Swarm halo orbit radius (clears Earth shadow cone)
export const L2_NIGHT_FLUX_FRACTION = 0.35; // Reverse Earthshine night-side flux fraction preventing hyper-canes

// Out-of-Ecliptic Plume Canting Constants
export const PLUME_CANT_ANGLE_DEG = 5.0; // +/- 5.0 deg out of ecliptic
export const PLUME_COSINE_EFFICIENCY = 0.996195; // cos(5 deg)
export const PLUME_STANDOFF_CLEARANCE_KM = 110696.0; // Perpendicular clearance at standoff distance


