import { describe, it, expect } from 'vitest';
import mockData from '../mock/replay_mock.json';
import { interpolateFrame } from '../interpolation';
import { computeHudAnalytics } from '../hud';
import {
  computeKeplerianOrbitPosition,
  computeAxialRotationAngle,
  computeOrbitalSpeedKmS,
  computeDeltaVKmS,
  computeMigrationProgressPct,
  computeKeplerianPeriod,
  computeEnergyDelivered,
  computeInsolationAndTemp,
  computeQuarryShrinkage,
  computeTugVisualPosition,
  computeStatiteStandoff,
  checkConservationLedger,
  clampPlaybackSpeed,
  rampPlaybackSpeed
} from '../utils/simMath';
import {
  YEAR_SECONDS,
  EARTH_ROTATION_PERIOD_SECONDS,
  VENUS_ROTATION_PERIOD_SECONDS,
  JUPITER_ROTATION_PERIOD_SECONDS,
  AU_METERS,

  GM_SUN,
  M_EARTH,
  SOLAR_LUMINOSITY_W,
  QUARRY_INITIAL_MASS_KG,
  QUARRY_INITIAL_RADIUS_KM
} from '../config';

describe('simMath Golden Unit Tests (25 Timestamps from t=0 to Final Year)', () => {
  const frames = mockData.frames;
  const duration_s = frames[frames.length - 1].time_s;
  const timestamps = Array.from({ length: 25 }, (_, i) => (i / 24) * duration_s);

  it('1. Keplerian planetary orbit positions match legacy trigonometry at all 25 timestamps', () => {
    const planets = [
      { name: 'Mercury', r: 0.387, periodYr: 0.2408 },
      { name: 'Venus', r: 0.723, periodYr: 0.6152 },
      { name: 'Mars', r: 1.524, periodYr: 1.8808 },
      { name: 'Jupiter', r: 5.204, periodYr: 11.862 }
    ];

    timestamps.forEach((t) => {
      planets.forEach((p) => {
        const [x, y, z] = computeKeplerianOrbitPosition(p.r, p.periodYr, t);

        // Direct legacy formula verification
        const expectedTheta = (2.0 * Math.PI * t) / (p.periodYr * YEAR_SECONDS);
        const expectedX = p.r * Math.cos(expectedTheta);
        const expectedY = p.r * Math.sin(expectedTheta);

        expect(x).toBeCloseTo(expectedX, 9);
        expect(y).toBeCloseTo(expectedY, 9);
        expect(z).toBe(0.0);
        expect(Math.hypot(x, y)).toBeCloseTo(p.r, 9);
      });
    });
  });

  it('2. Deterministic axial spin angles match legacy phase formulas for prograde and retrograde bodies', () => {
    timestamps.forEach((t) => {
      // Earth (prograde)
      const earthAngle = computeAxialRotationAngle(t, EARTH_ROTATION_PERIOD_SECONDS);
      const earthPhase = ((t % 86400) + 86400) % 86400;
      const expectedEarth = (earthPhase / 86400) * 2 * Math.PI;
      expect(earthAngle).toBeCloseTo(expectedEarth, 8);

      // Venus (retrograde)
      const venusPeriod = VENUS_ROTATION_PERIOD_SECONDS;
      const venusAngle = computeAxialRotationAngle(t, venusPeriod);
      const absV = Math.abs(venusPeriod);
      const vPhase = ((t % absV) + absV) % absV;
      const expectedVenus = -(vPhase / absV) * 2 * Math.PI;
      expect(venusAngle).toBeCloseTo(expectedVenus, 8);

      // Jupiter (fast prograde)
      const jupAngle = computeAxialRotationAngle(t, JUPITER_ROTATION_PERIOD_SECONDS);
      expect(jupAngle).toBeGreaterThanOrEqual(0);
      expect(jupAngle).toBeLessThanOrEqual(2 * Math.PI + 1e-6);
    });
  });

  it('3. Telemetry analytics match legacy formulas across all 25 sampled timestamps', () => {
    timestamps.forEach((t) => {
      const frame = interpolateFrame(frames, t);
      const analytics = computeHudAnalytics(frame);

      const earth = frame.bodies['Earth'];
      const r_au = Math.hypot(earth.x, earth.y);
      const v_km_s = Math.hypot(earth.vx, earth.vy);

      // Vis-viva circular speed check
      const expectedSpeed = Math.sqrt(GM_SUN / (r_au * AU_METERS)) / 1000.0;
      const computedSpeed = computeOrbitalSpeedKmS(r_au);
      expect(computedSpeed).toBeCloseTo(expectedSpeed, 4);

      // Delta-v check
      const expectedDeltaV = 29.7847 - v_km_s;
      expect(analytics.delta_v_km_s).toBeCloseTo(expectedDeltaV, 4);
      expect(computeDeltaVKmS(v_km_s)).toBeCloseTo(expectedDeltaV, 4);

      // Migration progress % check
      const expectedProgress = Math.max(0, Math.min(100, ((r_au - 1.0) / (2.7 - 1.0)) * 100));
      expect(analytics.migration_progress_pct).toBeCloseTo(expectedProgress, 4);
      expect(computeMigrationProgressPct(r_au)).toBeCloseTo(expectedProgress, 4);

      // Keplerian period check
      const period = computeKeplerianPeriod(r_au);
      expect(analytics.orbital_period_yr).toBeCloseTo(period.period_yr, 4);
      expect(analytics.orbital_period_days).toBeCloseTo(period.period_days, 3);

      // Energy delivered & sun output days check
      const energy = computeEnergyDelivered(r_au);
      const mu_m = (GM_SUN * M_EARTH) / 2.0;
      const expectedEnergy = mu_m * (1.0 / AU_METERS - 1.0 / (r_au * AU_METERS));
      expect(energy.energy_j).toBeCloseTo(expectedEnergy, -20);
      expect(analytics.energy_delivered_j).toBeCloseTo(expectedEnergy, -20);

      // Insolation & thermal check
      const therm = computeInsolationAndTemp(r_au);
      const s0 = SOLAR_LUMINOSITY_W / (4.0 * Math.PI * AU_METERS * AU_METERS);
      expect(therm.insolation_w_m2).toBeCloseTo(s0 / (r_au * r_au), 2);
      expect(therm.equilibrium_temp_k).toBeCloseTo(254.0 * Math.pow(1.0 / r_au, 0.5), 2);

      // Quarry shrinkage check
      const spent_kg = frame.tug_telemetry?.propellant_spent_kg ?? 0;
      const quarry = computeQuarryShrinkage(spent_kg);
      const expectedRemainKg = Math.max(0, QUARRY_INITIAL_MASS_KG - spent_kg);
      expect(quarry.remaining_kg).toBeCloseTo(expectedRemainKg, -10);
      expect(quarry.radius_km).toBeLessThanOrEqual(QUARRY_INITIAL_RADIUS_KM);
    });
  });

  it('4. Statite standoff formula matches legacy scaling bounds', () => {
    // 1.0 AU
    expect(computeStatiteStandoff(1.0)).toBeCloseTo(1.25, 4);
    // Intermediate unclamped value at 1.4 AU: 1.25 * (1.4)^(1/3) ~ 1.3983
    const d14 = 1.25 * Math.pow(1.4, 1.0 / 3.0);
    expect(computeStatiteStandoff(1.4)).toBeCloseTo(d14, 4);
    // At 2.7 AU: clamped to 1.50
    expect(computeStatiteStandoff(2.7)).toBe(1.50);
    // Lower bound clamp (>= 1.10)
    expect(computeStatiteStandoff(0.1)).toBe(1.10);
    // Upper bound clamp (<= 1.50)
    expect(computeStatiteStandoff(10.0)).toBe(1.50);
  });


  it('5. Tug visual standoff computes exact 1.4 unit forward offset along direction vector', () => {
    const earthPos: [number, number, number] = [10, 0, 0];
    const dir: [number, number, number] = [0, 0, -1];
    const tugPos = computeTugVisualPosition(earthPos, dir, 1.4);
    expect(tugPos[0]).toBe(10);
    expect(tugPos[1]).toBe(0);
    expect(tugPos[2]).toBe(-1.4);
  });

  it('6. Conservation ledger test respects 10^-9 tolerance', () => {
    expect(checkConservationLedger(1e-10, -5e-10)).toBe(true);
    expect(checkConservationLedger(1e-8, 0)).toBe(false);
    expect(checkConservationLedger(0, 2e-9)).toBe(false);
  });

  it('7. Speed clamping and smooth ramping behavior', () => {
    expect(clampPlaybackSpeed(0.0001)).toBeCloseTo(1.0 / 365.25, 6);
    expect(clampPlaybackSpeed(1000)).toBe(500.0);
    expect(clampPlaybackSpeed(10.0)).toBe(10.0);

    // Ramping moves towards target smoothly without overshoot
    const r1 = rampPlaybackSpeed(1.0, 10.0, 0.016);
    expect(r1).toBeGreaterThan(1.0);
    expect(r1).toBeLessThan(10.0);
  });
});
