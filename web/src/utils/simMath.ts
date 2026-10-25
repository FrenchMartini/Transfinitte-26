/**
 * Pure mathematical functions for planetary ephemerides, astrodynamics,
 * thermal metrics, and simulation controls. Zero React or Three.js dependencies.
 */

import {
  AU_METERS,
  YEAR_SECONDS,
  TARGET_ORBIT_AU,
  GM_SUN,
  M_EARTH,
  SOLAR_LUMINOSITY_W,
  QUARRY_INITIAL_MASS_KG,
  QUARRY_INITIAL_RADIUS_KM,
  MIN_PLAYBACK_SPEED_YEARS_PER_SEC,
  MAX_PLAYBACK_SPEED_YEARS_PER_SEC
} from '../config';

/**
 * Computes circular Keplerian orbit position in ecliptic plane coordinates (AU).
 */
export function computeKeplerianOrbitPosition(
  r_au: number,
  periodYr: number,
  time_s: number
): [number, number, number] {
  const theta = (2.0 * Math.PI * time_s) / (periodYr * YEAR_SECONDS);
  return [r_au * Math.cos(theta), r_au * Math.sin(theta), 0.0];
}

/**
 * Deterministic axial rotation angle in radians for any body.
 * Preserves exact rotational phase across scrubbing, pausing, and reversing.
 */
export function computeAxialRotationAngle(time_s: number, period_s: number): number {
  if (period_s === 0) return 0;
  const absPeriod = Math.abs(period_s);
  const phase = ((time_s % absPeriod) + absPeriod) % absPeriod;
  const angle = (phase / absPeriod) * 2 * Math.PI;
  return period_s >= 0 ? angle : -angle;
}

/**
 * Vis-viva circular orbital speed in km/s at radius r_au.
 */
export function computeOrbitalSpeedKmS(r_au: number): number {
  if (r_au <= 0) return 0;
  const r_m = r_au * AU_METERS;
  return Math.sqrt(GM_SUN / r_m) / 1000.0;
}

/**
 * Delta-v delivered to spiral from initial circular speed at 1 AU.
 */
export function computeDeltaVKmS(current_v_km_s: number, v0_km_s = 29.7847): number {
  return v0_km_s - current_v_km_s;
}

/**
 * Migration progress percentage towards target radius (default 2.70 AU).
 */
export function computeMigrationProgressPct(r_au: number, target_r_au = TARGET_ORBIT_AU): number {
  return Math.max(0, Math.min(100, ((r_au - 1.0) / (target_r_au - 1.0)) * 100.0));
}

/**
 * Keplerian period in years and days for a given semi-major axis in AU.
 */
export function computeKeplerianPeriod(r_au: number): { period_yr: number; period_days: number } {
  const period_yr = Math.pow(Math.max(0, r_au), 1.5);
  return {
    period_yr,
    period_days: period_yr * 365.25
  };
}

/**
 * Gravitational potential energy delivered to raise Earth from 1 AU to r_au,
 * along with equivalent solar output duration in days.
 */
export function computeEnergyDelivered(r_au: number): { energy_j: number; sun_output_days: number } {
  if (r_au <= 0) return { energy_j: 0, sun_output_days: 0 };
  const mu_m = (GM_SUN * M_EARTH) / 2.0;
  const energy_j = mu_m * (1.0 / AU_METERS - 1.0 / (r_au * AU_METERS));
  const sun_output_days = energy_j / (SOLAR_LUMINOSITY_W * 86400.0);
  return { energy_j, sun_output_days };
}

/**
 * Inverse-square solar insolation and blackbody equilibrium temperature.
 */
export function computeInsolationAndTemp(r_au: number): {
  insolation_w_m2: number;
  equilibrium_temp_k: number;
} {
  if (r_au <= 0) return { insolation_w_m2: 0, equilibrium_temp_k: 0 };
  const s0_1au = SOLAR_LUMINOSITY_W / (4.0 * Math.PI * AU_METERS * AU_METERS);
  const insolation_w_m2 = s0_1au / (r_au * r_au);
  const equilibrium_temp_k = 254.0 * Math.pow(1.0 / r_au, 0.5);
  return { insolation_w_m2, equilibrium_temp_k };
}

/**
 * Quarry asteroid mass and physical radius shrinkage from propellant expenditure.
 */
export function computeQuarryShrinkage(propellant_spent_kg: number): {
  remaining_kg: number;
  remaining_pct: number;
  radius_km: number;
  shrinkage_pct: number;
} {
  const fuel_spent_ceres_pct = (propellant_spent_kg / 9.4e20) * 100.0;
  const remaining_kg = Math.max(0, QUARRY_INITIAL_MASS_KG - propellant_spent_kg);
  const remaining_pct = Math.max(0, 100.0 - fuel_spent_ceres_pct);
  const remaining_vol_frac = Math.max(0.01, 1.0 - fuel_spent_ceres_pct / 100.0);
  const radius_km = QUARRY_INITIAL_RADIUS_KM * Math.pow(remaining_vol_frac, 1.0 / 3.0);
  const shrinkage_pct = (1.0 - Math.pow(remaining_vol_frac, 1.0 / 3.0)) * 100.0;

  return {
    remaining_kg,
    remaining_pct,
    radius_km,
    shrinkage_pct
  };
}

/**
 * Visual tug standoff position placed ahead along orbital pulling vector.
 */
export function computeTugVisualPosition(
  earthPos: [number, number, number],
  pullDir: [number, number, number],
  standoff = 1.4
): [number, number, number] {
  const len = Math.hypot(pullDir[0], pullDir[1], pullDir[2]) || 1.0;
  const dx = pullDir[0] / len;
  const dy = pullDir[1] / len;
  const dz = pullDir[2] / len;
  return [earthPos[0] + dx * standoff, earthPos[1] + dy * standoff, earthPos[2] + dz * standoff];
}

/**
 * L1/L2 Statite standoff distance scaling with r_au.
 */
export function computeStatiteStandoff(r_au: number): number {
  return Math.max(1.10, Math.min(1.50, 1.25 * Math.pow(Math.max(0.1, r_au), 1.0 / 3.0)));
}

/**
 * Checks conservation law drift against rulebook 10^-9 tolerance.
 */
export function checkConservationLedger(
  energyDrift: number,
  momentumDrift: number,
  tolerance = 1.0e-9
): boolean {
  return Math.abs(energyDrift) < tolerance && Math.abs(momentumDrift) < tolerance;
}

/**
 * Clamps playback speed to supported range.
 */
export function clampPlaybackSpeed(speed: number): number {
  return Math.max(MIN_PLAYBACK_SPEED_YEARS_PER_SEC, Math.min(MAX_PLAYBACK_SPEED_YEARS_PER_SEC, speed));
}

/**
 * Smooth exponential playback rate ramping.
 */
export function rampPlaybackSpeed(current: number, target: number, dt: number): number {
  const alpha = Math.min(1.0, dt * 6.0);
  return current + (target - current) * alpha;
}
