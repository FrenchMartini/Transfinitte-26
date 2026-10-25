import type { SimulationFrame } from './types';
import {
  AU_METERS,
  YEAR_SECONDS,
  TARGET_ORBIT_AU,
  TOTAL_MIGRATION_ENERGY_J,
  SOLAR_LUMINOSITY_W,
  NOMINAL_SPIRAL_DELTA_V_KM_S,
  NOMINAL_SPIRAL_FORCE_N,
  NOMINAL_AVERAGE_POWER_W,
  GM_SUN,
  M_EARTH,
  NOMINAL_MASS_FLOW_RATE_KG_S,
  QUARRY_INITIAL_MASS_KG,
  QUARRY_INITIAL_RADIUS_KM
} from './config';

export interface HudAnalytics {
  time_yr: number;
  time_gs: number;
  step_index: number;
  radius_au: number;
  radius_km: number;
  orbital_speed_km_s: number;
  delta_v_km_s: number;
  target_delta_v_km_s: number;
  migration_progress_pct: number;
  orbital_period_yr: number;
  orbital_period_days: number;
  is_thrusting: boolean;
  thrust_n: number;
  nominal_thrust_n: number;
  mass_flow_rate_kg_s: number;
  quarry_remaining_kg: number;
  quarry_remaining_pct: number;
  quarry_current_radius_km: number;
  quarry_radius_shrinkage_pct: number;
  tug_standoff_km: number;
  tug_standoff_hill_ratio: number;
  beam_power_w: number;
  nominal_power_w: number;
  fuel_spent_kg: number;
  fuel_spent_ceres_pct: number;
  energy_delivered_j: number;
  energy_target_j: number;
  sun_output_days: number;
  ledger_pass: boolean;
  energy_drift: number;
  momentum_drift: number;
  insolation_w_m2: number | null;
  unshielded_insolation_w_m2: number;
  equilibrium_temp_k: number;
  unshielded_temp_k: number;
  waste_heat_w_m2: number | null;
  moon_distance_km: number | null;
}

export function computeHudAnalytics(frame: SimulationFrame): HudAnalytics {
  const earth = frame.bodies['Earth'] || { x: 1.0, y: 0.0, z: 0.0, vx: 0.0, vy: 29.7847, vz: 0.0, mass_kg: 5.9722e24 };
  const r_au = Math.sqrt(earth.x * earth.x + earth.y * earth.y);
  const r_km = (r_au * AU_METERS) / 1000.0;
  const v_km_s = Math.sqrt(earth.vx * earth.vx + earth.vy * earth.vy);

  const v0_km_s = 29.7847;
  const delta_v_km_s = v0_km_s - v_km_s;

  const progress_pct = Math.max(0, Math.min(100, ((r_au - 1.0) / (TARGET_ORBIT_AU - 1.0)) * 100));

  const period_yr = Math.pow(r_au, 1.5);
  const period_days = period_yr * 365.25;

  const mu_m = (GM_SUN * M_EARTH) / 2.0;
  const energy_delivered_j = mu_m * (1.0 / AU_METERS - 1.0 / (r_au * AU_METERS));
  const sun_output_days = energy_delivered_j / (SOLAR_LUMINOSITY_W * 86400.0);

  const s0_1au_w_m2 = SOLAR_LUMINOSITY_W / (4.0 * Math.PI * AU_METERS * AU_METERS);
  const unshielded_insolation_w_m2 = s0_1au_w_m2 / (r_au * r_au);
  const unshielded_temp_k = 254.0 * Math.pow(1.0 / r_au, 0.5);

  const tug = frame.tug_telemetry;
  const thrust_n = tug?.thrust_n ?? 0.0;
  const is_thrusting = thrust_n > 1.0e10;

  const standoff_m = tug?.tug_earth_distance_m ?? 1.2701e9;
  const standoff_km = standoff_m / 1000.0;

  const hill_sphere_m = r_au * 1.497e9;
  const standoff_hill_ratio = standoff_m / hill_sphere_m;

  const fuel_spent_kg = tug?.propellant_spent_kg ?? 0.0;
  const fuel_spent_ceres_pct = (fuel_spent_kg / 9.4e20) * 100;

  const mass_flow_rate_kg_s = is_thrusting ? NOMINAL_MASS_FLOW_RATE_KG_S : 0.0;
  const quarry_remaining_kg = Math.max(0, QUARRY_INITIAL_MASS_KG - fuel_spent_kg);
  const quarry_remaining_pct = Math.max(0, 100.0 - fuel_spent_ceres_pct);
  const remaining_vol_frac = Math.max(0.01, 1.0 - fuel_spent_ceres_pct / 100.0);
  const quarry_current_radius_km = QUARRY_INITIAL_RADIUS_KM * Math.pow(remaining_vol_frac, 1.0 / 3.0);
  const quarry_radius_shrinkage_pct = (1.0 - Math.pow(remaining_vol_frac, 1.0 / 3.0)) * 100.0;

  const drifts = frame.ledger_drifts;
  const energy_drift = drifts?.energy ?? 0.0;
  const momentum_drift = drifts?.momentum ?? 0.0;
  const ledger_pass = Math.abs(energy_drift) < 1e-9 && Math.abs(momentum_drift) < 1e-9;

  const moon_km = frame.moon_distance_m ? frame.moon_distance_m / 1000.0 : 384400.0;

  return {
    time_yr: frame.time_s / YEAR_SECONDS,
    time_gs: frame.time_s / 1.0e9,
    step_index: frame.step_index,
    radius_au: r_au,
    radius_km: r_km,
    orbital_speed_km_s: v_km_s,
    delta_v_km_s,
    target_delta_v_km_s: NOMINAL_SPIRAL_DELTA_V_KM_S,
    migration_progress_pct: progress_pct,
    orbital_period_yr: period_yr,
    orbital_period_days: period_days,
    is_thrusting,
    thrust_n,
    nominal_thrust_n: NOMINAL_SPIRAL_FORCE_N,
    mass_flow_rate_kg_s,
    quarry_remaining_kg,
    quarry_remaining_pct,
    quarry_current_radius_km,
    quarry_radius_shrinkage_pct,
    tug_standoff_km: standoff_km,
    tug_standoff_hill_ratio: standoff_hill_ratio,
    beam_power_w: tug?.beam_power_w ?? 1.0e25,
    nominal_power_w: NOMINAL_AVERAGE_POWER_W,
    fuel_spent_kg,
    fuel_spent_ceres_pct,
    energy_delivered_j,
    energy_target_j: TOTAL_MIGRATION_ENERGY_J,
    sun_output_days,
    ledger_pass,
    energy_drift,
    momentum_drift,
    insolation_w_m2: frame.insolation_w_m2 ?? s0_1au_w_m2,
    unshielded_insolation_w_m2,
    equilibrium_temp_k: 254.0,
    unshielded_temp_k,
    waste_heat_w_m2: frame.waste_heat_w_m2 ?? 0.05,
    moon_distance_km: moon_km
  };
}

export function formatHudLines(stats: HudAnalytics): string[] {
  const lines = [
    '=== D-ORBIT TELEMETRY HUD // CERES TUG ===',
    `r_Earth: ${stats.radius_au.toFixed(4)} AU`,
    `v_Earth: ${stats.orbital_speed_km_s.toFixed(3)} km/s`,
    `Thrust: ${stats.thrust_n.toExponential(3)} N`,
    `LEDGER_AUDIT: ${stats.ledger_pass ? 'PASS' : 'FAIL'}`,
  ];
  if (!stats.is_thrusting) {
    lines.push('STATUS: UNPOWERED BALLISTIC COAST');
  }
  return lines;
}
