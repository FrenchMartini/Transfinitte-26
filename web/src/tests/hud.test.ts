import { describe, it, expect } from 'vitest';
import { computeHudAnalytics, formatHudLines } from '../hud';
import type { SimulationFrame } from '../types';

describe('Math Console / HUD Analytics', () => {
  const mockFrame: SimulationFrame = {
    time_s: 31557600.0 * 1000.0, // 1000 years
    step_index: 100,
    bodies: {
      Earth: { x: 1.10, y: 0.0, z: 0.0, vx: 0.0, vy: 28.40, vz: 0.0, mass_kg: 5.9722e24 },
      Tug: { x: 1.10, y: 0.00849, z: 0.0, vx: 0.0, vy: 28.40, vz: 0.0, mass_kg: 9.4e20 },
      Sun: { x: 0.0, y: 0.0, z: 0.0, vx: 0.0, vy: 0.0, vz: 0.0, mass_kg: 1.988e30 }
    },
    tug_telemetry: {
      thrust_n: 2.358e17,
      tug_earth_distance_m: 1.2701e9,
      beam_power_w: 1.0e25,
      beam_directions: [
        [0.0, -0.996195, 0.087156],
        [0.0, -0.996195, -0.087156]
      ],
      propellant_spent_kg: 7.88e19
    },
    ledger_drifts: {
      energy: 0.0,
      momentum: 0.0,
      angular_momentum: 0.0,
      mass: 0.0
    },
    insolation_w_m2: 1360.0,
    waste_heat_w_m2: 0.05,
    moon_distance_m: 3.844e8
  };

  it('computes accurate orbital and migration analytics', () => {
    const stats = computeHudAnalytics(mockFrame);

    expect(stats.radius_au).toBeCloseTo(1.10, 2);
    expect(stats.orbital_speed_km_s).toBeCloseTo(28.40, 2);
    // Migration progress: (1.10 - 1.0) / (2.7 - 1.0) = 0.10 / 1.70 ≈ 5.88%
    expect(stats.migration_progress_pct).toBeCloseTo(5.88, 1);
    // Delta v achieved: 29.78 - 28.40 = 1.38 km/s
    expect(stats.delta_v_km_s).toBeCloseTo(1.38, 1);
    expect(stats.is_thrusting).toBe(true);
    expect(stats.fuel_spent_ceres_pct).toBeCloseTo((7.88e19 / 9.4e20) * 100, 1);
  });

  it('formats Minecraft-like monospaced debug HUD lines', () => {
    const stats = computeHudAnalytics(mockFrame);
    const lines = formatHudLines(stats);

    expect(lines.some((l) => l.includes('D-ORBIT TELEMETRY'))).toBe(true);
    expect(lines.some((l) => l.includes('r_Earth: 1.1000 AU'))).toBe(true);
    expect(lines.some((l) => l.includes('v_Earth: 28.400 km/s'))).toBe(true);
    expect(lines.some((l) => l.includes('Thrust: 2.358e+17 N'))).toBe(true);
    expect(lines.some((l) => l.includes('LEDGER_AUDIT: PASS'))).toBe(true);
  });

  it('detects unpowered coast cutoff when thrust is zero', () => {
    const coastFrame: SimulationFrame = {
      ...mockFrame,
      tug_telemetry: {
        ...mockFrame.tug_telemetry!,
        thrust_n: 0.0
      }
    };

    const stats = computeHudAnalytics(coastFrame);
    expect(stats.is_thrusting).toBe(false);
    const lines = formatHudLines(stats);
    expect(lines.some((l) => l.includes('UNPOWERED BALLISTIC COAST'))).toBe(true);
  });
});
