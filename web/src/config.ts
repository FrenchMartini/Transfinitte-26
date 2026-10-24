/**
 * OrbitShift Viewer Configuration and Reference Parameters.
 *
 * Grounded in the Planetary Propulsion Simulation Hackathon Participant Guide (Oct 2026).
 */

// Universal Physical Constants (IAU 2012 / CODATA 2018)
export const AU_METERS = 1.495978707e11;
export const YEAR_SECONDS = 31557600.0;
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
