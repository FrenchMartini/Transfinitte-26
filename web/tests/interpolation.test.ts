import { describe, it, expect } from 'vitest';
import { interpolateFrame, findBoundingFrames } from '../src/interpolation';
import { SimulationFrame } from '../src/types';

describe('Frame Interpolation', () => {
  const f0: SimulationFrame = {
    time_s: 0.0,
    step_index: 0,
    bodies: {
      Earth: { x: 1.0, y: 0.0, z: 0.0, vx: 0.0, vy: 30.0, vz: 0.0, mass_kg: 6e24 },
      Sun: { x: 0.0, y: 0.0, z: 0.0, vx: 0.0, vy: 0.0, vz: 0.0, mass_kg: 2e30 }
    },
    tug_telemetry: {
      thrust_n: 2.0e17,
      tug_earth_distance_m: 1.0e9,
      beam_power_w: 1e25,
      beam_directions: [[0, -1, 0]],
      propellant_spent_kg: 0.0
    },
    insolation_w_m2: 1361.0
  };

  const f1: SimulationFrame = {
    time_s: 100.0,
    step_index: 1,
    bodies: {
      Earth: { x: 1.1, y: 0.2, z: 0.0, vx: 1.0, vy: 29.0, vz: 0.0, mass_kg: 6e24 },
      Sun: { x: 0.0, y: 0.0, z: 0.0, vx: 0.0, vy: 0.0, vz: 0.0, mass_kg: 2e30 }
    },
    tug_telemetry: {
      thrust_n: 2.0e17,
      tug_earth_distance_m: 1.0e9,
      beam_power_w: 1e25,
      beam_directions: [[0, -1, 0]],
      propellant_spent_kg: 500.0
    },
    insolation_w_m2: 1350.0
  };

  const frames = [f0, f1];

  it('finds correct bounding frame indices', () => {
    expect(findBoundingFrames(frames, 0.0)).toEqual([0, 0, 0.0]);
    expect(findBoundingFrames(frames, 50.0)).toEqual([0, 1, 0.5]);
    expect(findBoundingFrames(frames, 100.0)).toEqual([1, 1, 0.0]);
    expect(findBoundingFrames(frames, -10.0)).toEqual([0, 0, 0.0]);
    expect(findBoundingFrames(frames, 200.0)).toEqual([1, 1, 0.0]);
  });

  it('interpolates positions and velocities linearly without computing physics', () => {
    const interpolated = interpolateFrame(frames, 50.0);
    expect(interpolated.time_s).toBe(50.0);

    const earth = interpolated.bodies['Earth'];
    expect(earth.x).toBeCloseTo(1.05, 5);
    expect(earth.y).toBeCloseTo(0.1, 5);
    expect(earth.vx).toBeCloseTo(0.5, 5);
    expect(earth.vy).toBeCloseTo(29.5, 5);

    expect(interpolated.tug_telemetry?.propellant_spent_kg).toBeCloseTo(250.0, 5);
    expect(interpolated.insolation_w_m2).toBeCloseTo(1355.5, 5);
  });

  it('clamps gracefully at boundaries', () => {
    const before = interpolateFrame(frames, -50.0);
    expect(before.time_s).toBe(0.0);
    expect(before.bodies['Earth'].x).toBe(1.0);

    const after = interpolateFrame(frames, 500.0);
    expect(after.time_s).toBe(100.0);
    expect(after.bodies['Earth'].x).toBe(1.1);
  });

  it('interpolates orbital trajectory around the Sun instead of cutting across in straight chords', () => {
    // Two frames 1 year apart (31557600 s) at r = 1 AU
    const frameA: SimulationFrame = {
      time_s: 0.0,
      step_index: 0,
      bodies: {
        Earth: { x: 1.0, y: 0.0, z: 0.0, vx: 0.0, vy: 29.78, vz: 0.0, mass_kg: 6e24 },
        Sun: { x: 0.0, y: 0.0, z: 0.0, vx: 0.0, vy: 0.0, vz: 0.0, mass_kg: 2e30 }
      }
    };
    const frameB: SimulationFrame = {
      time_s: 31557600.0, // 1 year
      step_index: 1,
      bodies: {
        Earth: { x: 1.0, y: 0.0, z: 0.0, vx: 0.0, vy: 29.78, vz: 0.0, mass_kg: 6e24 },
        Sun: { x: 0.0, y: 0.0, z: 0.0, vx: 0.0, vy: 0.0, vz: 0.0, mass_kg: 2e30 }
      }
    };

    // At t = 0.5 year (halfway through the orbit)
    // In Cartesian lerp: x = 1.0, y = 0.0 (stays completely frozen or cuts chord)
    // In orbital interpolation: Earth should be at the opposite side of the Sun: x ~ -1.0, y ~ 0.0!
    const mid = interpolateFrame([frameA, frameB], 31557600.0 * 0.5);
    const earth = mid.bodies['Earth'];
    expect(earth.x).toBeCloseTo(-1.0, 1);
    expect(earth.y).toBeCloseTo(0.0, 1);
    const r = Math.sqrt(earth.x * earth.x + earth.y * earth.y);
    expect(r).toBeCloseTo(1.0, 2);
  });
});
